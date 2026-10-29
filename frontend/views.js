/**
 * views.js — 列表／圖庫／日曆三種檢視（P3）
 * 三種檢視讀的是同一份索引（S.items）；切換只改畫面，不寫入任何資料。
 * 圖庫的封面圖來自筆記的 cover（SVG id），進入可視範圍才向後端取（getSvg），一律用 <img> 顯示。
 */
(function () {
  'use strict';
  var U = window.VaultUI,
    L = VaultLogic,
    S = U.S,
    el = U.el,
    api = U.api;
  var GALLERY_PAGE = 48;
  var covers = {}; // svgId -> data URL 或 false（取不到）；只在記憶體
  var cal = null; // { y, m, sel }

  function today() {
    var d = new Date();
    return L.ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  function fmt(opts, y, m, d) {
    try {
      return new Intl.DateTimeFormat(
        window.VaultI18n.get() === 'zh-Hant' ? 'zh-TW' : window.VaultI18n.get(),
        Object.assign({ timeZone: 'UTC' }, opts)
      ).format(new Date(Date.UTC(y, m - 1, d || 1)));
    } catch (e) {
      return y + '-' + m;
    }
  }

  /* ───── 檢視切換列＋日期範圍／排序 ───── */
  function setMode(mode) {
    S.v.mode = mode;
    S.shown = 48;
    U.render();
  }
  /** 實際生效的檢視：「分類」只在沒有任何篩選的首頁有意義，有篩選時退回列表。 */
  U.viewMode = function () {
    return S.v.mode === 'cats' && (S.f.topic || S.f.q || S.f.tag || S.f.status) ? 'list' : S.v.mode;
  };
  U.viewChrome = function (main) {
    var tabs = el('div', { class: 'vtabs', role: 'tablist', 'aria-label': T('檢視方式') });
    var home = !(S.f.topic || S.f.q || S.f.tag || S.f.status);
    [['list', T('列表')]]
      .concat(home ? [['cats', T('分類')]] : [], [
        ['gallery', T('圖庫')],
        ['calendar', T('日曆')]
      ])
      .forEach(function (t) {
        var on = U.viewMode() === t[0];
        tabs.appendChild(
          el('button', {
            type: 'button',
            role: 'tab',
            class: 'vtab' + (on ? ' on' : ''),
            'aria-selected': on ? 'true' : 'false',
            text: t[1],
            onclick: function () {
              if (!on) setMode(t[0]);
            }
          })
        );
      });
    main.appendChild(tabs);
    if (U.viewMode() === 'calendar' || U.viewMode() === 'cats') return;
    var bar = el('div', { class: 'vbar' });
    var from = el('input', { type: 'date', id: 'v-from', value: S.v.from, 'aria-label': T('起始日期') });
    var to = el('input', { type: 'date', id: 'v-to', value: S.v.to, 'aria-label': T('結束日期') });
    var sort = el(
      'select',
      { id: 'v-sort', 'aria-label': T('排序') },
      [
        ['', T('預設排序')],
        ['date-desc', T('日期：新到舊')],
        ['date-asc', T('日期：舊到新')],
        ['title', T('標題')]
      ].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: S.v.sort === o[0] ? 'selected' : false });
      })
    );
    function apply() {
      S.v.from = from.value;
      S.v.to = to.value;
      S.v.sort = sort.value;
      S.shown = 48;
      U.render();
    }
    from.addEventListener('change', apply);
    to.addEventListener('change', apply);
    sort.addEventListener('change', apply);
    bar.appendChild(el('label', {}, [T('從'), from]));
    bar.appendChild(el('label', {}, [T('到'), to]));
    bar.appendChild(el('label', {}, [T('排序'), sort]));
    if (S.v.from || S.v.to)
      bar.appendChild(
        el('button', {
          type: 'button',
          class: 'linkbtn',
          text: T('清除日期'),
          onclick: function () {
            S.v.from = '';
            S.v.to = '';
            U.render();
          }
        })
      );
    main.appendChild(bar);
  };

  /* ───── 圖庫 ───── */
  function coverInto(img, id) {
    if (covers[id] === false) return;
    if (covers[id]) {
      img.src = covers[id];
      img.hidden = false;
      img.parentNode.classList.add('has');
      return;
    }
    api('getSvg', { id: id })
      .then(function (r) {
        if (!r || !r.ok) {
          covers[id] = false;
          return;
        }
        covers[id] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.svg);
        if (img.isConnected) {
          img.src = covers[id];
          img.hidden = false;
          img.parentNode.classList.add('has');
        }
      })
      .catch(function () {
        covers[id] = false;
      });
  }
  var io = null;
  function observe(img, id) {
    if (!('IntersectionObserver' in window)) return coverInto(img, id);
    if (!io)
      io = new IntersectionObserver(
        function (es) {
          es.forEach(function (e) {
            if (e.isIntersecting) {
              io.unobserve(e.target);
              coverInto(e.target.querySelector('img'), e.target.getAttribute('data-cover'));
            }
          });
        },
        { rootMargin: '200px' }
      );
    img.parentNode.setAttribute('data-cover', id);
    io.observe(img.parentNode); // 圖本身是 hidden（display:none）時觀察器不會觸發，所以觀察外層
  }
  U.renderGallery = function (main, list) {
    if (io) io.disconnect();
    if (!list.length) {
      main.appendChild(
        el('p', {
          class: 'empty',
          text: S.items.length ? T('沒有符合的筆記。') : T('目前沒有可顯示的筆記。')
        })
      );
      return;
    }
    var grid = el('ul', { class: 'gal' });
    list.slice(0, S.shown).forEach(function (it) {
      var thumb = el('div', { class: 'thumb', 'aria-hidden': 'true' }, [
        el('span', {
          class: 'ph',
          text: String(it.title || '?')
            .trim()
            .charAt(0)
            .toUpperCase()
        })
      ]);
      var img = el('img', { alt: '', hidden: 'hidden', decoding: 'async' });
      thumb.appendChild(img);
      if (it.cover) observe(img, it.cover);
      var tags = (it.tags || [])
        .slice(0, 3)
        .map(function (t) {
          return '#' + t;
        })
        .join(' ');
      var meta = [it.date, U.topicTitle(it.topic)].filter(Boolean).join(T('　·　'));
      grid.appendChild(
        el('li', {}, [
          el(
            'a',
            {
              class: 'card',
              href: L.buildRoute({ note: it.id, lang: S.f.lang }),
              onclick: function (e) {
                e.preventDefault();
                if (U.selClick && U.selClick(it.id)) return;
                U.openNote(it.id);
              }
            },
            [
              U.selBox ? U.selBox(it.id) : null,
              thumb,
              el('span', { class: 'ct', text: it.title }),
              el('span', { class: 'cm', text: meta }),
              tags ? el('span', { class: 'cm', text: tags }) : null
            ]
          )
        ])
      );
    });
    main.appendChild(grid);
    if (list.length > S.shown)
      main.appendChild(
        el('button', {
          type: 'button',
          class: 'more',
          text: T('顯示更多（還有 {1} 則）', list.length - S.shown),
          onclick: function () {
            S.shown += GALLERY_PAGE;
            U.render();
          }
        })
      );
  };

  /* ───── 日曆 ───── */
  U.renderCalendar = function (main, list) {
    if (!cal) {
      var t = L.parseYmd(today());
      cal = { y: t.y, m: t.m, sel: '' };
    }
    var g = L.monthGrid(list, cal.y, cal.m),
      now = today();
    function shift(d) {
      var m = cal.m + d,
        y = cal.y;
      if (m < 1) {
        m = 12;
        y--;
      }
      if (m > 12) {
        m = 1;
        y++;
      }
      cal.y = y;
      cal.m = m;
      cal.sel = '';
      U.render();
    }
    main.appendChild(
      el('div', { class: 'cal-bar' }, [
        el('button', {
          type: 'button',
          class: 'tbtn',
          text: '‹',
          'aria-label': T('上個月'),
          onclick: function () {
            shift(-1);
          }
        }),
        el('strong', {
          class: 'cal-title',
          role: 'status',
          text: fmt({ year: 'numeric', month: 'long' }, cal.y, cal.m)
        }),
        el('button', {
          type: 'button',
          class: 'tbtn',
          text: '›',
          'aria-label': T('下個月'),
          onclick: function () {
            shift(1);
          }
        }),
        el('button', {
          type: 'button',
          class: 'tbtn',
          text: T('今天'),
          onclick: function () {
            var t = L.parseYmd(now);
            cal.y = t.y;
            cal.m = t.m;
            cal.sel = now;
            U.render();
          }
        })
      ])
    );
    var table = el('div', {
      class: 'cal',
      role: 'grid',
      'aria-label': fmt({ year: 'numeric', month: 'long' }, cal.y, cal.m)
    });
    var head = el('div', { class: 'cal-row cal-head', role: 'row' });
    for (var i = 0; i < 7; i++)
      head.appendChild(el('span', { role: 'columnheader', text: fmt({ weekday: 'short' }, 2023, 1, 1 + i) })); // 2023-01-01 是週日
    table.appendChild(head);
    g.weeks.forEach(function (wk) {
      var row = el('div', { class: 'cal-row', role: 'row' });
      wk.forEach(function (c) {
        var n = c.items.length,
          cls =
            'cal-day' +
            (c.inMonth ? '' : ' out') +
            (c.date === now ? ' today' : '') +
            (c.date === cal.sel ? ' sel' : '');
        var lbl = n ? T('{1}，{2} 則', c.date, n) : c.date;
        var b = el(
          'button',
          {
            type: 'button',
            role: 'gridcell',
            class: cls,
            'data-date': c.date,
            'aria-label': lbl,
            'aria-pressed': c.date === cal.sel ? 'true' : 'false'
          },
          [
            el('span', { class: 'dn', text: String(c.day) }),
            n ? el('span', { class: 'dc', text: String(n) }) : null
          ]
        );
        b.addEventListener('click', function () {
          cal.sel = c.date;
          U.render();
        });
        if (U.canNew && U.canNew())
          b.addEventListener('dblclick', function () {
            newOn(c.date);
          });
        row.appendChild(b);
      });
      table.appendChild(row);
    });
    main.appendChild(table);
    if (cal.sel) {
      var day = null;
      g.weeks.forEach(function (w) {
        w.forEach(function (c) {
          if (c.date === cal.sel) day = c;
        });
      });
      var items = day ? day.items : [];
      var sec = el('section', { class: 'cal-day-list' }, [el('h3', { text: cal.sel })]);
      if (U.canNew && U.canNew())
        sec.appendChild(
          el('p', {}, [
            el('button', {
              type: 'button',
              class: 'tbtn',
              id: 'cal-new',
              text: T('在這天新增筆記'),
              onclick: function () {
                newOn(cal.sel);
              }
            })
          ])
        );
      if (!items.length) sec.appendChild(el('p', { class: 'empty', text: T('這天沒有筆記。') }));
      else
        sec.appendChild(
          el(
            'ul',
            { class: 'list' },
            items.map(function (it) {
              return el('li', {}, [
                el(
                  'a',
                  {
                    class: 'item',
                    href: L.buildRoute({ note: it.id, lang: S.f.lang }),
                    onclick: function (e) {
                      e.preventDefault();
                      U.openNote(it.id);
                    }
                  },
                  [
                    el('span', { class: 't', text: it.title }),
                    el('span', { class: 'm', text: U.topicTitle(it.topic) })
                  ]
                )
              ]);
            })
          )
        );
      main.appendChild(sec);
    }
    if (g.undated.length)
      main.appendChild(
        el('p', { class: 'sub', text: T('另有 {1} 則沒有日期，不會出現在日曆上。', g.undated.length) })
      );
  };
  /** 雙擊或按鈕新增：歸入目前選的主題，沒有選就是未歸類。 */
  function newOn(date) {
    U.openEditor(null, { date: date });
  }
})();
