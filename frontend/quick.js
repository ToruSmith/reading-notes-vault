/**
 * quick.js — 「Obsidian 手感」：編輯器的 [[ 自動完成、Ctrl+K 快速切換、建立筆記的共用函式。
 * 排序與觸發判斷是 logic.js 的純函式（linkTrigger／rankItems，有單元測試）；這裡只接畫面。
 * 安全：清單文字一律 textContent；建立筆記走原本的 saveNote（後端同樣檢查與擁有者限制）。
 */
(function () {
  'use strict';
  var U = window.VaultUI,
    L = VaultLogic,
    el = U.el,
    S = U.S,
    api = U.api,
    Y = window.jsyaml;

  function today() {
    var d = new Date(),
      p = function (n) {
        return ('0' + n).slice(-2);
      };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  /** 建立一則新筆記並更新索引；回傳新 id。meta 至少要有 title。 */
  function createNote(meta, body) {
    var date = meta.date || today(),
      id = L.newId(date);
    var text = L.composeNote(Object.assign({ id: id, date: date }, meta), body || '', Y);
    return api('saveNote', { id: id, text: text }).then(function (r) {
      if (!r.ok)
        throw new Error(
          (r.reasons ? T.all(r.reasons) : [r.error ? T(r.error) : T('儲存失敗')]).join(T('；'))
        );
      return U.reload().then(function () {
        return id;
      });
    });
  }
  U.createNote = createNote;
  function topicName(id) {
    var t = S.tmap && S.tmap[id];
    return t ? t.title : '';
  }

  /* ───── [[ 自動完成 ───── */
  /** 游標在 textarea 裡的畫面座標（用一個樣式相同的隱形 div 量）。 */
  function caretXY(ta, pos) {
    var cs = getComputedStyle(ta),
      m = document.createElement('div'),
      r = ta.getBoundingClientRect();
    [
      'boxSizing',
      'width',
      'fontFamily',
      'fontSize',
      'fontWeight',
      'lineHeight',
      'letterSpacing',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth',
      'borderLeftWidth',
      'tabSize',
      'wordBreak',
      'overflowWrap'
    ].forEach(function (k) {
      m.style[k] = cs[k];
    });
    m.style.position = 'fixed';
    m.style.visibility = 'hidden';
    m.style.whiteSpace = 'pre-wrap';
    m.style.top = '0';
    m.style.left = '-9999px';
    m.style.height = 'auto';
    m.textContent = ta.value.slice(0, pos);
    var mk = document.createElement('span');
    mk.textContent = '​';
    m.appendChild(mk);
    document.body.appendChild(m);
    var x = r.left + mk.offsetLeft - ta.scrollLeft,
      y = r.top + mk.offsetTop - ta.scrollTop,
      lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    document.body.removeChild(m);
    return { x: x, y: y, lh: lh };
  }
  U.attachLinkComplete = function (ta, onChange, ctx) {
    var pop = null,
      list = [],
      sel = 0,
      trig = null,
      busy = false;
    function close() {
      if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
      pop = null;
      trig = null;
      ta.removeAttribute('aria-activedescendant');
      ta.setAttribute('aria-expanded', 'false');
    }
    function update() {
      if (busy) return;
      trig = ta.selectionStart === ta.selectionEnd ? L.linkTrigger(ta.value, ta.selectionStart) : null;
      if (!trig) return close();
      list = L.rankItems(S.items, trig.q, 8).map(function (it) {
        return { kind: 'note', it: it };
      });
      var q = trig.q.trim();
      if (
        q &&
        U.canNew() &&
        !S.items.some(function (it) {
          return it.title === q;
        })
      )
        list.push({ kind: 'new', q: q });
      if (!list.length) return close();
      sel = Math.min(sel, list.length - 1);
      paint();
    }
    function paint() {
      if (!pop) {
        pop = el('ul', { class: 'ac-pop', role: 'listbox', id: 'ac-pop', 'aria-label': T('連結到筆記') });
        document.body.appendChild(pop);
        ta.setAttribute('aria-expanded', 'true');
      }
      pop.textContent = '';
      list.forEach(function (o, i) {
        var li = el(
          'li',
          {
            role: 'option',
            id: 'ac-' + i,
            class: 'ac-it' + (i === sel ? ' on' : ''),
            'aria-selected': i === sel ? 'true' : 'false'
          },
          o.kind === 'note'
            ? [
                el('span', { class: 't', text: o.it.title }),
                el('small', { text: [topicName(o.it.topic), o.it.date].filter(Boolean).join('・') })
              ]
            : [el('span', { class: 't', text: T('＋ 建立新筆記「{1}」', o.q) })]
        );
        li.addEventListener('mousedown', function (e) {
          e.preventDefault();
          pick(i);
        });
        pop.appendChild(li);
      });
      ta.setAttribute('aria-activedescendant', 'ac-' + sel);
      var p = caretXY(ta, trig.start),
        w = Math.min(360, window.innerWidth - 16),
        x = Math.max(8, Math.min(p.x, window.innerWidth - w - 8)),
        y = p.y + p.lh + 4;
      pop.style.width = w + 'px';
      pop.style.left = x + 'px';
      var h = pop.offsetHeight || 200;
      if (y + h > window.innerHeight - 8) y = Math.max(8, p.y - h - 4);
      pop.style.top = y + 'px';
    }
    function insertAt(a, b, id) {
      var ins = '[[' + id + ']]';
      ta.value = ta.value.slice(0, a) + ins + ta.value.slice(b);
      var c = a + ins.length;
      ta.focus();
      ta.setSelectionRange(c, c);
      close();
      onChange();
    }
    function pick(i) {
      var o = list[i];
      if (!o || !trig) return;
      var a = trig.start,
        b = ta.selectionStart;
      if (o.kind === 'note') return insertAt(a, b, o.it.id);
      busy = true;
      close();
      if (ctx && ctx.status) ctx.status(T('建立筆記中…'));
      createNote({ title: o.q, topic: (ctx && ctx.topic && ctx.topic()) || undefined }, '')
        .then(function (id) {
          busy = false;
          insertAt(a, b, id);
          if (ctx && ctx.status) ctx.status(T('已建立新筆記「{1}」並插入連結。', o.q));
        })
        .catch(function (e) {
          busy = false;
          if (ctx && ctx.status) ctx.status(T('建立筆記失敗：{1}', e.message));
        });
    }
    ta.setAttribute('aria-autocomplete', 'list');
    ta.setAttribute('aria-controls', 'ac-pop');
    ta.setAttribute('aria-expanded', 'false');
    ta.addEventListener('input', update);
    ta.addEventListener('click', update);
    ta.addEventListener('keyup', function (e) {
      if (/^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) update();
    });
    ta.addEventListener('blur', function () {
      setTimeout(close, 120);
    });
    ta.addEventListener('scroll', function () {
      if (pop) paint();
    });
    ta.addEventListener('keydown', function (e) {
      if (!pop) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        sel = (sel + 1) % list.length;
        paint();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        sel = (sel - 1 + list.length) % list.length;
        paint();
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(sel);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    });
  };

  /* ───── Ctrl+K 快速切換 ───── */
  var Q = null;
  function leaveAll() {
    if (U.flushDraft) U.flushDraft();
  }
  function openCanvasFor(id) {
    if (U.leaveCanvas && !U.leaveCanvas()) return;
    leaveAll();
    S.note = null;
    S.edit = null;
    S.up = null;
    S.zip = null;
    S.pub = null;
    S.sync = null;
    S.settings = false;
    S.topicEd = null;
    U.openCanvas(id);
  }
  function actions() {
    var a = [];
    if (U.canNew())
      a.push({
        kind: T('動作'),
        title: T('新增筆記'),
        run: function () {
          leaveAll();
          U.openEditor(null);
        }
      });
    if (S.me.isOwner && U.setEditMode)
      a.push({
        kind: T('動作'),
        title: S.editMode ? T('切換到閱讀模式') : T('切換到編輯模式'),
        run: function () {
          U.setEditMode(!S.editMode);
        }
      });
    if (U.$('btnSettings'))
      a.push({
        kind: T('動作'),
        title: T('開啟設定'),
        run: function () {
          U.$('btnSettings').click();
        }
      });
    a.push({
      kind: T('動作'),
      title: T('回到列表'),
      run: function () {
        if (U.go) U.go({});
      }
    });
    return a;
  }
  function candidates() {
    var c = actions();
    S.topics.forEach(function (t) {
      c.push({
        kind: T('主題'),
        title: t.title,
        extra: t.id,
        run: function () {
          if (U.go) U.go({ topic: t.id, q: '' });
        }
      });
      if (U.openCanvas)
        c.push({
          kind: T('畫布'),
          title: T('{1}・畫布', t.title),
          extra: t.id + ' canvas',
          run: function () {
            openCanvasFor(t.id);
          }
        });
    });
    return c;
  }
  function results(q) {
    var notes = L.rankItems(S.items, q, q ? 10 : 8).map(function (it) {
      return {
        kind: T('筆記'),
        title: it.title,
        sub: [topicName(it.topic), it.date].filter(Boolean).join('・'),
        run: function () {
          leaveAll();
          U.openNote(it.id);
        }
      };
    });
    var others = L.rankItems(candidates(), q, q ? 6 : 4, function (o) {
      return { title: o.title, extra: [o.kind, o.extra].join(' ') };
    });
    return q ? others.slice(0, 3).concat(notes).concat(others.slice(3)) : others.concat(notes);
  }
  function openQuick() {
    if (Q) {
      Q.inp.focus();
      return;
    }
    var back = el('div', { class: 'qk-back', id: 'qk' }),
      box = el('div', { class: 'qk', role: 'dialog', 'aria-modal': 'true', 'aria-label': T('快速切換') });
    var inp = el('input', {
      type: 'text',
      class: 'in',
      id: 'qk-in',
      autocomplete: 'off',
      placeholder: T('找筆記、主題、畫布或動作…'),
      role: 'combobox',
      'aria-controls': 'qk-list',
      'aria-expanded': 'true'
    });
    var ul = el('ul', { class: 'qk-list', id: 'qk-list', role: 'listbox' });
    box.appendChild(inp);
    box.appendChild(ul);
    box.appendChild(el('p', { class: 'qk-hint', text: T('↑↓ 選擇・Enter 開啟・Esc 關閉') }));
    back.appendChild(box);
    document.body.appendChild(back);
    Q = { back: back, inp: inp, ul: ul, list: [], sel: 0, prevFocus: document.activeElement };
    function paint() {
      ul.textContent = '';
      if (!Q.list.length) {
        ul.appendChild(el('li', { class: 'qk-empty', text: T('沒有符合的結果') }));
        return;
      }
      Q.list.forEach(function (o, i) {
        var li = el(
          'li',
          {
            role: 'option',
            id: 'qk-' + i,
            class: 'qk-it' + (i === Q.sel ? ' on' : ''),
            'aria-selected': i === Q.sel ? 'true' : 'false'
          },
          [
            el('span', { class: 'qk-k', text: o.kind }),
            el('span', { class: 't', text: o.title }),
            o.sub ? el('small', { text: o.sub }) : null
          ]
        );
        li.addEventListener('mousedown', function (e) {
          e.preventDefault();
          go(i);
        });
        ul.appendChild(li);
      });
      inp.setAttribute('aria-activedescendant', 'qk-' + Q.sel);
      var on = ul.children[Q.sel];
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    }
    function refresh() {
      Q.list = results(inp.value.trim());
      Q.sel = 0;
      paint();
    }
    function go(i) {
      var o = Q.list[i];
      closeQuick(true);
      if (o) o.run();
    }
    inp.addEventListener('input', refresh);
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (Q.list.length) {
          Q.sel = (Q.sel + 1) % Q.list.length;
          paint();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (Q.list.length) {
          Q.sel = (Q.sel - 1 + Q.list.length) % Q.list.length;
          paint();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        go(Q.sel);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeQuick();
      }
    });
    back.addEventListener('mousedown', function (e) {
      if (e.target === back) closeQuick();
    });
    refresh();
    inp.focus();
  }
  function closeQuick(navigating) {
    if (!Q) return;
    var q = Q;
    Q = null;
    if (q.back.parentNode) q.back.parentNode.removeChild(q.back);
    if (!navigating && q.prevFocus && q.prevFocus.focus)
      try {
        q.prevFocus.focus();
      } catch (e) {
        /* 略 */
      }
  }
  U.openQuick = openQuick;
  document.addEventListener(
    'keydown',
    function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        e.stopPropagation();
        if (Q) closeQuick();
        else openQuick();
      }
    },
    true
  );
})();
