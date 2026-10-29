/**
 * batch.js — 多選與批次修改「主題」「公開」（P3.6）
 * 保守規則：只要這批會讓任何筆記「變成公開」（含移到公開主題），先列出數量並要二次確認；
 * 後端會再檢查一次，沒附確認就整批拒絕。一次送 30 則，逐則回報成功／沒變／失敗，失敗的留在選取中可重試。
 */
(function () {
  'use strict';
  var U = window.VaultUI,
    L = VaultLogic,
    S = U.S,
    el = U.el,
    api = U.api;
  var CHUNK = 30;
  var B = (U.batchState = {
    on: false,
    ids: {},
    topic: '',
    pub: '',
    busy: false,
    msg: '',
    err: '',
    confirm: null,
    del: false,
    progress: ''
  });
  var boxes = {};

  function count() {
    return Object.keys(B.ids).length;
  }
  function prune() {
    Object.keys(B.ids).forEach(function (id) {
      if (!S.byId[id]) delete B.ids[id];
    });
  }

  U.selBox = function (id) {
    if (!B.on) return null;
    var b = el('span', {
      class: 'selbox' + (B.ids[id] ? ' on' : ''),
      'aria-hidden': 'true',
      text: B.ids[id] ? '✓' : ''
    });
    boxes[id] = b;
    return b;
  };
  U.selClick = function (id) {
    if (!B.on) return false;
    if (B.ids[id]) delete B.ids[id];
    else B.ids[id] = 1;
    var b = boxes[id];
    if (b) {
      b.className = 'selbox' + (B.ids[id] ? ' on' : '');
      b.textContent = B.ids[id] ? '✓' : '';
      var a = b.parentNode;
      if (a && a.setAttribute) a.setAttribute('aria-pressed', B.ids[id] ? 'true' : 'false');
    }
    B.msg = '';
    B.err = '';
    B.confirm = null;
    paintSummary();
    return true;
  };
  var sum = null,
    goBtn = null,
    delBtn = null;
  function paintSummary() {
    if (sum) sum.textContent = T('已選 {1} 則', count());
    if (delBtn) delBtn.disabled = !count() || B.busy;
    if (goBtn) goBtn.disabled = !count() || B.busy || (B.topic === '' && B.pub === '');
  }

  function change() {
    var c = {};
    if (B.topic !== '') c.topic = B.topic === '__none__' ? '' : B.topic;
    if (B.pub !== '') c.public = B.pub === 'true' ? true : B.pub === 'false' ? false : null;
    return c;
  }
  function run(confirmed) {
    prune();
    var c = change(),
      items = Object.keys(B.ids).map(function (id) {
        return S.byId[id];
      });
    var plan = L.batchPlan(items, S.tmap, c);
    if (!plan.todo.length) {
      B.msg = T('選取的筆記都已經是這個設定，沒有要改的。');
      B.confirm = null;
      return U.render();
    }
    if (plan.newlyPublic.length && !confirmed) {
      B.confirm = plan;
      return U.render();
    }
    B.confirm = null;
    B.busy = true;
    B.msg = '';
    B.err = '';
    B.progress = '';
    U.render();
    var done = 0,
      upd = 0,
      fail = [],
      stop = '';
    var chunks = [];
    for (var i = 0; i < plan.todo.length; i += CHUNK) chunks.push(plan.todo.slice(i, i + CHUNK));
    function next(k) {
      if (k >= chunks.length || stop) return Promise.resolve();
      B.progress = T('處理中：{1} / {2}', done, plan.todo.length);
      U.render();
      var p = Object.assign({ ids: chunks[k] }, c);
      if (confirmed) p.confirmPublic = true;
      return api('updateNotes', p)
        .then(function (r) {
          if (!r.ok) {
            stop = T.all(r.reasons || [r.error || T('無法完成')]).join(T('；'));
            chunks[k].forEach(function (id) {
              fail.push({ id: id, reason: stop });
            });
            return;
          }
          upd += r.updated.length;
          r.failed.forEach(function (f) {
            fail.push(f);
          });
          r.updated.concat(r.unchanged).forEach(function (id) {
            delete B.ids[id];
          });
          done += chunks[k].length;
          return next(k + 1);
        })
        .catch(function (e) {
          stop = e.message;
          chunks[k].forEach(function (id) {
            fail.push({ id: id, reason: e.message });
          });
        });
    }
    return next(0)
      .then(function () {
        for (var j = 0; j < chunks.length; j++) {
          // 因中途停止而沒送出的批次，也算「未處理」，留在選取中
          chunks[j].forEach(function (id) {
            if (
              B.ids[id] &&
              !fail.some(function (f) {
                return f.id === id;
              })
            )
              fail.push({ id: id, reason: T('未處理') });
          });
        }
        return U.reload();
      })
      .then(function () {
        B.busy = false;
        B.progress = '';
        prune();
        var parts = [T('已更新 {1} 則', upd)];
        if (plan.same.length) parts.push(T('{1} 則本來就一樣', plan.same.length));
        B.msg = parts.join(T('；'));
        if (fail.length)
          B.err = T(
            '{1} 則沒有成功（仍保留在選取中，可重試）：{2}',
            fail.length,
            fail
              .slice(0, 5)
              .map(function (f) {
                var it = S.byId[f.id];
                return T('{1}（{2}）', it ? it.title : f.id, T(f.reason));
              })
              .join(T('、')) + (fail.length > 5 ? T('…另有 {1} 項', fail.length - 5) : '')
          );
        U.render();
      })
      .catch(function (e) {
        B.busy = false;
        B.err = e.message;
        U.render();
      });
  }

  /** 批次刪除：移到 Drive 垃圾桶（可從 Drive 還原）。每批 30 則，逐則回報，失敗的留在選取中。 */
  function runDelete() {
    prune();
    var ids = Object.keys(B.ids);
    if (!ids.length) return;
    B.del = false;
    B.busy = true;
    B.msg = '';
    B.err = '';
    B.progress = '';
    U.render();
    var done = 0,
      gone = 0,
      fail = [],
      stop = '';
    var chunks = [];
    for (var i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
    function next(k) {
      if (k >= chunks.length || stop) return Promise.resolve();
      B.progress = T('處理中：{1} / {2}', done, ids.length);
      U.render();
      return api('deleteNotes', { ids: chunks[k] })
        .then(function (r) {
          if (!r.ok) {
            stop = T.all(r.reasons || [r.error || T('無法完成')]).join(T('；'));
            chunks[k].forEach(function (id) {
              fail.push({ id: id, reason: stop });
            });
            return;
          }
          r.deleted.forEach(function (id) {
            gone++;
            delete B.ids[id];
          });
          r.failed.forEach(function (f) {
            fail.push(f);
          });
          done += chunks[k].length;
          return next(k + 1);
        })
        .catch(function (e) {
          stop = e.message;
          chunks[k].forEach(function (id) {
            fail.push({ id: id, reason: e.message });
          });
        });
    }
    return next(0)
      .then(function () {
        for (var j = 0; j < chunks.length; j++)
          chunks[j].forEach(function (id) {
            if (
              B.ids[id] &&
              !fail.some(function (f) {
                return f.id === id;
              })
            )
              fail.push({ id: id, reason: T('未處理') });
          });
        return U.reload();
      })
      .then(function () {
        B.busy = false;
        B.progress = '';
        prune();
        B.msg = T('已刪除 {1} 則（移到 Drive 垃圾桶）', gone);
        if (fail.length)
          B.err = T(
            '{1} 則沒有成功（仍保留在選取中，可重試）：{2}',
            fail.length,
            fail
              .slice(0, 5)
              .map(function (f) {
                var it = S.byId[f.id];
                return T('{1}（{2}）', it ? it.title : f.id, T(f.reason));
              })
              .join(T('、'))
          );
        U.render();
      })
      .catch(function (e) {
        B.busy = false;
        B.err = e.message;
        U.render();
      });
  }

  U.selBar = function (main, list) {
    boxes = {};
    sum = null;
    goBtn = null;
    delBtn = null;
    if (!S.me.isOwner || !U.canNew()) return;
    var toggle = el('button', {
      type: 'button',
      class: 'tbtn' + (B.on ? ' on' : ''),
      id: 'b-toggle',
      'aria-pressed': B.on ? 'true' : 'false',
      text: B.on ? T('結束多選') : T('多選'),
      onclick: function () {
        B.on = !B.on;
        if (!B.on) {
          B.ids = {};
          B.confirm = null;
          B.msg = '';
          B.err = '';
        }
        U.render();
      }
    });
    if (!B.on) {
      main.appendChild(el('p', { class: 'row' }, [toggle]));
      return;
    }
    prune();
    var topicSel = el(
      'select',
      { id: 'b-topic', 'aria-label': T('移到主題') },
      [
        el('option', { value: '', text: T('— 移到主題 —') }),
        el('option', { value: '__none__', text: T('未歸類') })
      ].concat(
        S.topics
          .slice()
          .sort(function (a, b) {
            return String(a.title).localeCompare(String(b.title), 'zh-Hant');
          })
          .map(function (t) {
            return el('option', { value: t.id, text: t.title });
          })
      )
    );
    topicSel.value = B.topic;
    var pubSel = el(
      'select',
      { id: 'b-pub', 'aria-label': T('公開設定') },
      [
        ['', T('— 公開設定 —')],
        ['true', T('設為公開')],
        ['false', T('設為私人')],
        ['null', T('依主題預設')]
      ].map(function (o) {
        return el('option', { value: o[0], text: o[1] });
      })
    );
    pubSel.value = B.pub;
    topicSel.addEventListener('change', function () {
      B.topic = topicSel.value;
      B.confirm = null;
      paintSummary();
    });
    pubSel.addEventListener('change', function () {
      B.pub = pubSel.value;
      B.confirm = null;
      paintSummary();
    });
    sum = el('strong', { id: 'b-sum', role: 'status' });
    goBtn = el('button', {
      type: 'button',
      class: 'primary',
      id: 'b-go',
      text: T('套用'),
      onclick: function () {
        run(false);
      }
    });
    var bar = el('div', { class: 'selbar', role: 'region', 'aria-label': T('批次修改') }, [
      el('div', { class: 'row' }, [
        toggle,
        sum,
        el('button', {
          type: 'button',
          class: 'linkbtn',
          id: 'b-all',
          text: T('全選目前結果（{1} 則）', list.length),
          onclick: function () {
            list.forEach(function (it) {
              B.ids[it.id] = 1;
            });
            B.confirm = null;
            U.render();
          }
        }),
        el('button', {
          type: 'button',
          class: 'linkbtn',
          id: 'b-none',
          text: T('清除選取'),
          onclick: function () {
            B.ids = {};
            B.confirm = null;
            U.render();
          }
        })
      ]),
      el('div', { class: 'row' }, [
        topicSel,
        pubSel,
        goBtn,
        (delBtn = el('button', {
          type: 'button',
          class: 'tbtn danger',
          id: 'b-del',
          text: T('刪除'),
          onclick: function () {
            B.del = true;
            B.confirm = null;
            U.render();
          }
        }))
      ])
    ]);
    if (B.del && count()) {
      var dts = Object.keys(B.ids)
        .slice(0, 5)
        .map(function (id) {
          return S.byId[id] ? S.byId[id].title : id;
        })
        .join(T('、'));
      bar.appendChild(
        el('section', { class: 'panel', role: 'alertdialog', id: 'b-del-confirm' }, [
          el('h3', { text: T('確定刪除這些筆記？') }),
          el('p', {
            text: T(
              '將刪除 {1} 則：{2}{3}。檔案會移到 Drive 垃圾桶，其他筆記中指向它們的連結會失效。',
              count(),
              dts,
              count() > 5 ? T('…另有 {1} 項', count() - 5) : ''
            )
          }),
          el('div', { class: 'row' }, [
            el('button', {
              type: 'button',
              class: 'tbtn danger',
              id: 'b-del-ok',
              text: T('確認刪除'),
              onclick: runDelete
            }),
            el('button', {
              type: 'button',
              class: 'tbtn',
              text: T('取消'),
              onclick: function () {
                B.del = false;
                U.render();
              }
            })
          ])
        ])
      );
    }
    if (B.progress) bar.appendChild(el('p', { class: 'sub', role: 'status', text: B.progress }));
    if (B.confirm) {
      var titles = B.confirm.newlyPublic
        .slice(0, 5)
        .map(function (id) {
          return S.byId[id].title;
        })
        .join(T('、'));
      bar.appendChild(
        el('section', { class: 'panel', role: 'alertdialog', id: 'b-confirm' }, [
          el('h3', { text: T('有筆記會變成公開') }),
          el('p', {
            text: T(
              '這個批次會讓 {1} 則筆記變成公開，訪客都看得到：{2}{3}',
              B.confirm.newlyPublic.length,
              titles,
              B.confirm.newlyPublic.length > 5 ? T('…另有 {1} 項', B.confirm.newlyPublic.length - 5) : ''
            )
          }),
          el('div', { class: 'row' }, [
            el('button', {
              type: 'button',
              class: 'tbtn danger',
              id: 'b-confirm-ok',
              text: T('確認並套用'),
              onclick: function () {
                run(true);
              }
            }),
            el('button', {
              type: 'button',
              class: 'tbtn',
              text: T('取消'),
              onclick: function () {
                B.confirm = null;
                U.render();
              }
            })
          ])
        ])
      );
    }
    if (B.msg) bar.appendChild(el('p', { class: 'sub', role: 'status', id: 'b-msg', text: B.msg }));
    if (B.err) bar.appendChild(el('p', { class: 'err', role: 'alert', id: 'b-err', text: B.err }));
    main.appendChild(bar);
    paintSummary();
  };
})();
