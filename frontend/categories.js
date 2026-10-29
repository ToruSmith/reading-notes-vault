/**
 * categories.js — 首頁的「分類」頁簽（P14）：依分類列出主題卡片，分類可收合；擁有者在編輯模式可調整順序。
 * 順序資料是 S.order（{cats, topics}），與書櫃共用；排序／移動的純函式在 logic.js（buildShelf／moveCategory／moveTopic）。
 * 儲存走後端 saveOrder（只有擁有者能呼叫）；先更新畫面，失敗就還原並顯示訊息。
 */
(function () {
  'use strict';
  var U = window.VaultUI,
    L = VaultLogic,
    S = U.S,
    el = U.el,
    api = U.api;
  var openCats = null; // 展開中的分類名稱（Set 以物件表示）；null＝第一次進來，預設只展開第一個
  var notice = '';

  /** 目前（含語言篩選）的分類清單，並算出每個主題的最近更新日。 */
  function model() {
    var items = S.f.lang
      ? S.items.filter(function (it) {
          return L.langOk(it, S.f.lang);
        })
      : S.items;
    var last = {};
    items.forEach(function (it) {
      if (it.topic && it.date && (!last[it.topic] || it.date > last[it.topic])) last[it.topic] = it.date;
    });
    return { shelf: L.buildShelf(items, S.topics, S.order), last: last };
  }
  function editing() {
    return !!(U.canNew && U.canNew());
  }

  /** 套用新順序：先改畫面，後端失敗就還原。 */
  function applyOrder(next) {
    if (!next) return;
    var prev = S.order;
    S.order = next;
    notice = '';
    U.render();
    api('saveOrder', next)
      .then(function (r) {
        if (!r || !r.ok) throw new Error((r && r.error) || T('儲存失敗'));
      })
      .catch(function (e) {
        S.order = prev;
        notice = T('順序沒有儲存成功：{1}', e.message);
        U.render();
      });
  }

  function arrows(label, onUp, onDown, canUp, canDown) {
    return el('span', { class: 'ord' }, [
      el('button', {
        type: 'button',
        class: 'ordbtn',
        'aria-label': T('上移：{1}', label),
        title: T('上移'),
        text: '↑',
        disabled: canUp ? false : 'disabled',
        onclick: function (e) {
          e.stopPropagation();
          onUp();
        }
      }),
      el('button', {
        type: 'button',
        class: 'ordbtn',
        'aria-label': T('下移：{1}', label),
        title: T('下移'),
        text: '↓',
        disabled: canDown ? false : 'disabled',
        onclick: function (e) {
          e.stopPropagation();
          onDown();
        }
      })
    ]);
  }

  function topicCard(t, last, cats, idx, edit) {
    var card = el('div', { class: 'tcard' }, [
      el(
        'button',
        {
          type: 'button',
          class: 'tcard-main',
          onclick: function () {
            U.go({ topic: t.id });
          }
        },
        [
          el('span', { class: 'tcard-t', text: t.title }),
          el('span', {
            class: 'tcard-m',
            text: T('{1} 則', t.count) + (last[t.id] ? T('　·　最近 {1}', last[t.id]) : '')
          })
        ]
      )
    ]);
    if (S.me.isOwner)
      card.firstChild.appendChild(el('span', { class: 'flag', text: t.pub ? T('公開') : T('私人') }));
    if (edit) {
      var ts = cats[idx.c].topics;
      card.appendChild(
        arrows(
          t.title,
          function () {
            applyOrder(L.moveTopic(cats, t.id, -1));
          },
          function () {
            applyOrder(L.moveTopic(cats, t.id, 1));
          },
          idx.t > 0,
          idx.t < ts.length - 1
        )
      );
    }
    return card;
  }

  U.renderCategories = function (main) {
    var m = model(),
      cats = m.shelf.categories,
      edit = editing(),
      named = cats.filter(function (c) {
        return c.name;
      });
    if (notice) main.appendChild(el('p', { class: 'err', role: 'alert', text: notice }));
    if (edit)
      main.appendChild(el('p', { class: 'sub', text: T('用 ↑↓ 調整分類與主題的順序，書櫃也會跟著變。') }));
    var shown = 0;
    cats.forEach(function (c, ci) {
      var ts = c.topics
        .map(function (t, ti) {
          return { t: t, ti: ti };
        })
        .filter(function (x) {
          return edit || x.t.count > 0;
        });
      if (!ts.length) return;
      var name = c.name || T('未分類'),
        key = c.name,
        ni = named.indexOf(c);
      if (!openCats) ((openCats = {}), (openCats[key] = true));
      var box = el('details', { class: 'catbox', open: openCats[key] ? 'open' : false }, [
        el('summary', {}, [
          el('span', { class: 'catname', text: name }),
          el('span', { class: 'catn', text: T('{1} 個主題', ts.length) }),
          edit && c.name
            ? arrows(
                name,
                function () {
                  applyOrder(L.moveCategory(cats, c.name, -1));
                },
                function () {
                  applyOrder(L.moveCategory(cats, c.name, 1));
                },
                ni > 0,
                ni < named.length - 1
              )
            : null
        ])
      ]);
      box.addEventListener('toggle', function () {
        openCats[key] = box.open;
      });
      var grid = el('div', { class: 'tgrid' });
      ts.forEach(function (x) {
        grid.appendChild(topicCard(x.t, m.last, cats, { c: ci, t: x.ti }, edit));
      });
      box.appendChild(grid);
      main.appendChild(box);
      shown++;
    });
    if (m.shelf.none > 0)
      main.appendChild(
        el('p', { class: 'sub' }, [
          el('button', {
            type: 'button',
            class: 'linkbtn',
            text: T('未歸類筆記：{1} 則', m.shelf.none),
            onclick: function () {
              U.go({ topic: L.NONE });
            }
          })
        ])
      );
    if (!shown) main.appendChild(el('p', { class: 'empty', text: T('目前沒有可顯示的主題。') }));
  };
})();
