/**
 * edit.js — 筆記編輯器（規劃書 6.3、6.7）
 * - 上方 front matter 表單、下方文字框編輯內文；表單沒有的欄位原樣保留。
 * - 草稿存 IndexedDB；不可用時退回記憶體並提示。失敗可重送，新筆記的 id 在前端先產生，重送由後端去重。
 * - 存檔附 baseUpdatedAt；409 時顯示伺服器版本，由使用者選覆蓋、另存或採用伺服器版本，絕不靜默覆蓋。
 */
(function () {
  'use strict';
  var U = window.VaultUI,
    L = VaultLogic,
    el = U.el,
    S = U.S,
    api = U.api,
    Y = window.jsyaml;
  var FORM_KEYS = {
    id: 1,
    title: 1,
    topic: 1,
    date: 1,
    tags: 1,
    cover: 1,
    public: 1,
    lang: 1,
    translation_of: 1
  };
  var E = null,
    timer = null;

  function today() {
    var d = new Date(),
      p = function (n) {
        return ('0' + n).slice(-2);
      };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ───── 草稿 ───── */
  var Drafts = (function () {
    var db = null,
      mem = {},
      ready = null;
    function open() {
      if (ready) return ready;
      ready = new Promise(function (res) {
        try {
          var r = indexedDB.open('vault-drafts', 1);
          r.onupgradeneeded = function () {
            r.result.createObjectStore('drafts', { keyPath: 'key' });
          };
          r.onsuccess = function () {
            db = r.result;
            res();
          };
          r.onerror = r.onblocked = function () {
            res();
          };
        } catch (e) {
          res();
        }
      });
      return ready;
    }
    function run(op, key, val) {
      return open().then(function () {
        if (!db) {
          if (op === 'put') mem[val.key] = val;
          else if (op === 'del') delete mem[key];
          else if (op === 'all')
            return Object.keys(mem).map(function (k) {
              return mem[k];
            });
          else return mem[key];
          return undefined;
        }
        return new Promise(function (res) {
          try {
            var s = db
              .transaction('drafts', op === 'get' || op === 'all' ? 'readonly' : 'readwrite')
              .objectStore('drafts');
            var r =
              op === 'put'
                ? s.put(val)
                : op === 'del'
                  ? s['delete'](key)
                  : op === 'all'
                    ? s.getAll()
                    : s.get(key);
            r.onsuccess = function () {
              res(r.result);
            };
            r.onerror = function () {
              res(undefined);
            };
          } catch (e) {
            res(undefined);
          }
        });
      });
    }
    function all() {
      return run('all').then(function (a) {
        return a || [];
      });
    }
    /** 刪掉超過 days 天沒動過的草稿；回傳刪除數。 */
    function prune(days) {
      var cut = Date.now() - days * 864e5;
      return all().then(function (a) {
        var old = a.filter(function (d) {
          return !(d.savedAt > cut);
        });
        return Promise.all(
          old.map(function (d) {
            return run('del', d.key);
          })
        ).then(function () {
          return old.length;
        });
      });
    }
    function clear() {
      return all().then(function (a) {
        return Promise.all(
          a.map(function (d) {
            return run('del', d.key);
          })
        ).then(function () {
          return a.length;
        });
      });
    }
    return {
      get: function (k) {
        return run('get', k);
      },
      put: function (v) {
        return run('put', null, v);
      },
      del: function (k) {
        return run('del', k);
      },
      all: all,
      prune: prune,
      clear: clear,
      persistent: function () {
        return open().then(function () {
          return !!db;
        });
      }
    };
  })();
  U.Drafts = Drafts;

  /* ───── 狀態與表單 ───── */
  function extrasOf(meta) {
    var o = {};
    Object.keys(meta).forEach(function (k) {
      if (!FORM_KEYS[k]) o[k] = meta[k];
    });
    return o;
  }
  function fieldsOf(m) {
    return {
      title: m.title || '',
      topic: m.topic || '',
      date: m.date || today(),
      tags: (m.tags || []).join(', '),
      pub: m.public === true ? 'true' : m.public === false ? 'false' : '',
      cover: m.cover || '',
      lang: m.lang || '',
      tr: m.translation_of || ''
    };
  }
  function realTopic() {
    return S.f.topic && S.f.topic !== L.NONE && S.tmap[S.f.topic] ? S.f.topic : '';
  }
  function collect(id) {
    var f = E.f,
      m = {};
    Object.keys(E.extras).forEach(function (k) {
      m[k] = E.extras[k];
    });
    m.id = id || E.id;
    m.title = f.title.trim();
    m.topic = f.topic;
    m.date = f.date;
    m.tags = f.tags
      .split(/[,，、]/)
      .map(function (x) {
        return x.trim();
      })
      .filter(Boolean);
    m.cover = f.cover.trim();
    if (f.lang) m.lang = f.lang;
    if (f.tr.trim()) m.translation_of = f.tr.trim();
    if (f.pub === 'true') m.public = true;
    else if (f.pub === 'false') m.public = false;
    return m;
  }
  function setStatus(t) {
    var n = U.$('st');
    if (n) n.textContent = t;
  }

  function changed() {
    clearTimeout(timer);
    timer = setTimeout(saveDraft, 500);
  }
  /** 內容與開啟時相同（沒有真正編輯）就不留草稿；已存在的同 key 草稿也一併刪掉。 */
  function snap() {
    return JSON.stringify([E.f, E.body]);
  }
  function dirty() {
    return !!E && snap() !== E.orig;
  }
  function saveDraft() {
    if (!E) return Promise.resolve();
    if (!dirty()) return Drafts.del(E.id);
    return Drafts.put({
      key: E.id,
      isNew: E.isNew,
      f: E.f,
      body: E.body,
      extras: E.extras,
      base: E.base,
      savedAt: Date.now()
    })
      .then(function () {
        return Drafts.persistent();
      })
      .then(function (ok) {
        setStatus(ok ? T('草稿已暫存') : T('草稿已暫存（此環境無法跨重新整理保存，請盡快存檔）'));
      });
  }

  /** preset：新增時預設的欄位（例如日曆雙擊帶入的 date、topic）。 */
  U.openEditor = function (id, preset, presetBody) {
    S.settings = false;
    S.topicEd = null;
    S.note = null;
    S.up = null;
    S.zip = null;
    S.edit = { loading: true };
    U.render();
    (id ? api('getNote', { id: id }) : Promise.resolve(null))
      .then(function (r) {
        var meta, body, base;
        if (id) {
          if (!(r && r.ok)) throw new Error(T('找不到這則筆記'));
          var s = L.splitNote(r.text, Y);
          if (!s.ok) throw new Error(T(s.error));
          meta = s.meta;
          body = s.body;
          base = r.updatedAt;
        } else {
          meta = Object.assign({ topic: realTopic(), date: today() }, preset || {});
          body = typeof presetBody === 'string' ? presetBody : '';
        }
        var eid = id || L.newId(meta.date);
        E = {
          id: eid,
          isNew: !id,
          base: base,
          extras: extrasOf(meta),
          f: fieldsOf(meta),
          body: body,
          notice: '',
          busy: false,
          reasons: [],
          conflict: null,
          svg: null
        };
        E.orig = snap();
        return findDraft(id, eid, !!(preset || presetBody)).then(function (d) {
          if (!d) return;
          E.id = d.key;
          E.f = d.f;
          E.body = d.body;
          E.extras = d.extras || E.extras;
          E.notice = T(
            '已還原上次未送出的草稿。{1}',
            d.base !== base ? T('伺服器上的版本在草稿之後有更新，存檔時可能需要處理衝突。') : ''
          );
        });
      })
      .then(function () {
        S.edit = E;
        U.render();
      })
      .catch(function (e) {
        S.edit = { error: e.message };
        U.render();
      });
  };
  /** 找可還原的草稿：舊筆記看同 id；新筆記沿用「最近一份」新筆記草稿（不再每次開新的）。 */
  function findDraft(id, eid, hasPreset) {
    if (id) return Drafts.get(eid);
    if (hasPreset) return Promise.resolve(null);
    return Drafts.all().then(function (a) {
      a = a
        .filter(function (d) {
          return d.isNew;
        })
        .sort(function (x, y) {
          return y.savedAt - x.savedAt;
        });
      return a[0] || null;
    });
  }
  U.newNote = function () {
    U.openEditor(null);
  };

  function leave() {
    var id = E && !E.isNew ? E.id : null;
    clearTimeout(timer);
    S.edit = null;
    E = null;
    if (id) U.openNote(id);
    else U.render();
  }

  /* ───── 存檔與衝突 ───── */
  function save(over) {
    if (E.busy) return;
    if (!E.f.title.trim()) {
      E.reasons = [T('請輸入標題')];
      return U.renderEditor();
    }
    var id = over && over.id ? over.id : E.id;
    var base = over && 'base' in over ? over.base : E.isNew ? undefined : E.base;
    var text = L.composeNote(collect(id), E.body, Y);
    E.busy = true;
    E.reasons = [];
    setStatus(T('儲存中…'));
    api('saveNote', { id: id, text: text, baseUpdatedAt: base })
      .then(function (r) {
        E.busy = false;
        if (r.ok) return finish(id, r);
        if (r.code === 409) {
          E.conflict = r.server || { updatedAt: '', text: '' };
          return U.renderEditor();
        }
        E.reasons = T.all(r.reasons || [r.error || T('儲存失敗')]);
        U.renderEditor();
      })
      .catch(function (e) {
        E.busy = false;
        saveDraft().then(function () {
          setStatus(
            T('網路中斷，草稿已保留。恢復連線後再按「儲存」即可重送，不會重複建立。（{1}）', e.message)
          );
        });
      });
  }
  function finish(id, r) {
    var oldKey = E.id;
    clearTimeout(timer);
    Promise.all([Drafts.del(oldKey), Drafts.del(id)])
      .then(function () {
        S.edit = null;
        E = null;
        U.flash =
          (r.warnings && r.warnings.length ? T.all(r.warnings).join(' ') : '') ||
          (r.deduped ? T('這則筆記先前已儲存成功。') : T('已儲存。'));
        return U.reload();
      })
      .then(function () {
        U.openNote(id);
      });
  }

  function useServerVersion() {
    var s = L.splitNote(E.conflict.text, Y);
    if (!s.ok) {
      E.reasons = T.all([s.error]);
      E.conflict = null;
      return U.renderEditor();
    }
    E.f = fieldsOf(s.meta);
    E.body = s.body;
    E.extras = extrasOf(s.meta);
    E.base = E.conflict.updatedAt;
    E.conflict = null;
    saveDraft();
    U.renderEditor();
  }
  function saveAsNew() {
    var nid = L.newId(E.f.date);
    Drafts.del(E.id);
    E.id = nid;
    E.isNew = true;
    E.base = undefined;
    E.conflict = null;
    save({ id: nid, base: undefined });
  }

  /* ───── SVG ───── */
  function uploadSvg(file) {
    setStatus(T('上傳 SVG 中…'));
    U.readFile(file)
      .then(function (text) {
        return api('uploadSvg', { id: L.newId(E.f.date), text: text });
      })
      .then(function (r) {
        if (!r.ok) {
          E.reasons = T.all(r.reasons || [r.error]);
          return U.renderEditor();
        }
        E.svg = r;
        U.renderEditor();
      })
      .catch(function (e) {
        setStatus(T('SVG 上傳失敗：{1}', e.message));
      });
  }

  function pvMode() {
    try {
      return localStorage.getItem('vault-edpv') || '';
    } catch (e) {
      return '';
    }
  }
  function savePvMode(m) {
    try {
      localStorage.setItem('vault-edpv', m);
    } catch (e) {
      /* 略 */
    }
  }
  U.flushDraft = function () {
    if (E && E.id) {
      clearTimeout(timer);
      return saveDraft();
    }
  }; /* saveDraft 自己會略過未編輯的內容 */
  Drafts.prune(30); /* 啟動時清掉 30 天沒動的草稿 */

  /* ───── 畫面 ───── */
  function field(label, control) {
    return el('label', { class: 'fld' }, [el('span', { text: label }), control]);
  }
  function bind(node, key) {
    node.value = E.f[key];
    node.addEventListener('input', function () {
      E.f[key] = node.value;
      changed();
    });
    return node;
  }

  U.renderEditor = function () {
    if (S.settings) return; // 設定疊在上面時，背景的非同步更新不要蓋掉設定畫面
    var main = U.$('main'),
      X = S.edit;
    main.textContent = '';
    var back = function (t, fn) {
      return el('p', { class: 'back' }, [
        el('button', { type: 'button', class: 'linkbtn', text: t, onclick: fn })
      ]);
    };
    if (X.loading) {
      main.appendChild(el('p', { class: 'empty', text: T('載入中…') }));
      return;
    }
    if (X.error) {
      main.appendChild(
        back(T('← 回到列表'), function () {
          S.edit = null;
          U.render();
        })
      );
      main.appendChild(el('p', { class: 'err', text: X.error }));
      return;
    }

    main.appendChild(back(T('← 離開（草稿會保留）'), leave));
    main.appendChild(el('h2', { text: E.isNew ? T('新增筆記') : T('編輯筆記') }));
    if (E.notice) main.appendChild(el('p', { class: 'sub', text: E.notice }));
    if (E.reasons.length)
      main.appendChild(
        el(
          'ul',
          { class: 'rs', role: 'alert' },
          E.reasons.map(function (r) {
            return el('li', { text: r });
          })
        )
      );

    if (E.conflict) {
      var ro = el('textarea', { class: 'ro', readonly: 'readonly', 'aria-label': T('伺服器上的版本') });
      ro.value = E.conflict.text || '';
      main.appendChild(
        el('section', { class: 'panel', role: 'alert' }, [
          el('h3', { text: T('這則筆記在你編輯期間已被更新') }),
          el('p', {
            class: 'sub',
            text: T('下面是伺服器上的版本。你可以參考它，在上方自行改好後選「覆蓋」，這就是手動合併。')
          }),
          ro,
          el('div', { class: 'row' }, [
            el('button', {
              type: 'button',
              class: 'primary',
              text: T('覆蓋伺服器版本'),
              onclick: function () {
                var c = E.conflict;
                E.conflict = null;
                save({ base: c.updatedAt });
              }
            }),
            el('button', { type: 'button', class: 'tbtn', text: T('另存為新筆記'), onclick: saveAsNew }),
            el('button', {
              type: 'button',
              class: 'tbtn',
              text: T('改用伺服器版本'),
              onclick: useServerVersion
            }),
            el('button', {
              type: 'button',
              class: 'linkbtn',
              text: T('稍後處理'),
              onclick: function () {
                E.conflict = null;
                U.renderEditor();
              }
            })
          ])
        ])
      );
    }

    var topic = el(
      'select',
      { id: 'f-topic' },
      [el('option', { value: '', text: T('未歸類') })].concat(
        S.topics.map(function (t) {
          return el('option', { value: t.id, text: t.title });
        })
      )
    );
    topic.value = E.f.topic;
    topic.addEventListener('change', function () {
      E.f.topic = topic.value;
      changed();
    });
    var pub = el('select', { id: 'f-pub' }, [
      el('option', { value: '', text: T('依主題預設') }),
      el('option', { value: 'true', text: T('公開') }),
      el('option', { value: 'false', text: T('私人') })
    ]);
    pub.value = E.f.pub;
    pub.addEventListener('change', function () {
      E.f.pub = pub.value;
      changed();
    });
    main.appendChild(
      field(
        T('標題'),
        bind(el('input', { type: 'text', class: 'in', id: 'f-title', autocomplete: 'off' }), 'title')
      )
    );
    main.appendChild(
      el('div', { class: 'grid2' }, [
        field(T('主題'), topic),
        field(T('日期'), bind(el('input', { type: 'date', class: 'in', id: 'f-date' }), 'date'))
      ])
    );
    main.appendChild(
      el('div', { class: 'grid2' }, [
        field(
          T('標籤（以逗號分隔）'),
          bind(el('input', { type: 'text', class: 'in', id: 'f-tags' }), 'tags')
        ),
        field(T('公開'), pub)
      ])
    );
    var langOpts = [
      ['', T('未指定')],
      ['zh-Hant', T('中文')],
      ['en', 'English']
    ];
    if (
      E.f.lang &&
      !langOpts.some(function (o) {
        return o[0] === E.f.lang;
      })
    )
      langOpts.push([E.f.lang, E.f.lang]);
    main.appendChild(
      field(
        T('語言'),
        bind(
          el(
            'select',
            { class: 'in', id: 'f-lang' },
            langOpts.map(function (o) {
              return el('option', { value: o[0], text: o[1] });
            })
          ),
          'lang'
        )
      )
    );
    main.appendChild(
      field(
        T('翻譯自（另一語言版本的筆記 id，可省略）'),
        bind(el('input', { type: 'text', class: 'in', id: 'f-tr', placeholder: '20250101-ab' }), 'tr')
      )
    );
    main.appendChild(
      field(
        T('封面 SVG 的 id（可省略）'),
        bind(el('input', { type: 'text', class: 'in', id: 'f-cover' }), 'cover')
      )
    );

    var ta = el('textarea', {
      class: 'body',
      id: 'f-body',
      'aria-label': T('內文（Markdown）'),
      spellcheck: 'false'
    });
    ta.value = E.body;
    ta.addEventListener('input', function () {
      E.body = ta.value;
      changed();
      schedulePv();
    });
    /* 即時預覽：寬螢幕可並排；窄螢幕在「編輯／預覽」之間切換。選擇記在這個瀏覽器。 */
    var pv = el('div', { class: 'md ed-pv', id: 'f-preview', 'aria-label': T('預覽'), 'aria-live': 'off' }),
      pvTimer = null;
    var modes = U.narrow.matches
      ? [
          ['edit', T('編輯')],
          ['preview', T('預覽')]
        ]
      : [
          ['edit', T('只編輯')],
          ['split', T('並排預覽')],
          ['preview', T('只預覽')]
        ];
    var mode = pvMode();
    if (
      !modes.some(function (m) {
        return m[0] === mode;
      })
    )
      mode = U.narrow.matches ? 'edit' : 'split';
    var split = el('div', { class: 'ed-split m-' + mode }, [ta, pv]);
    function paintPv() {
      pvTimer = null;
      if (mode === 'edit') return;
      pv.innerHTML = U.mdHtml(E ? E.body : ta.value, S.byId);
      U.loadSvgs(pv);
    }
    function schedulePv() {
      if (mode === 'edit') return;
      clearTimeout(pvTimer);
      pvTimer = setTimeout(paintPv, 150);
    }
    pv.addEventListener('click', function (ev) {
      var a = ev.target.closest && ev.target.closest('a');
      if (a && (a.classList.contains('note-link') || /^#/.test(a.getAttribute('href') || '')))
        ev.preventDefault();
    });
    var seg = el(
      'div',
      { class: 'seg ed-seg', role: 'group', 'aria-label': T('預覽方式') },
      modes.map(function (m) {
        return el('button', {
          type: 'button',
          class: 'tbtn' + (m[0] === mode ? ' on' : ''),
          'data-m': m[0],
          'aria-pressed': m[0] === mode ? 'true' : 'false',
          text: m[1],
          onclick: function () {
            mode = m[0];
            savePvMode(mode);
            split.className = 'ed-split m-' + mode;
            Array.prototype.forEach.call(seg.children, function (b) {
              var on = b.getAttribute('data-m') === mode;
              b.classList.toggle('on', on);
              b.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
            if (mode !== 'edit') paintPv();
            else ta.focus();
          }
        });
      })
    );
    main.appendChild(
      el('div', { class: 'fld ed-bodyfld' }, [
        el('span', { text: T('內文（Markdown）・打 [[ 可連到其他筆記') }),
        seg,
        split
      ])
    );
    if (U.attachLinkComplete)
      U.attachLinkComplete(
        ta,
        function () {
          E.body = ta.value;
          changed();
          schedulePv();
        },
        {
          topic: function () {
            return E && E.f.topic;
          },
          status: setStatus
        }
      );
    paintPv();

    var pick = el('input', { type: 'file', accept: '.svg,image/svg+xml', id: 'f-svg', hidden: 'hidden' });
    pick.addEventListener('change', function () {
      if (pick.files && pick.files[0]) uploadSvg(pick.files[0]);
    });
    main.appendChild(
      el('div', { class: 'row' }, [
        el('button', {
          type: 'button',
          class: 'primary',
          id: 'f-save',
          text: T('儲存'),
          onclick: function () {
            save();
          }
        }),
        el('button', {
          type: 'button',
          class: 'tbtn',
          text: T('上傳 SVG'),
          onclick: function () {
            pick.click();
          }
        }),
        pick,
        el('button', {
          type: 'button',
          class: 'linkbtn',
          text: T('捨棄草稿並離開'),
          onclick: function () {
            Drafts.del(E.id).then(leave);
          }
        })
      ])
    );
    if (E.svg) {
      var md = '![說明](assets/' + E.svg.id + '.svg)';
      main.appendChild(
        el('p', { class: 'sub' }, [
          T(
            '已上傳 SVG（{1}）{2}。',
            E.svg.id,
            E.svg.removed && E.svg.removed.length ? T('，已清除 {1} 項不安全內容', E.svg.removed.length) : ''
          ),
          el('button', {
            type: 'button',
            class: 'linkbtn',
            text: T('插入到內文'),
            onclick: function () {
              var at = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
              ta.value = ta.value.slice(0, at) + md + ta.value.slice(at);
              E.body = ta.value;
              E.svg = null;
              changed();
              U.renderEditor();
            }
          })
        ])
      );
    }
    main.appendChild(el('p', { class: 'status', id: 'st', role: 'status', 'aria-live': 'polite' }));
  };
})();
