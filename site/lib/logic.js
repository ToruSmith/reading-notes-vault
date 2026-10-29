/**
 * logic.js — 前端純邏輯（不碰 DOM，可在 node 測試）
 * 篩選、搜尋、書櫃統計、反向連結、內部連結轉換、Markdown 安全設定。
 * 公開與否一律由後端過濾；這裡拿到的資料已經是該使用者可見的範圍。
 */
var VaultLogic = (function () {
  'use strict';
  var ID_RE = /^\d{8}-[a-z0-9]{2,8}$/;
  var Tr = function (s) {
    return typeof T === 'function' ? T(s) : s;
  }; // 介面層有載入翻譯時才翻譯（node 測試環境沒有）
  var NONE = '__none__'; // 沒有主題的筆記（例如私人主題內、被單獨公開的筆記）

  /* ───── 搜尋 ───── */
  function tokenize(text) {
    var s = String(text || '')
      .toLowerCase()
      .trim();
    if (!s) return [];
    var out = [];
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      var it = new Intl.Segmenter('zh-Hant', { granularity: 'word' }).segment(s)[Symbol.iterator]();
      for (var n = it.next(); !n.done; n = it.next()) if (n.value.isWordLike) out.push(n.value.segment);
    } else {
      out = s.split(/[\s,.;:!?，。；：！？、]+/).filter(Boolean);
    }
    return out;
  }

  /** 所有詞都要命中（AND）。標題 3 分、標籤 2 分、主題名 1 分。 */
  function matchScore(item, tokens, topicTitle, body) {
    var title = String(item.title).toLowerCase(),
      tags = (item.tags || []).join(' ').toLowerCase(),
      tp = String(topicTitle || '').toLowerCase();
    var total = 0,
      bl = body ? String(body).toLowerCase() : '';
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i],
        s =
          title.indexOf(t) >= 0
            ? 3
            : tags.indexOf(t) >= 0
              ? 2
              : tp.indexOf(t) >= 0
                ? 1
                : bl && bl.indexOf(t) >= 0
                  ? 1
                  : 0;
      if (!s) return 0;
      total += s;
    }
    return total;
  }

  /** 內文比對的摘要：取第一個命中詞前後各約 30 字。bodyLower 是已轉小寫的全文。 */
  function bodySnippet(body, tokens) {
    var low = String(body).toLowerCase(),
      at = -1,
      len = 0;
    for (var i = 0; i < tokens.length && at < 0; i++) {
      at = low.indexOf(tokens[i]);
      len = tokens[i].length;
    }
    if (at < 0) return '';
    var a = Math.max(0, at - 30),
      b = Math.min(body.length, at + len + 30);
    return (a > 0 ? '…' : '') + String(body).slice(a, b).replace(/\s+/g, ' ') + (b < body.length ? '…' : '');
  }
  /** 全文索引用：去掉 front matter 與圖片語法，轉小寫。 */
  function plainBody(text) {
    var t = String(text).replace(/\r\n?/g, '\n'),
      m = /^---\n(?:[\s\S]*?\n)?---[ \t]*(?:\n|$)/.exec(t);
    return (m ? t.slice(m[0].length) : t).replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, ' ');
  }

  function topicMap(topics) {
    var m = {};
    topics.forEach(function (t) {
      m[t.id] = t;
    });
    return m;
  }

  function filterItems(items, topics, f, bodies) {
    var tmap = topicMap(topics),
      tokens = tokenize(f.q);
    var key = tokens.filter(function (t) {
      return t.length >= 2;
    });
    if (!key.length) key = tokens; // 單字查詢（例如「書」）仍可搜尋
    var out = [];
    items.forEach(function (it) {
      if (f.topic === NONE) {
        if (it.topic) return;
      } else if (f.topic && it.topic !== f.topic) return;
      if (f.status) {
        var tp = tmap[it.topic];
        if (!tp || tp.status !== f.status) return;
      }
      if (f.tag && (it.tags || []).indexOf(f.tag) < 0) return;
      if (f.lang && !langOk(it, f.lang)) return;
      var score = 0;
      if (key.length) {
        score = matchScore(it, key, (tmap[it.topic] || {}).title, bodies ? bodies[it.id] : '');
        if (!score) return;
      }
      out.push({ it: it, score: score });
    });
    out.sort(function (a, b) {
      return (
        b.score - a.score ||
        String(b.it.date).localeCompare(String(a.it.date)) ||
        String(a.it.title).localeCompare(String(b.it.title), 'zh-Hant')
      );
    });
    return out.map(function (x) {
      return x.it;
    });
  }

  /* ───── 書櫃：依分類分組，數量取自「目前可見」的筆記 ───── */
  /** 依 order 清單排序；沒列到的排在後面、彼此照 cmp。 */
  function byOrder(list, keyOf, order, cmp) {
    var pos = {};
    (order || []).forEach(function (k, i) {
      if (!(k in pos)) pos[k] = i;
    });
    return list.slice().sort(function (a, b) {
      var pa = keyOf(a) in pos ? pos[keyOf(a)] : 1e9,
        pb = keyOf(b) in pos ? pos[keyOf(b)] : 1e9;
      return pa !== pb ? pa - pb : cmp(a, b);
    });
  }
  function buildShelf(items, topics, order) {
    order = order || {};
    var counts = {},
      none = 0;
    items.forEach(function (it) {
      if (it.topic) counts[it.topic] = (counts[it.topic] || 0) + 1;
      else none++;
    });
    var cats = {},
      statuses = {};
    topics.forEach(function (t) {
      var name = t.category || '';
      (cats[name] = cats[name] || []).push({
        id: t.id,
        title: t.title,
        status: t.status || '',
        count: counts[t.id] || 0,
        pub: t.defaultPublic === true
      });
      if (t.status) statuses[t.status] = true;
    });
    var byTitle = function (a, b) {
      return a.title.localeCompare(b.title, 'zh-Hant');
    };
    var names = byOrder(
      Object.keys(cats).filter(Boolean),
      function (n) {
        return n;
      },
      order.cats,
      function (a, b) {
        return a.localeCompare(b, 'zh-Hant');
      }
    );
    if (cats['']) names.push(''); // 未分類永遠最後
    var list = names.map(function (name) {
      return {
        name: name,
        topics: byOrder(
          cats[name],
          function (t) {
            return t.id;
          },
          order.topics,
          byTitle
        )
      };
    });
    return { categories: list, none: none, total: items.length, statuses: Object.keys(statuses).sort() };
  }

  /* ───── 順序調整（純函式）：傳入目前顯示的 categories，回傳新的 order，不改原資料 ───── */
  function swap(arr, i, d) {
    var j = i + d,
      a = arr.slice();
    if (j < 0 || j >= a.length) return null;
    var t = a[i];
    a[i] = a[j];
    a[j] = t;
    return a;
  }
  function orderOf(cats) {
    return {
      cats: cats
        .filter(function (c) {
          return c.name;
        })
        .map(function (c) {
          return c.name;
        }),
      topics: [].concat.apply(
        [],
        cats.map(function (c) {
          return c.topics.map(function (t) {
            return t.id;
          });
        })
      )
    };
  }
  /** 分類 name 往前（-1）或往後（+1）移一格；到頭回傳 null。「未分類」不能移。 */
  function moveCategory(cats, name, d) {
    var named = cats.filter(function (c) {
        return c.name;
      }),
      i = named
        .map(function (c) {
          return c.name;
        })
        .indexOf(name);
    if (i < 0) return null;
    var m = swap(named, i, d);
    if (!m) return null;
    return orderOf(
      m.concat(
        cats.filter(function (c) {
          return !c.name;
        })
      )
    );
  }
  /** 主題在所屬分類內移一格；cat 內 hidden（被篩掉的）不影響，因為傳進來的是完整清單。 */
  function moveTopic(cats, id, d) {
    for (var k = 0; k < cats.length; k++) {
      var i = cats[k].topics
        .map(function (t) {
          return t.id;
        })
        .indexOf(id);
      if (i < 0) continue;
      var m = swap(cats[k].topics, i, d);
      if (!m) return null;
      return orderOf(
        cats.map(function (c, n) {
          return n === k ? { name: c.name, topics: m } : c;
        })
      );
    }
    return null;
  }

  function backlinks(items) {
    var m = {};
    items.forEach(function (it) {
      (it.links || []).forEach(function (t) {
        (m[t] = m[t] || []).push(it.id);
      });
    });
    return m;
  }

  /** 擁有者檢視用：筆記有 public 就用筆記的，否則用主題的 defaultPublic。 */
  function effectivePublic(item, tmap) {
    if (item.public === true || item.public === false) return item.public;
    var t = tmap[item.topic];
    return !!t && t.defaultPublic === true;
  }

  /**
   * 批次修改的預先計算（與後端規則一致；後端仍會再檢查）。change：{ topic?:string, public?:true|false|null }。
   * 回傳 { todo:[id], same:[id], newlyPublic:[id] }：todo 是真的會變動的、same 是本來就一樣的、newlyPublic 是會「變成公開」的。
   */
  function batchPlan(items, tmap, change) {
    var hasT = Object.prototype.hasOwnProperty.call(change, 'topic'),
      hasP = Object.prototype.hasOwnProperty.call(change, 'public');
    var todo = [],
      same = [],
      np = [];
    items.forEach(function (it) {
      var a = { topic: hasT ? change.topic || '' : it.topic, public: hasP ? change.public : it.public };
      var cur = it.public === undefined ? null : it.public;
      if ((it.topic || '') === (a.topic || '') && cur === a.public) {
        same.push(it.id);
        return;
      }
      todo.push(it.id);
      if (!effectivePublic(it, tmap) && effectivePublic(a, tmap)) np.push(it.id);
    });
    return { todo: todo, same: same, newlyPublic: np };
  }

  /* ───── Markdown ───── */
  function mdEscape(s) {
    return String(s).replace(/([\\\[\]])/g, '\\$1');
  }

  /** [[id]] → 內部連結；已知 id 用索引裡的標題。沒轉成 id 的 [[標題]] 與找不到的 id 顯示為純文字。 */
  function rewriteInternalLinks(body, byId) {
    return String(body).replace(/\[\[([^\[\]\n]+?)\]\]/g, function (whole, inner) {
      var id = inner.trim();
      if (!ID_RE.test(id)) return inner;
      var it = byId[id];
      return it ? '[' + mdEscape(it.title) + '](#note=' + id + ')' : Tr('（找不到的筆記）');
    });
  }

  /**
   * 安全的 Markdown 渲染器：不允許原始 HTML；連結只允許 http、https、mailto 與站內；
   * 圖片只允許外部 http(s) 連結與 assets/<id>.svg（交給前端用 <img> 載入）；不接受 data: 圖片。
   */

  /* ───── 程式碼語法高亮（P3）：自製 tokenizer，不引入外部函式庫；輸出一律先跳脫，只會產生固定的 <span class="tk-x"> ───── */
  var HL_KW = {
    js: 'async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield null undefined true false interface type enum implements readonly public private protected as',
    py: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield None True False self',
    sql: 'select from where and or not in is null like between join left right inner outer full cross on group by order having limit offset insert into values update set delete create alter drop table index view primary key foreign references unique default distinct as union all case when then else end exists count sum avg min max asc desc with begin commit rollback',
    bash: 'if then else elif fi for while until do done case esac in function select time return exit break continue export local readonly unset cd echo source alias sudo',
    json: 'true false null'
  };
  function kwRe(words, ci) {
    return new RegExp('\\b(?:' + words.split(' ').join('|') + ')\\b', 'y' + (ci ? 'i' : ''));
  }
  var STR_DQ = '"(?:\\\\.|[^"\\\\\\n])*"?',
    STR_SQ = "'(?:\\\\.|[^'\\\\\\n])*'?";
  var HL_RULES = {
    js: [
      { re: /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y, c: 'c' },
      { re: new RegExp(STR_DQ + '|' + STR_SQ + '|`(?:\\\\[\\s\\S]|[^`\\\\])*`?', 'y'), c: 's' },
      { re: /\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/y, c: 'n' },
      { re: kwRe(HL_KW.js), c: 'k' },
      { re: /\b[A-Z][\w$]*\b/y, c: 't' },
      { re: /[A-Za-z_$][\w$]*(?=\s*\()/y, c: 'f' }
    ],
    python: [
      { re: /#[^\n]*/y, c: 'c' },
      {
        re: new RegExp('"""[\\s\\S]*?(?:"""|$)|\'\'\'[\\s\\S]*?(?:\'\'\'|$)|' + STR_DQ + '|' + STR_SQ, 'y'),
        c: 's'
      },
      { re: /@[A-Za-z_][\w.]*/y, c: 'a' },
      { re: /\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/y, c: 'n' },
      { re: kwRe(HL_KW.py), c: 'k' },
      { re: /\b[A-Z][\w]*\b/y, c: 't' },
      { re: /[A-Za-z_][\w]*(?=\s*\()/y, c: 'f' }
    ],
    sql: [
      { re: /--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y, c: 'c' },
      { re: /'(?:''|[^'])*'?/y, c: 's' },
      { re: /\b\d+(?:\.\d+)?\b/y, c: 'n' },
      { re: kwRe(HL_KW.sql, true), c: 'k' },
      { re: /[A-Za-z_][\w]*(?=\s*\()/y, c: 'f' }
    ],
    json: [
      { re: /"(?:\\.|[^"\\\n])*"(?=\s*:)/y, c: 'a' },
      { re: new RegExp(STR_DQ, 'y'), c: 's' },
      { re: /-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/y, c: 'n' },
      { re: kwRe(HL_KW.json), c: 'k' }
    ],
    html: [
      { re: /<!--[\s\S]*?(?:-->|$)/y, c: 'c' },
      { re: /<\/?[A-Za-z][\w:-]*/y, c: 't' },
      { re: /[A-Za-z_:][\w:.-]*(?=\s*=)/y, c: 'a' },
      { re: new RegExp(STR_DQ + '|' + STR_SQ, 'y'), c: 's' }
    ],
    css: [
      { re: /\/\*[\s\S]*?(?:\*\/|$)/y, c: 'c' },
      { re: new RegExp(STR_DQ + '|' + STR_SQ, 'y'), c: 's' },
      { re: /@[A-Za-z-]+/y, c: 'k' },
      { re: /--[\w-]+/y, c: 'v' },
      { re: /[A-Za-z-]+(?=\s*:)/y, c: 'a' },
      { re: /#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b/y, c: 'n' },
      { re: /[A-Za-z-]+(?=\()/y, c: 'f' }
    ],
    bash: [
      { re: /#[^\n]*/y, c: 'c' },
      { re: new RegExp(STR_DQ + '|' + STR_SQ, 'y'), c: 's' },
      { re: /\$\{?[A-Za-z_]\w*\}?|\$[0-9?#@*!$]/y, c: 'v' },
      { re: kwRe(HL_KW.bash), c: 'k' },
      { re: /\b\d+\b/y, c: 'n' }
    ]
  };
  var HL_ALIAS = {
    js: 'js',
    javascript: 'js',
    jsx: 'js',
    ts: 'js',
    typescript: 'js',
    tsx: 'js',
    mjs: 'js',
    py: 'python',
    python: 'python',
    sql: 'sql',
    json: 'json',
    jsonc: 'json',
    html: 'html',
    xml: 'html',
    svg: 'html',
    vue: 'html',
    css: 'css',
    scss: 'css',
    sh: 'bash',
    bash: 'bash',
    shell: 'bash',
    zsh: 'bash',
    console: 'bash'
  };
  function escHtml(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /** 回傳已跳脫、上色的 HTML；不認得的語言或程式碼太長則回傳 null（呼叫端改用純文字）。 */
  function highlight(lang, code) {
    var rules = HL_RULES[HL_ALIAS[String(lang || '').toLowerCase()]];
    code = String(code);
    if (!rules || code.length > 20000) return null;
    var out = '',
      plain = '',
      i = 0,
      n = code.length;
    while (i < n) {
      var hit = null;
      for (var r = 0; r < rules.length; r++) {
        rules[r].re.lastIndex = i;
        var m = rules[r].re.exec(code);
        if (m && m.index === i && m[0].length) {
          hit = { t: m[0], c: rules[r].c };
          break;
        }
      }
      if (hit) {
        if (plain) {
          out += escHtml(plain);
          plain = '';
        }
        out += '<span class="tk-' + hit.c + '">' + escHtml(hit.t) + '</span>';
        i += hit.t.length;
      } else {
        plain += code[i];
        i++;
      }
    }
    return out + escHtml(plain);
  }

  function makeMarkdown(markdownit) {
    var md = markdownit({ html: false, linkify: false, typographer: false, breaks: false });
    md.validateLink = function (url) {
      var m = /^([a-z][a-z0-9+.\-]*):/i.exec(String(url).trim());
      return !m || /^(https?|mailto)$/i.test(m[1]);
    };
    var plainLink = function (t, i, o, e, s) {
      return s.renderToken(t, i, o);
    };
    var defLink = md.renderer.rules.link_open || plainLink;
    md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
      var tk = tokens[idx],
        href = tk.attrGet('href') || '',
        m = /^#note=(\d{8}-[a-z0-9]{2,8})$/.exec(href);
      if (m) {
        tk.attrSet('class', 'note-link');
        tk.attrSet('data-note', m[1]);
      } else if (/^https?:/i.test(href)) {
        tk.attrSet('target', '_blank');
        tk.attrSet('rel', 'noopener noreferrer');
      }
      return defLink(tokens, idx, options, env, self);
    };
    var defImg = md.renderer.rules.image || plainLink;
    md.renderer.rules.image = function (tokens, idx, options, env, self) {
      var tk = tokens[idx],
        src = tk.attrGet('src') || '',
        m = /^(?:\.\/)?assets\/(\d{8}-[a-z0-9]{2,8})\.svg$/.exec(src);
      if (m) {
        tk.attrs = tk.attrs.filter(function (a) {
          return a[0] !== 'src';
        });
        tk.attrSet('data-svg', m[1]);
        tk.attrSet('class', 'svg-img');
        tk.attrSet('alt', tk.content || '');
        return defImg(tokens, idx, options, env, self);
      }
      if (/^https?:/i.test(src)) {
        tk.attrSet('loading', 'lazy');
        tk.attrSet('referrerpolicy', 'no-referrer');
        tk.attrSet('alt', tk.content || '');
        return defImg(tokens, idx, options, env, self);
      }
      return '<span class="img-missing">' + md.utils.escapeHtml(tk.content || '') + '</span>'; // 相對路徑的點陣圖等：不載入，只留說明文字
    };
    // 程式碼區塊：語法高亮（語言名稱只留英數，輸出由 highlight 先跳脫）
    md.renderer.rules.fence = function (tokens, idx) {
      var tk = tokens[idx],
        lang = String(tk.info || '')
          .trim()
          .split(/\s+/)[0]
          .replace(/[^A-Za-z0-9_+-]/g, '');
      var html = highlight(lang, tk.content);
      return (
        '<pre><code' +
        (lang ? ' class="language-' + lang + '"' : '') +
        '>' +
        (html === null ? md.utils.escapeHtml(tk.content) : html) +
        '</code></pre>\n'
      );
    };
    // 目錄：呼叫端傳入 env = { toc: [] } 時，替每個標題加 id 並收集 {level,text,id}；沒傳就完全不動（畫布卡片內的 Markdown 不會產生重複 id）
    md.core.ruler.push('vault_toc', function (state) {
      if (!state.env || !Array.isArray(state.env.toc)) return;
      var n = 0;
      state.tokens.forEach(function (tk, i) {
        if (tk.type !== 'heading_open') return;
        var inl = state.tokens[i + 1],
          text = (inl && inl.children ? inl.children : [])
            .filter(function (c) {
              return c.type === 'text' || c.type === 'code_inline';
            })
            .map(function (c) {
              return c.content;
            })
            .join('')
            .trim();
        var id = 'toc-' + ++n;
        tk.attrSet('id', id);
        state.env.toc.push({ level: parseInt(tk.tag.slice(1), 10), text: text, id: id });
      });
    });
    return md;
  }

  /* ───── 筆記文字 ↔ front matter（前端內嵌 js-yaml，與後端同一套規則） ───── */
  var FM_RE = /^---\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/;
  var KNOWN = ['id', 'title', 'topic', 'date', 'tags', 'cover', 'lang', 'translation_of', 'public', 'source'];

  function splitNote(text, jsyaml) {
    var t = String(text)
        .replace(/^\uFEFF/, '')
        .replace(/\r\n?/g, '\n'),
      m = FM_RE.exec(t),
      o;
    if (!m) return { ok: true, meta: {}, body: t, has: false };
    try {
      o = jsyaml.load(m[1] || '', { schema: jsyaml.JSON_SCHEMA });
    } catch (e) {
      return { ok: false, error: Tr('front matter 不是有效的 YAML') };
    }
    if (o === null || o === undefined) o = {};
    if (typeof o !== 'object' || Array.isArray(o))
      return { ok: false, error: Tr('front matter 必須是「鍵: 值」的形式') };
    return { ok: true, meta: o, body: t.slice(m[0].length), has: true };
  }

  /** 已知欄位在前、空值不寫；表單沒有的欄位（自訂欄位、lang、source）原樣保留。 */
  /* ───── 快速切換與 [[ 自動完成（純函式） ───── */
  /** 游標前若有尚未關閉的「[[」，回傳 { start, q }（start 是「[[」的位置，q 是已輸入的字）；否則 null。 */
  function linkTrigger(text, caret) {
    var s = String(text),
      c = Math.max(0, Math.min(caret == null ? s.length : caret, s.length)),
      from = Math.max(0, c - 80),
      before = s.slice(from, c),
      i = before.lastIndexOf('[[');
    if (i < 0) return null;
    var q = before.slice(i + 2);
    if (/[\[\]\n]/.test(q)) return null;
    return { start: from + i, q: q };
  }
  /**
   * 依關鍵字排序：每個詞都要出現（不分大小寫）；標題完全相同 > 標題開頭 > 標題包含 > 只在 id／標籤／附加文字。
   * 同分時新的日期在前。fields(it) 回傳 { title, extra }。回傳最多 limit 筆。
   */
  function rankItems(items, q, limit, fields) {
    var words = String(q || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean),
      out = [];
    fields =
      fields ||
      function (it) {
        return { title: it.title, extra: [it.id].concat(it.tags || []).join(' ') };
      };
    items.forEach(function (it) {
      var f = fields(it),
        t = String(f.title || '').toLowerCase(),
        all = t + ' ' + String(f.extra || '').toLowerCase(),
        sc;
      if (
        !words.every(function (w) {
          return all.indexOf(w) >= 0;
        })
      )
        return;
      var whole = words.join(' ');
      if (!words.length) sc = 4;
      else if (t === whole) sc = 0;
      else if (t.indexOf(whole) === 0) sc = 1;
      else if (
        words.every(function (w) {
          return t.indexOf(w) >= 0;
        })
      )
        sc = 2;
      else sc = 3;
      out.push({ it: it, sc: sc, d: String(it.date || '') });
    });
    out.sort(function (a, b) {
      return a.sc - b.sc || (a.d < b.d ? 1 : a.d > b.d ? -1 : 0);
    });
    return out.slice(0, limit || 8).map(function (x) {
      return x.it;
    });
  }
  /** 從 Markdown 文字推出筆記標題：第一個標題，否則第一行非空文字；去掉 Markdown 記號，最多 80 字。 */
  function titleFromText(text) {
    var lines = String(text || '')
      .split('\n')
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    var h =
      lines.filter(function (l) {
        return /^#{1,6}\s+\S/.test(l);
      })[0] ||
      lines[0] ||
      '';
    return h
      .replace(/^#{1,6}\s+/, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^[-*+>]\s+/, '')
      .replace(/[*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
  }

  function composeNote(meta, body, jsyaml) {
    var o = {};
    KNOWN.forEach(function (k) {
      var v = meta[k];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return;
      o[k] = v;
    });
    Object.keys(meta).forEach(function (k) {
      if (KNOWN.indexOf(k) < 0 && meta[k] !== undefined) o[k] = meta[k];
    });
    return (
      '---\n' +
      jsyaml.dump(o, { schema: jsyaml.JSON_SCHEMA, lineWidth: -1, noRefs: true, skipInvalid: true }) +
      '---\n' +
      body
    );
  }

  function newId(dateStr, rnd) {
    var d = String(dateStr || '').replace(/-/g, ''),
      c = '',
      r = rnd || Math.random;
    if (!/^\d{8}$/.test(d)) d = '00000000';
    while (c.length < 4) c += Math.floor(r() * 36).toString(36);
    return d + '-' + c;
  }

  function isDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }

  function firstHeading(body) {
    var m = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m.exec(String(body));
    return m ? m[1].trim() : '';
  }

  /**
   * 匯入準備（D17 與使用者的決定）：缺的欄位補在副本上（標題取第一個標題或檔名、日期取 front matter 或匯入當天）；
   * 原檔的 id 不沿用（由新 id 取代）；原本的 public 一律清除並回報；主題以匯入時的選擇為準；原檔名記在 source。
   */
  function prepareImport(text, fileName, ctx) {
    var s = splitNote(text, ctx.jsyaml);
    if (!s.ok) return { ok: false, error: s.error };
    var meta = {},
      added = [];
    Object.keys(s.meta).forEach(function (k) {
      meta[k] = s.meta[k];
    });
    var base = String(fileName).split(/[\\/]/).pop();
    var title = String(meta.title === undefined || meta.title === null ? '' : meta.title).trim();
    if (!title) {
      title = firstHeading(s.body) || base.replace(/\.(md|markdown)$/i, '');
      added.push('title');
    }
    meta.title = title;
    var date = String(meta.date === undefined || meta.date === null ? '' : meta.date).trim();
    if (!isDate(date)) {
      date = ctx.today;
      added.push('date');
    }
    meta.date = date;
    var strippedPublic = meta.public !== undefined;
    delete meta.public;
    meta.topic = ctx.topic || '';
    meta.source = ctx.source || base; // 資料夾匯入時為「主題內的相對路徑」，避免不同子資料夾的同名檔互相誤判為重複
    var id = newId(date, ctx.rnd);
    meta.id = id;
    return {
      ok: true,
      id: id,
      meta: meta,
      body: s.body,
      title: title,
      added: added,
      strippedPublic: strippedPublic
    };
  }

  function buildTitleMap(rows, extra) {
    var m = {};
    rows.concat(extra || []).forEach(function (r) {
      var k = String(r.title || '')
        .trim()
        .toLowerCase();
      if (k) (m[k] = m[k] || []).push(r.id);
    });
    return m;
  }

  /** [[標題]] 以標題比對轉成 [[id]]；同名有多個或比對不到的保留原樣並回報，不中斷。 */
  function resolveLinks(body, tmap) {
    var resolved = 0,
      unresolved = [];
    var out = String(body).replace(/\[\[([^\[\]\n]+?)\]\]/g, function (whole, inner) {
      var t = inner.split('|')[0].split('#')[0].trim(); // 相容 Obsidian 的 [[標題|別名]]、[[標題#小節]]
      if (ID_RE.test(t)) return whole;
      var ids = tmap[t.toLowerCase()];
      if (ids && ids.length === 1) {
        resolved++;
        return '[[' + ids[0] + ']]';
      }
      unresolved.push(t);
      return whole;
    });
    return { body: out, resolved: resolved, unresolved: unresolved };
  }

  /* ───── 資料夾匯入 ───── */
  function newTopicId(used, rnd) {
    var r = rnd || Math.random,
      id;
    do {
      id = 't-';
      for (var i = 0; i < 4; i++) id += Math.floor(r() * 36).toString(36);
    } while (used[id]);
    return id;
  }
  function matchTopic(title, topics) {
    var k = String(title).trim().toLowerCase();
    return (
      topics.filter(function (t) {
        return String(t.title).trim().toLowerCase() === k;
      })[0] || null
    );
  }
  /**
   * 路徑 → 主題。選到的資料夾底下有子資料夾：第一層子資料夾＝主題、散檔＝未歸類、更深的層級併入該主題（source 為相對路徑）。
   * 底下沒有任何子資料夾：選到的資料夾本身就是主題。名稱以 . 開頭的檔案與資料夾（.obsidian、.DS_Store）一律略過。
   */
  function mapFolders(files) {
    var parts = files.map(function (f) {
      return String(f.path).split('/');
    });
    var hidden = function (p) {
      return p.some(function (s) {
        return s.charAt(0) === '.';
      });
    };
    var deep = parts.some(function (p) {
      return p.length >= 3 && !hidden(p);
    });
    return files.map(function (f, i) {
      var p = parts[i];
      if (hidden(p)) return { path: f.path, skip: true };
      if (!deep) return { path: f.path, topicTitle: p.length >= 2 ? p[0] : '', source: p[p.length - 1] };
      if (p.length <= 2) return { path: f.path, topicTitle: '', source: p[p.length - 1] };
      return { path: f.path, topicTitle: p[1], source: p.slice(2).join('/') };
    });
  }

  /** 同一批匯入的 SVG：以檔名（小寫）對應新 id；同名有多個則設為 null，不改寫。 */
  function buildSvgMap(svgs) {
    var m = {};
    svgs.forEach(function (s) {
      var k = String(s.name).split(/[\\/]/).pop().toLowerCase();
      m[k] = Object.prototype.hasOwnProperty.call(m, k) ? null : s.id;
    });
    return m;
  }
  /** 把筆記內指向本批 SVG 的引用改成 assets/<id>.svg；支援 ![](路徑.svg) 與 Obsidian 的 ![[檔名.svg]]。 */
  function rewriteSvgRefs(body, map) {
    var n = 0;
    var look = function (p) {
      var b;
      try {
        b = decodeURIComponent(p);
      } catch (e) {
        b = p;
      }
      return map[b.split(/[\\/]/).pop().toLowerCase()] || null;
    };
    var out = String(body).replace(
      /!\[([^\]\n]*)\]\(\s*<?([^)\n]+?\.svg)>?\s*(?:"[^"\n]*")?\s*\)/gi,
      function (w, alt, p) {
        var id = look(p);
        if (!id) return w;
        n++;
        return '![' + alt + '](assets/' + id + '.svg)';
      }
    );
    out = out.replace(/!\[\[([^\]\n|]+?\.svg)(?:\|[^\]\n]*)?\]\]/gi, function (w, p) {
      var id = look(p);
      if (!id) return w;
      n++;
      return '![' + p.split(/[\\/]/).pop() + '](assets/' + id + '.svg)';
    });
    return { body: out, rewritten: n };
  }

  /* ───── ZIP 備份的解析與還原預覽 ───── */
  function zipKind(path) {
    var m = /(?:^|\/)(notes|assets|topics|boards)\/([^\/]+)$/.exec(String(path));
    if (!m) return /(?:^|\/)manifest\.json$/.test(String(path)) ? { kind: 'manifest' } : { kind: null };
    var n = m[2],
      x;
    if (m[1] === 'notes' && (x = /^(\d{8}-[a-z0-9]{2,8})\.md$/.exec(n))) return { kind: 'note', id: x[1] };
    if (m[1] === 'assets' && (x = /^(\d{8}-[a-z0-9]{2,8})\.svg$/.exec(n))) return { kind: 'asset', id: x[1] };
    if (m[1] === 'assets' && (x = /^(\d{8}-[a-z0-9]{2,8})\.(png|jpg|webp)$/.exec(n)))
      return { kind: 'image', id: x[1], ext: x[2] };
    if (m[1] === 'assets' && (x = /^(\d{8}-[a-z0-9]{2,8})\.html$/.exec(n))) return { kind: 'html', id: x[1] };
    // PDF：前端匯出的是真正的 .pdf 二進位；自動備份（Drive）存的是資料網址文字，同樣叫 .pdf，由還原時看內容分辨
    if (m[1] === 'assets' && (x = /^(\d{8}-[a-z0-9]{2,8})\.pdf$/.exec(n))) return { kind: 'pdf', id: x[1] };
    // 自動備份（Drive）裡的圖片是資料網址文字（.img）
    if (m[1] === 'assets' && (x = /^(\d{8}-[a-z0-9]{2,8})\.img$/.exec(n)))
      return { kind: 'imgtext', id: x[1] };
    if (m[1] === 'boards' && (x = /^([a-z0-9][a-z0-9-]{0,39})\.canvas\.json$/.exec(n)))
      return { kind: 'board', id: x[1] };
    if (m[1] === 'topics' && (x = /^([a-z0-9][a-z0-9-]{0,39})\.json$/.exec(n)))
      return { kind: 'topic', id: x[1] };
    return { kind: null, bad: true };
  }
  /** 備份內的筆記：檔名 id 必須與 front matter 的 id 一致。 */
  function parseBackupNote(id, text, jsyaml) {
    var s = splitNote(text, jsyaml);
    if (!s.ok) return { ok: false, problem: s.error };
    if (String(s.meta.id) !== id) return { ok: false, problem: Tr('檔名與 front matter 的 id 不一致') };
    return { ok: true, id: id, text: text, meta: s.meta, body: s.body };
  }
  /** 還原後會變成公開的項目：明確標示 public 的筆記，以及繼承公開主題預設的筆記。 */
  function publicRestoreList(notes, topicDefaults) {
    return notes
      .filter(function (n) {
        var p = n.meta.public;
        if (p === true || p === 'true') return true;
        if (p === false || p === 'false') return false;
        return topicDefaults[n.meta.topic] === true;
      })
      .map(function (n) {
        return n.id;
      });
  }

  function findDup(rows, topic, source) {
    return (
      rows.filter(function (r) {
        return r.source === source && (r.topic || '') === (topic || '');
      })[0] || null
    );
  }

  /* ───── 內容語言、上下篇、路由（P4） ───── */
  /** 筆記語言對應到路由用的短碼：zh-Hant→zh、en→en；沒填 lang 的視為「未指定」，在任何語言篩選下都保留（避免筆記消失）。 */
  function shortLang(l) {
    return l === 'en' ? 'en' : l ? 'zh' : '';
  }
  function langOk(it, f) {
    var l = shortLang(it.lang);
    return !f || !l || l === f;
  }
  /** 同主題（沒主題則全部）依日期、標題排序後的上一篇與下一篇；語言篩選一併套用。 */
  function neighbors(items, id, lang) {
    var me = null;
    items.forEach(function (it) {
      if (it.id === id) me = it;
    });
    if (!me) return { prev: null, next: null };
    var scope = items.filter(function (it) {
      return (it.topic || '') === (me.topic || '') && (it.id === id || langOk(it, lang));
    });
    scope.sort(function (a, b) {
      return (
        String(a.date || '').localeCompare(String(b.date || '')) ||
        String(a.title).localeCompare(String(b.title), 'zh-Hant') ||
        (a.id < b.id ? -1 : 1)
      );
    });
    var i = scope.indexOf(me);
    return { prev: i > 0 ? scope[i - 1] : null, next: i >= 0 && i < scope.length - 1 ? scope[i + 1] : null };
  }
  /** 這則筆記的其他語言版本：自己指向的，加上指向自己的（雙向）。只回傳目前索引裡看得到的。 */
  function translations(items, id) {
    var by = {};
    items.forEach(function (it) {
      by[it.id] = it;
    });
    var me = by[id],
      out = [],
      seen = {};
    function add(x) {
      if (x && x.id !== id && !seen[x.id]) {
        seen[x.id] = 1;
        out.push(x);
      }
    }
    if (me && me.translationOf) add(by[me.translationOf]);
    items.forEach(function (it) {
      if (it.translationOf === id) add(it);
    });
    return out;
  }
  /** 路由：#/[zh|en/]note/<id>、#/[zh|en/]topic/<id>、#/[zh|en/]。parse 與 build 互逆。 */
  function parseRoute(h) {
    var s = String(h || '').replace(/^#\/?/, ''),
      parts = s ? s.split('/') : [],
      r = { lang: '', note: '', topic: '' };
    if (parts[0] === 'zh' || parts[0] === 'en') r.lang = parts.shift();
    if (parts[0] === 'note' && ID_RE.test(parts[1] || '')) r.note = parts[1];
    else if (parts[0] === 'topic' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(parts[1] || '')) r.topic = parts[1];
    return r;
  }
  function buildRoute(r) {
    return (
      '#/' + (r.lang ? r.lang + '/' : '') + (r.note ? 'note/' + r.note : r.topic ? 'topic/' + r.topic : '')
    );
  }

  /* ───── 圖庫、日曆（P3）：只讀索引，不產生任何寫入 ───── */
  /** 把 YYYY-MM-DD 手動拆開（不用 new Date(字串)，避免時區位移一天）。不合法回傳 null。 */
  function parseYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var y = +m[1],
      mo = +m[2],
      d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
    return { y: y, m: mo, d: d };
  }
  function daysIn(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  function ymd(y, m, d) {
    return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
  }
  /** 日期範圍、排序。from/to 為 YYYY-MM-DD（含頭尾）；有設範圍時沒有日期的筆記不列入。sort：''（沿用原順序）、'date-asc'、'title'。 */
  function refine(list, o) {
    o = o || {};
    var out = list.filter(function (it) {
      if (!o.from && !o.to) return true;
      var d = parseYmd(it.date) ? it.date : '';
      return !!d && (!o.from || d >= o.from) && (!o.to || d <= o.to);
    });
    if (o.sort === 'date-asc')
      out = out.slice().sort(function (a, b) {
        return (
          String(a.date || '9999').localeCompare(String(b.date || '9999')) ||
          String(a.title).localeCompare(String(b.title), 'zh-Hant')
        );
      });
    else if (o.sort === 'date-desc')
      out = out.slice().sort(function (a, b) {
        return (
          String(b.date || '').localeCompare(String(a.date || '')) ||
          String(a.title).localeCompare(String(b.title), 'zh-Hant')
        );
      });
    else if (o.sort === 'title')
      out = out.slice().sort(function (a, b) {
        return String(a.title).localeCompare(String(b.title), 'zh-Hant');
      });
    return out;
  }
  /** 月曆格：週日起，固定補滿整週。回傳 { weeks:[[{date, day, inMonth, items}]], undated:[items] }。 */
  function monthGrid(items, y, m) {
    var by = {},
      undated = [];
    items.forEach(function (it) {
      if (parseYmd(it.date)) (by[it.date] = by[it.date] || []).push(it);
      else undated.push(it);
    });
    var first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(),
      n = daysIn(y, m),
      cells = [];
    var py = m === 1 ? y - 1 : y,
      pm = m === 1 ? 12 : m - 1,
      ny = m === 12 ? y + 1 : y,
      nm = m === 12 ? 1 : m + 1,
      pn = daysIn(py, pm);
    for (var i = first - 1; i >= 0; i--) {
      var dd = ymd(py, pm, pn - i);
      cells.push({ date: dd, day: pn - i, inMonth: false, items: by[dd] || [] });
    }
    for (var d = 1; d <= n; d++) {
      var ds = ymd(y, m, d);
      cells.push({ date: ds, day: d, inMonth: true, items: by[ds] || [] });
    }
    for (var k = 1; cells.length % 7; k++) {
      var ks = ymd(ny, nm, k);
      cells.push({ date: ks, day: k, inMonth: false, items: by[ks] || [] });
    }
    var weeks = [];
    for (var w = 0; w < cells.length; w += 7) weeks.push(cells.slice(w, w + 7));
    return { weeks: weeks, undated: undated };
  }

  return {
    NONE: NONE,
    ID_RE: ID_RE,
    tokenize: tokenize,
    filterItems: filterItems,
    buildShelf: buildShelf,
    moveCategory: moveCategory,
    moveTopic: moveTopic,
    backlinks: backlinks,
    effectivePublic: effectivePublic,
    topicMap: topicMap,
    splitNote: splitNote,
    composeNote: composeNote,
    newId: newId,
    isDate: isDate,
    linkTrigger: linkTrigger,
    rankItems: rankItems,
    titleFromText: titleFromText,
    firstHeading: firstHeading,
    bodySnippet: bodySnippet,
    plainBody: plainBody,
    zipKind: zipKind,
    parseBackupNote: parseBackupNote,
    publicRestoreList: publicRestoreList,
    newTopicId: newTopicId,
    matchTopic: matchTopic,
    mapFolders: mapFolders,
    buildSvgMap: buildSvgMap,
    rewriteSvgRefs: rewriteSvgRefs,
    prepareImport: prepareImport,
    buildTitleMap: buildTitleMap,
    resolveLinks: resolveLinks,
    findDup: findDup,
    rewriteInternalLinks: rewriteInternalLinks,
    makeMarkdown: makeMarkdown,
    highlight: highlight,
    batchPlan: batchPlan,
    shortLang: shortLang,
    langOk: langOk,
    neighbors: neighbors,
    translations: translations,
    parseRoute: parseRoute,
    buildRoute: buildRoute,
    parseYmd: parseYmd,
    daysIn: daysIn,
    ymd: ymd,
    refine: refine,
    monthGrid: monthGrid
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = VaultLogic;
