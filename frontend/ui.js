/**
 * ui.js — 畫面（P1 第一步：唯讀的書櫃、列表、搜尋、筆記檢視）
 * 所有文字用 textContent 寫入；只有 Markdown 的輸出用 innerHTML，而渲染器已禁止原始 HTML（見 logic.js）。
 * 前端不持有任何金鑰；公開與否完全由後端決定。
 */
(function () {
  'use strict';
  var L = VaultLogic,
    md = L.makeMarkdown(window.markdownit);
  var PAGE = 100;
  var S = {
    items: [],
    topics: [],
    order: { cats: [], topics: [] },
    tmap: {},
    byId: {},
    back: {},
    me: { isOwner: false },
    f: { topic: '', status: '', tag: '', q: '', lang: '' },
    v: { mode: 'list', from: '', to: '', sort: '' },
    shown: PAGE,
    note: null
  };
  var $ = function (id) {
    return document.getElementById(id);
  };
  var narrow = window.matchMedia('(max-width: 799px)');
  var FEATURES = { mobileEdit: true, canvasTouchEdit: false }; // 規劃書 6.7：旗標只控制介面，權限一律由後端判斷
  /** 擁有者的「閱讀／編輯」模式：預設閱讀（所有編輯入口收起，避免閱讀時誤點）；選擇記在這個瀏覽器。權限本身仍由後端判斷。 */
  function loadEditMode() {
    try {
      return localStorage.getItem('vault-editmode') === '1';
    } catch (e) {
      return false;
    }
  }
  function canEdit() {
    return S.me.isOwner && S.editMode === true && (!narrow.matches || FEATURES.mobileEdit);
  }
  function setEditMode(on) {
    if (
      !on &&
      U.canvasDirty &&
      U.canvasDirty() &&
      !window.confirm(T('這張畫布還有沒儲存的修改，確定要離開嗎？'))
    )
      return;
    S.editMode = !!on;
    try {
      localStorage.setItem('vault-editmode', on ? '1' : '0');
    } catch (e) {
      /* 略 */
    }
    paintHeader();
    if (S.canvas && U.reopenCanvas) U.reopenCanvas();
    else render();
  }

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) {
      if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  function api(action, payload) {
    return new Promise(function (resolve, reject) {
      var g = window.google;
      if (!(g && g.script && g.script.run)) return reject(new Error(T('請從部署網址開啟這個頁面')));
      g.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(function (e) {
          reject(new Error((e && e.message) || T('連線失敗')));
        })
        .api(action, payload || {});
    });
  }

  function topicTitle(id) {
    return id && S.tmap[id] ? S.tmap[id].title : '';
  }
  function go(patch) {
    Object.keys(patch).forEach(function (k) {
      S.f[k] = patch[k];
    });
    S.notice = '';
    if (U.leaveCanvas && !U.leaveCanvas()) return;
    S.note = null;
    S.edit = null;
    S.up = null;
    S.zip = null;
    S.settings = false;
    S.topicEd = null;
    S.pub = null;
    S.sync = null;
    S.shown = PAGE;
    render();
    if (narrow.matches) $('shelf').open = false;
    else closeMiniShelf();
    $('main').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  /* ───── 書櫃 ───── */
  function pill(label, count, on, fn, vis) {
    // vis：'pub'／'priv'（擁有者看主題的預設公開狀態）
    return el(
      'button',
      {
        type: 'button',
        class: 'pill' + (on ? ' on' : ''),
        'aria-pressed': on ? 'true' : 'false',
        onclick: fn
      },
      [
        el('span', {}, [
          label,
          vis
            ? el('span', {
                class: 'tg ' + vis,
                text: vis === 'pub' ? T('公開') : T('私人'),
                title: T('主題預設：{1}', vis === 'pub' ? T('公開') : T('私人'))
              })
            : null
        ]),
        count == null ? null : el('span', { class: 'n', text: String(count) })
      ]
    );
  }
  /** 寬螢幕的書櫃：預設收成側邊的小條（點開是浮動面板，選了主題自動收起）；可固定展開。手機版不受影響。選擇記在這個瀏覽器。 */
  /* 閱讀字級：存 vault-fontscale（0.8–1.8，預設 1），以 CSS 變數 --fs 套用在筆記內文 */
  function fontScale() {
    try {
      var v = parseFloat(localStorage.getItem('vault-fontscale'));
      return v >= 0.8 && v <= 1.8 ? v : 1;
    } catch (e) {
      return 1;
    }
  }
  function applyFontScale(v) {
    try {
      document.documentElement.style.setProperty('--fs', String(v));
    } catch (e) {
      /* 無 DOM 時略過 */
    }
    return v;
  }
  function setFontScale(v) {
    v = Math.min(1.8, Math.max(0.8, Math.round(v * 10) / 10));
    try {
      localStorage.setItem('vault-fontscale', String(v));
    } catch (e) {
      /* 略 */
    }
    return applyFontScale(v);
  }
  function shelfMini() {
    try {
      return localStorage.getItem('vault-shelfmini') !== '0';
    } catch (e) {
      return true;
    }
  }
  function setShelfMini(on) {
    try {
      localStorage.setItem('vault-shelfmini', on ? '1' : '0');
    } catch (e) {
      /* 略 */
    }
    document.body.classList.toggle('shelf-mini', on);
    $('shelf').open = !on;
    renderShelf();
  }
  function closeMiniShelf() {
    if (!narrow.matches && document.body.classList.contains('shelf-mini') && $('shelf').open)
      $('shelf').open = false;
  }
  document.addEventListener('pointerdown', function (e) {
    if (e.target.closest && !e.target.closest('#shelf')) closeMiniShelf();
  });
  document.addEventListener('keydown', function (e) {
    if (
      e.key === 'Escape' &&
      document.body.classList.contains('shelf-mini') &&
      !narrow.matches &&
      $('shelf').open &&
      !e.defaultPrevented
    )
      closeMiniShelf();
  });
  function renderShelf() {
    var sh = L.buildShelf(
        S.f.lang
          ? S.items.filter(function (it) {
              return L.langOk(it, S.f.lang);
            })
          : S.items,
        S.topics,
        S.order
      ),
      box = $('shelfBody');
    box.textContent = '';
    box.appendChild(
      el('button', {
        type: 'button',
        class: 'linkbtn shelf-pin',
        id: 'shelf-pin',
        'aria-pressed': shelfMini() ? 'false' : 'true',
        title: T('寬螢幕：書櫃固定展開，或收成側邊的小條'),
        text: shelfMini() ? T('📌 固定展開') : T('« 收成側邊'),
        onclick: function () {
          setShelfMini(!shelfMini());
        }
      })
    );
    box.appendChild(
      pill(T('全部'), sh.total, !S.f.topic, function () {
        go({ topic: '', status: '', tag: '' });
      })
    );
    if (sh.statuses.length) {
      box.appendChild(el('h3', { text: T('狀態') }));
      box.appendChild(
        el(
          'div',
          { class: 'chips' },
          sh.statuses.map(function (s) {
            var on = S.f.status === s;
            return el('button', {
              type: 'button',
              class: 'chip' + (on ? ' on' : ''),
              'aria-pressed': on ? 'true' : 'false',
              text: s,
              onclick: function () {
                go({ status: on ? '' : s });
              }
            });
          })
        )
      );
    }
    sh.categories.forEach(function (c) {
      var ts = c.topics.filter(function (t) {
        return !S.f.status || t.status === S.f.status;
      });
      if (!ts.length) return;
      box.appendChild(el('h3', { text: c.name || T('未分類') }));
      ts.forEach(function (t) {
        box.appendChild(
          pill(
            t.title,
            t.count,
            S.f.topic === t.id,
            function () {
              go({ topic: t.id });
            },
            S.me.isOwner ? (t.pub ? 'pub' : 'priv') : ''
          )
        );
      });
    });
    if (sh.none > 0) {
      box.appendChild(el('h3', { text: T('其他') }));
      box.appendChild(
        pill(T('未歸類'), sh.none, S.f.topic === L.NONE, function () {
          go({ topic: L.NONE });
        })
      );
    }
    if (canEdit() && U.openTopicEditor)
      box.appendChild(
        el('button', {
          type: 'button',
          class: 'tbtn wide',
          id: 't-new',
          text: T('＋ 新增主題'),
          onclick: function () {
            U.openTopicEditor(null);
          }
        })
      );
  }

  /* ───── 列表 ───── */
  function heading() {
    if (S.f.q) return T('搜尋「{1}」', S.f.q);
    if (S.f.topic === L.NONE) return T('未歸類');
    return S.f.topic ? topicTitle(S.f.topic) : T('全部筆記');
  }
  function flag(it) {
    if (!S.me.isOwner) return null;
    return el('span', { class: 'flag', text: L.effectivePublic(it, S.tmap) ? T('公開') : T('私人') });
  }
  function renderList() {
    var list = L.filterItems(S.items, S.topics, S.f, U.bodies),
      main = $('main');
    var mode = U.viewMode ? U.viewMode() : S.v.mode; // views.js 沒載入時（單元測試）就用原值
    if (mode === 'list' || mode === 'gallery') list = L.refine(list, S.v); // 日期範圍、排序（P3；只改顯示，不改資料）
    var qt = L.tokenize(S.f.q).filter(function (t) {
      return t.length >= 2;
    });
    if (S.f.q && !qt.length) qt = L.tokenize(S.f.q);
    main.textContent = '';
    main.appendChild(el('h2', { text: heading() }));
    if (U.flash) {
      main.appendChild(el('p', { class: 'sub', role: 'status', id: 'flash', text: U.flash }));
      U.flash = '';
    }
    if (S.notice && !S.f.topic)
      main.appendChild(el('p', { class: 'sub', role: 'status', id: 'route-notice', text: S.notice }));
    var sub = [T('{1} 則', list.length)];
    if (S.me.isOwner && S.f.topic && S.f.topic !== L.NONE && S.tmap[S.f.topic])
      sub.push(T('主題預設：{1}', S.tmap[S.f.topic].defaultPublic === true ? T('公開') : T('私人')));
    if (S.f.status) sub.push(T('狀態：{1}', S.f.status));
    if (S.f.q && U.ftStatus && U.ftStatus()) sub.push(U.ftStatus());
    if (S.f.topic && S.f.topic !== L.NONE && !S.f.q && S.tmap[S.f.topic])
      main.appendChild(
        el('p', { class: 'row' }, [
          el('button', {
            type: 'button',
            class: 'tbtn',
            text: T('開啟畫布'),
            onclick: function () {
              U.openCanvas(S.f.topic);
            }
          }),
          el('button', {
            type: 'button',
            class: 'tbtn',
            id: 't-share',
            text: T('分享連結'),
            'aria-pressed': S.shareTopic === S.f.topic ? 'true' : 'false',
            onclick: function () {
              S.shareTopic = S.shareTopic === S.f.topic ? '' : S.f.topic;
              renderList();
            }
          }),
          canEdit() && U.setTopicPublic
            ? el('button', {
                type: 'button',
                class: 'tbtn',
                id: 't-pubtoggle',
                disabled: S.topicBusy ? 'disabled' : false,
                title: T('畫布的公開與否跟著主題'),
                text: S.tmap[S.f.topic].defaultPublic === true ? T('改為私人') : T('改為公開'),
                onclick: function () {
                  U.setTopicPublic(S.f.topic, S.tmap[S.f.topic].defaultPublic !== true);
                }
              })
            : null,
          canEdit() && U.openTopicEditor
            ? el('button', {
                type: 'button',
                class: 'tbtn',
                id: 't-edit',
                text: T('編輯主題'),
                onclick: function () {
                  U.openTopicEditor(S.f.topic);
                }
              })
            : null
        ])
      );
    if (S.f.topic && S.f.topic !== L.NONE && !S.f.q && S.tmap[S.f.topic] && S.shareTopic === S.f.topic)
      main.appendChild(shareBox(S.f.topic, false));
    main.appendChild(
      el('p', { class: 'sub' }, [
        sub.join(T('　·　')),
        S.f.tag
          ? el('span', {}, [
              T('　·　標籤：{1} ', S.f.tag),
              el('button', {
                type: 'button',
                class: 'linkbtn',
                text: T('清除'),
                onclick: function () {
                  go({ tag: '' });
                }
              })
            ])
          : null
      ])
    );
    if (U.viewChrome) U.viewChrome(main);
    if (mode === 'cats' && U.renderCategories) return U.renderCategories(main);
    if (U.selBar && mode !== 'calendar') U.selBar(main, list);
    if (mode === 'calendar' && U.renderCalendar) return U.renderCalendar(main, list);
    if (!list.length) {
      main.appendChild(
        el('p', {
          class: 'empty',
          text: S.items.length ? T('沒有符合的筆記。') : T('目前沒有可顯示的筆記。')
        })
      );
      return;
    }
    if (mode === 'gallery' && U.renderGallery) return U.renderGallery(main, list);
    var ul = el('ul', { class: 'list' });
    list.slice(0, S.shown).forEach(function (it) {
      var meta = [
        it.date,
        topicTitle(it.topic),
        (it.tags || [])
          .map(function (t) {
            return '#' + t;
          })
          .join(' ')
      ]
        .filter(Boolean)
        .join(T('　·　'));
      var low = String(it.title).toLowerCase(),
        hit = qt.some(function (t) {
          return low.indexOf(t) >= 0;
        });
      var snip = S.f.q && !hit && U.bodies && U.bodies[it.id] ? L.bodySnippet(U.bodies[it.id], qt) : '';
      ul.appendChild(
        el('li', {}, [
          el(
            'a',
            {
              class: 'item',
              href: L.buildRoute({ note: it.id, lang: S.f.lang }),
              onclick: function (e) {
                e.preventDefault();
                if (U.selClick && U.selClick(it.id)) return;
                openNote(it.id);
              }
            },
            [
              U.selBox ? U.selBox(it.id) : null,
              el('span', { class: 't' }, [it.title, flag(it)]),
              el('span', { class: 'm', text: meta }),
              snip ? el('span', { class: 'm', text: snip }) : null
            ]
          )
        ])
      );
    });
    main.appendChild(ul);
    if (list.length > S.shown)
      main.appendChild(
        el('button', {
          type: 'button',
          class: 'more',
          text: T('顯示更多（還有 {1} 則）', list.length - S.shown),
          onclick: function () {
            S.shown += PAGE;
            renderList();
          }
        })
      );
  }

  /* ───── 筆記 ───── */
  function openNote(id) {
    S.edit = null;
    S.up = null;
    S.zip = null;
    S.settings = false;
    S.topicEd = null;
    S.pub = null;
    S.sync = null;
    S.note = { id: id, loading: true };
    render();
    $('main').focus({ preventScroll: true });
    window.scrollTo(0, 0);
    api('getNote', { id: id })
      .then(function (r) {
        if (!S.note || S.note.id !== id) return;
        S.note = r.ok ? { id: id, data: r } : { id: id, error: T('找不到這則筆記。') };
        renderNote();
      })
      .catch(function (e) {
        if (S.note && S.note.id === id) {
          S.note = { id: id, error: e.message };
          renderNote();
        }
      });
  }
  function loadSvgs(root, action) {
    Array.prototype.forEach.call(root.querySelectorAll('img[data-svg]'), function (img) {
      api(action || 'getSvg', { id: img.getAttribute('data-svg') })
        .then(function (r) {
          if (r.ok)
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.svg); // 一律用 <img>，不內嵌進頁面
          else img.alt = T('（無法顯示的圖）');
        })
        .catch(function () {
          img.alt = T('（無法顯示的圖）');
        });
    });
  }
  /** 圖片卡：同一張圖只抓一次（記憶體快取），同時最多 3 個請求，避免畫布上一次要 30 張圖時塞爆後端。 */
  var imgCache = {},
    imgQ = [],
    imgRun = 0;
  function imgPump() {
    while (imgRun < 3 && imgQ.length) {
      (function (job) {
        imgRun++;
        api(job.action, { id: job.id })
          .then(function (r) {
            var ok =
              r && r.ok && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/]+={0,2}$/.test(r.data || '');
            job.done(ok ? r.data : null);
          })
          .catch(function () {
            job.done(null);
          })
          .then(function () {
            imgRun--;
            imgPump();
          });
      })(imgQ.shift());
    }
  }
  function loadImgs(root, action) {
    Array.prototype.forEach.call(root.querySelectorAll('img[data-img]'), function (img) {
      var id = img.getAttribute('data-img'),
        c = imgCache[id];
      var fill = function (d) {
        if (d) img.src = d;
        else img.alt = T('（無法顯示的圖）');
      };
      if (c && c.data !== undefined) return fill(c.data);
      if (!c) {
        c = imgCache[id] = { cbs: [] };
        imgQ.push({
          id: id,
          action: action || 'getImage',
          done: function (d) {
            c.data = d;
            if (d === null) delete imgCache[id];
            c.cbs.forEach(function (f) {
              f(d);
            });
          }
        });
        imgPump();
      }
      c.cbs.push(fill);
    });
  }
  function imgGet(id, action) {
    return new Promise(function (resolve) {
      var c = imgCache[id];
      if (c && c.data !== undefined) return resolve(c.data);
      if (!c) {
        c = imgCache[id] = { cbs: [] };
        imgQ.push({
          id: id,
          action: action || 'getImage',
          done: function (d) {
            c.data = d;
            if (d === null) delete imgCache[id];
            c.cbs.forEach(function (f) {
              f(d);
            });
          }
        });
        imgPump();
      }
      c.cbs.push(resolve);
    });
  }
  function doDelete(n) {
    n.deleting = true;
    n.delError = '';
    renderNote();
    api('deleteNote', { id: n.id })
      .then(function (r) {
        if (!r.ok) {
          n.deleting = false;
          n.delError = T(r.error || '無法完成');
          return renderNote();
        }
        return reload().then(function () {
          S.note = null;
          S.reading = false;
          U.flash = T('已刪除，筆記已移到 Google Drive 垃圾桶。');
          render();
        });
      })
      .catch(function (e) {
        n.deleting = false;
        n.delError = e.message;
        renderNote();
      });
  }

  /* ───── 沉浸閱讀：隱藏頁首與書櫃，只留內文；書櫃、目錄可從浮動按鈕開關 ───── */
  function enterReading() {
    S.reading = true;
    document.body.classList.remove('rd-shelf', 'rd-toc');
    var de = document.documentElement;
    if (de.requestFullscreen) {
      try {
        var p = de.requestFullscreen();
        if (p && p.catch)
          p.catch(function () {
            /* 不支援全螢幕時只用版面模式 */
          });
      } catch (e) {
        /* 略 */
      }
    }
    render();
  }
  function exitReading() {
    S.reading = false;
    document.body.classList.remove('rd-shelf', 'rd-toc');
    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        document.exitFullscreen();
      } catch (e) {
        /* 略 */
      }
    }
    render();
  }
  // Esc：全螢幕中先由瀏覽器退出全螢幕（留在沉浸版面），再按一次才離開沉浸閱讀
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && S.reading && !document.fullscreenElement) exitReading();
  });
  var rdSize = 1.12;
  function syncBar() {
    ['shelf', 'toc'].forEach(function (k) {
      var b = $('rd-' + k);
      if (b) b.setAttribute('aria-pressed', document.body.classList.contains('rd-' + k) ? 'true' : 'false');
    });
    var tc = $('toc');
    if (tc && document.body.classList.contains('rd-toc')) tc.open = true;
  }
  function readingBar() {
    var b = el('div', { class: 'rd-bar', role: 'toolbar', 'aria-label': T('沉浸閱讀工具') }, [
      el('button', {
        type: 'button',
        class: 'rd-btn',
        id: 'rd-shelf',
        text: T('書櫃'),
        'aria-pressed': document.body.classList.contains('rd-shelf') ? 'true' : 'false',
        onclick: function () {
          document.body.classList.toggle('rd-shelf');
          document.body.classList.remove('rd-toc');
          syncBar();
        }
      }),
      el('button', {
        type: 'button',
        class: 'rd-btn',
        id: 'rd-toc',
        text: T('目錄'),
        'aria-pressed': document.body.classList.contains('rd-toc') ? 'true' : 'false',
        onclick: function () {
          document.body.classList.toggle('rd-toc');
          document.body.classList.remove('rd-shelf');
          syncBar();
        }
      }),
      el('button', {
        type: 'button',
        class: 'rd-btn',
        text: 'A−',
        'aria-label': T('縮小字級'),
        onclick: function () {
          rdSize = Math.max(0.9, rdSize - 0.08);
          document.documentElement.style.setProperty('--rd-size', rdSize + 'rem');
        }
      }),
      el('button', {
        type: 'button',
        class: 'rd-btn',
        text: 'A+',
        'aria-label': T('放大字級'),
        onclick: function () {
          rdSize = Math.min(1.6, rdSize + 0.08);
          document.documentElement.style.setProperty('--rd-size', rdSize + 'rem');
        }
      }),
      el('button', {
        type: 'button',
        class: 'rd-btn',
        id: 'rd-settings',
        text: T('設定'),
        onclick: function () {
          U.openSettings();
        }
      }),
      el('button', {
        type: 'button',
        class: 'rd-btn',
        id: 'rd-exit',
        text: T('離開沉浸'),
        onclick: exitReading
      })
    ]);
    return b;
  }
  function renderNote() {
    if (S.settings) return; // 設定疊在上面時，背景的非同步更新不要蓋掉設定畫面
    var main = $('main'),
      n = S.note;
    main.textContent = '';
    main.appendChild(
      el('p', { class: 'back' }, [
        el('button', {
          type: 'button',
          class: 'linkbtn',
          text: T('← 回到列表'),
          onclick: function () {
            S.note = null;
            render();
          }
        }),
        el('span', { class: 'row' }, [
          n.data
            ? el('button', {
                type: 'button',
                class: 'tbtn',
                id: 'n-fsdn',
                'aria-label': T('縮小字級'),
                text: 'A−',
                onclick: function () {
                  setFontScale(fontScale() - 0.1);
                }
              })
            : null,
          n.data
            ? el('button', {
                type: 'button',
                class: 'tbtn',
                id: 'n-fsup',
                'aria-label': T('放大字級'),
                text: 'A+',
                onclick: function () {
                  setFontScale(fontScale() + 0.1);
                }
              })
            : null,
          n.data
            ? el('button', {
                type: 'button',
                class: 'tbtn',
                id: 'n-read',
                text: T('沉浸閱讀'),
                onclick: function () {
                  enterReading();
                }
              })
            : null,
          canEdit() && n.data
            ? el('button', {
                type: 'button',
                class: 'tbtn',
                text: T('編輯'),
                onclick: function () {
                  U.openEditor(n.id);
                }
              })
            : null,
          canEdit() && n.data
            ? el('button', {
                type: 'button',
                class: 'tbtn danger',
                id: 'n-del',
                text: T('刪除'),
                onclick: function () {
                  n.confirmDel = !n.confirmDel;
                  renderNote();
                }
              })
            : null
        ])
      ])
    );
    if (n.confirmDel)
      main.appendChild(
        el('section', { class: 'panel', role: 'alertdialog', 'aria-label': T('刪除這則筆記') }, [
          el('h3', { text: T('刪除這則筆記？') }),
          el('p', {
            text: T(
              '「{1}」會移到 Google Drive 垃圾桶（可從垃圾桶還原），並從索引移除；其他筆記裡指向它的連結會變成找不到。',
              n.data.meta.title
            )
          }),
          el('div', { class: 'row' }, [
            el('button', {
              type: 'button',
              class: 'tbtn danger',
              id: 'n-del-ok',
              text: T('確定刪除'),
              disabled: n.deleting ? 'disabled' : false,
              onclick: function () {
                doDelete(n);
              }
            }),
            el('button', {
              type: 'button',
              class: 'tbtn',
              text: T('取消'),
              onclick: function () {
                n.confirmDel = false;
                renderNote();
              }
            })
          ]),
          n.delError ? el('p', { class: 'err', role: 'alert', text: n.delError }) : null
        ])
      );
    if (S.reading) main.appendChild(readingBar());
    if (U.flash) {
      main.appendChild(el('p', { class: 'sub', role: 'status', text: U.flash }));
      if (n.data) U.flash = '';
    } // 載入中先保留，筆記內容顯示後才清除
    if (n.loading) {
      main.appendChild(el('p', { class: 'empty', text: T('載入中…') }));
      return;
    }
    if (n.error) {
      main.appendChild(el('p', { class: 'err', text: n.error }));
      return;
    }
    var d = n.data,
      m = d.meta,
      it = S.byId[n.id] || m;
    main.appendChild(el('h2', { text: m.title }));
    var line = el('p', { class: 'sub' }, [m.date || '']);
    if (m.topic) {
      line.appendChild(document.createTextNode(T('　·　')));
      line.appendChild(
        el('button', {
          type: 'button',
          class: 'linkbtn',
          text: topicTitle(m.topic) || m.topic,
          onclick: function () {
            go({ topic: m.topic });
          }
        })
      );
    }
    var fl = flag(it);
    if (fl) line.appendChild(fl);
    main.appendChild(line);
    if ((m.tags || []).length)
      main.appendChild(
        el(
          'p',
          {},
          m.tags.map(function (t) {
            return el('button', {
              type: 'button',
              class: 'tag',
              text: '#' + t,
              onclick: function () {
                go({ topic: '', tag: t });
              }
            });
          })
        )
      );
    var body = el('div', { class: 'md' }),
      env = { toc: [] };
    body.innerHTML = md.render(L.rewriteInternalLinks(d.body, S.byId), env);
    var heads = env.toc.filter(function (h) {
      return h.level <= 3 && h.text;
    });
    if (heads.length >= 3) {
      // 目錄：3 個以上標題才顯示；用按鈕捲動，不改網址
      var minLv = Math.min.apply(
        null,
        heads.map(function (h) {
          return h.level;
        })
      );
      main.appendChild(
        el('details', { class: 'toc', id: 'toc' }, [
          el('summary', { text: T('目錄') }),
          el(
            'ul',
            {},
            heads.map(function (h) {
              return el('li', { class: 'lv' + (h.level - minLv) }, [
                el('button', {
                  type: 'button',
                  class: 'linkbtn',
                  text: h.text,
                  onclick: function () {
                    var t = body.querySelector('#' + h.id);
                    if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                })
              ]);
            })
          )
        ])
      );
    }
    body.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a.note-link');
      if (a) {
        e.preventDefault();
        openNote(a.getAttribute('data-note'));
      }
    });
    main.appendChild(body);
    loadSvgs(body);
    var tr = L.translations(S.items, n.id);
    if (tr.length)
      main.appendChild(
        el(
          'p',
          { class: 'trans' },
          [el('span', { text: T('其他語言版本：') })].concat(
            tr.map(function (x) {
              return el('button', {
                type: 'button',
                class: 'linkbtn',
                text: x.title + (x.lang === 'en' ? ' (EN)' : ''),
                onclick: function () {
                  openNote(x.id);
                }
              });
            })
          )
        )
      );
    var nb = L.neighbors(S.items, n.id, S.f.lang);
    if (nb.prev || nb.next)
      main.appendChild(
        el('nav', { class: 'pn', 'aria-label': T('上一篇與下一篇') }, [
          nb.prev
            ? el(
                'button',
                {
                  type: 'button',
                  class: 'pn-prev',
                  id: 'pn-prev',
                  onclick: function () {
                    openNote(nb.prev.id);
                  }
                },
                [el('small', { text: T('← 上一篇') }), el('span', { text: nb.prev.title })]
              )
            : el('span', {}),
          nb.next
            ? el(
                'button',
                {
                  type: 'button',
                  class: 'pn-next',
                  id: 'pn-next',
                  onclick: function () {
                    openNote(nb.next.id);
                  }
                },
                [el('small', { text: T('下一篇 →') }), el('span', { text: nb.next.title })]
              )
            : el('span', {})
        ])
      );
    {
      var link = (ROUTE0.base || '') + '?note=' + n.id + (S.f.lang ? '&lang=' + S.f.lang : '');
      main.appendChild(
        el('p', { class: 'share' }, [
          el('button', {
            type: 'button',
            class: 'linkbtn',
            id: 'share-btn',
            text: T('分享連結'),
            onclick: function () {
              n.share = !n.share;
              renderNote();
            }
          })
        ])
      );
      if (n.share && !ROUTE0.base)
        main.appendChild(
          el('p', {
            class: 'sub',
            id: 'share-nobase',
            text: T(
              '尚未設定公開網址。請在 Apps Script 的指令碼屬性新增 PUBLIC_URL（唯讀部署的網址），分享連結才會完整。'
            )
          })
        );
      if (n.share && S.me.isOwner && !L.effectivePublic(it, S.tmap))
        main.appendChild(
          el('p', { class: 'sub', id: 'share-private', text: T('這則筆記目前是私人，訪客打不開這個連結。') })
        );
      if (n.share) {
        var inp = el('input', {
          type: 'text',
          readonly: 'readonly',
          id: 'share-url',
          value: link,
          'aria-label': T('分享連結')
        });
        inp.addEventListener('focus', function () {
          inp.select();
        });
        main.appendChild(
          el('div', { class: 'row' }, [
            inp,
            el('button', {
              type: 'button',
              class: 'tbtn',
              id: 'share-copy',
              text: T('複製'),
              onclick: function () {
                try {
                  navigator.clipboard.writeText(link).then(
                    function () {
                      U.flash = '';
                      inp.select();
                    },
                    function () {
                      inp.select();
                    }
                  );
                } catch (e) {
                  inp.select();
                }
              }
            })
          ])
        );
      }
    }
    main.appendChild(canvasRefs(n));
    var refs = (S.back[n.id] || []).filter(function (id) {
      return S.byId[id];
    });
    if (refs.length) {
      main.appendChild(
        el('section', { class: 'refs' }, [
          el('h3', { text: T('被這些筆記引用') }),
          el(
            'ul',
            { class: 'list' },
            refs.map(function (id) {
              return el('li', {}, [
                el(
                  'a',
                  {
                    class: 'item',
                    href: L.buildRoute({ note: id, lang: S.f.lang }),
                    onclick: function (e) {
                      e.preventDefault();
                      openNote(id);
                    }
                  },
                  [el('span', { class: 't', text: S.byId[id].title })]
                )
              ]);
            })
          )
        ])
      );
    }
  }

  /* ───── 筆記頁：出現在哪些畫布（按需載入；訪客只會看到公開主題的畫布，因為後端本來就只回那些） ───── */
  var boardIds = {}; // 主題 id → { at, ids: {noteId:1} }，本次開啟期間的快取
  function canvasRefs(n) {
    var box = el('section', { class: 'refs', id: 'cv-refs' });
    function paint() {
      box.textContent = '';
      if (!n.cvRefs) {
        box.appendChild(
          el('button', {
            type: 'button',
            class: 'linkbtn',
            id: 'cv-refs-btn',
            text: T('出現在哪些畫布？'),
            onclick: load
          })
        );
        return;
      }
      if (n.cvRefs === 'loading') {
        box.appendChild(el('p', { class: 'sub', text: T('查詢中…') }));
        return;
      }
      box.appendChild(el('h3', { text: T('出現在這些畫布') }));
      if (!n.cvRefs.length) {
        box.appendChild(el('p', { class: 'sub', text: T('沒有任何畫布放了這則筆記。') }));
        return;
      }
      box.appendChild(
        el(
          'ul',
          { class: 'list' },
          n.cvRefs.map(function (t) {
            return el('li', {}, [
              el('button', {
                type: 'button',
                class: 'item linkbtn',
                text: T('{1}・畫布', t.title),
                onclick: function () {
                  if (U.openCanvas) {
                    S.note = null;
                    U.openCanvas(t.id);
                  }
                }
              })
            ]);
          })
        )
      );
    }
    function load() {
      n.cvRefs = 'loading';
      paint();
      boardIds = {};
      var path = 'notes/' + n.id + '.md',
        out = [],
        chain = Promise.resolve();
      S.topics.forEach(function (t) {
        chain = chain.then(function () {
          if (boardIds[t.id]) return;
          return api('getBoard', { topic: t.id })
            .then(function (r) {
              var ids = {};
              if (r && r.ok && r.board)
                (r.board.nodes || []).forEach(function (x) {
                  if (x && x.type === 'file') ids[x.file] = 1;
                });
              boardIds[t.id] = { ids: ids };
            })
            .catch(function () {
              boardIds[t.id] = { ids: {} };
            });
        });
      });
      chain.then(function () {
        S.topics.forEach(function (t) {
          if (boardIds[t.id] && boardIds[t.id].ids[path]) out.push({ id: t.id, title: t.title });
        });
        n.cvRefs = out;
        if (S.note && S.note.id === n.id) renderNote();
      });
    }
    paint();
    return box;
  }

  /* ───── 手機版：上方按鈕收進「選單」 ───── */
  (function () {
    var mb = $('btnMenu'),
      hm = $('hmenu');
    if (!mb || !hm) return;
    function setMenu(on) {
      document.body.classList.toggle('menu-open', on);
      mb.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
    mb.addEventListener('click', function () {
      setMenu(!document.body.classList.contains('menu-open'));
    });
    hm.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('button')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setMenu(false);
    });
  })();

  /* ───── 路由：網址 hash（#/[zh|en/]note/<id>、topic/<id>）讓上一頁、下一頁可用；伺服器參數（?note=&topic=&lang=）供分享連結 ───── */
  var ROUTE0 = window.VAULT_ROUTE || {},
    lastHash = null;
  /* ───── 分享連結（主題、畫布）：與筆記同一套規則，網址開頭取自 PUBLIC_URL ───── */
  function shareUrl(topic, board) {
    return (
      (ROUTE0.base || '') +
      '?topic=' +
      topic +
      (board ? '&board=1' : '') +
      (S.f.lang ? '&lang=' + S.f.lang : '')
    );
  }
  /** 回傳一組分享區塊（提示＋網址欄＋複製）。board=true 是畫布連結。 */
  function shareBox(topic, board) {
    var link = shareUrl(topic, board),
      t = S.tmap[topic],
      box = el('div', {
        class: 'panel cv-panel share-box',
        id: board ? 'share-board-box' : 'share-topic-box'
      });
    box.appendChild(el('h3', { text: board ? T('分享這張畫布') : T('分享這個主題') }));
    if (!ROUTE0.base)
      box.appendChild(
        el('p', {
          class: 'sub',
          id: 'share-nobase',
          text: T(
            '尚未設定公開網址。請在 Apps Script 的指令碼屬性新增 PUBLIC_URL（唯讀部署的網址），分享連結才會完整。'
          )
        })
      );
    if (S.me.isOwner && t && t.defaultPublic !== true)
      box.appendChild(
        el('p', {
          class: 'sub',
          id: 'share-private',
          text: T(
            '這個主題目前是私人，訪客打不開這個連結（訪客只會在「未歸類」看到公開的筆記）。要分享請先把主題改成公開。'
          )
        })
      );
    if (S.me.isOwner && board)
      box.appendChild(el('p', { class: 'sub', text: T('訪客看到的畫布會拿掉指向私人筆記的卡片。') }));
    var inp = el('input', {
      type: 'text',
      readonly: 'readonly',
      id: 'share-url2',
      value: link,
      'aria-label': T('分享連結')
    });
    inp.addEventListener('focus', function () {
      inp.select();
    });
    box.appendChild(
      el('div', { class: 'row' }, [
        inp,
        el('button', {
          type: 'button',
          class: 'tbtn',
          id: 'share-copy2',
          text: T('複製'),
          onclick: function () {
            try {
              navigator.clipboard.writeText(link).then(
                function () {
                  inp.select();
                },
                function () {
                  inp.select();
                }
              );
            } catch (e) {
              inp.select();
            }
          }
        })
      ])
    );
    return box;
  }

  function curRoute() {
    return {
      lang: S.f.lang,
      note: S.note ? S.note.id : '',
      topic: !S.note && S.f.topic && S.f.topic !== L.NONE ? S.f.topic : ''
    };
  }
  function syncHash() {
    if (S.edit || S.up || S.zip || S.settings || S.topicEd || S.canvas || S.pub || S.sync) return;
    var h = L.buildRoute(curRoute());
    if (h === location.hash || (h === '#/' && !location.hash)) {
      lastHash = h;
      return;
    }
    try {
      if (lastHash === null) history.replaceState(null, '', h);
      else history.pushState(null, '', h);
      lastHash = h;
    } catch (e) {
      /* 不能改網址的環境就略過，功能照常 */
    }
  }
  function applyRoute(r) {
    S.settings = false;
    S.pub = null;
    S.f.lang = r.lang || '';
    var cl = $('clang');
    if (cl) cl.value = S.f.lang;
    if (r.note) {
      openNote(r.note);
      return;
    }
    S.note = null;
    S.f.topic = r.topic && S.tmap[r.topic] ? r.topic : '';
    S.shown = PAGE;
    S.notice =
      r.topic && !S.tmap[r.topic] ? T('找不到你要開啟的主題。它可能是私人的、已被刪除，或網址有誤。') : '';
    render();
  }
  window.addEventListener('popstate', function () {
    if (S.edit || S.up || S.zip || S.topicEd) return;
    if (U.leaveCanvas && !U.leaveCanvas()) return;
    lastHash = location.hash;
    applyRoute(L.parseRoute(location.hash));
  });
  function initialRoute() {
    var r = L.parseRoute(location.hash);
    if (ROUTE0.note || ROUTE0.topic || ROUTE0.lang)
      r = { lang: ROUTE0.lang || '', note: ROUTE0.note || '', topic: ROUTE0.topic || '' };
    if (r.note || r.topic || r.lang) applyRoute(r);
    if (ROUTE0.board && ROUTE0.topic && !ROUTE0.note && S.tmap[ROUTE0.topic] && U.openCanvas)
      U.openCanvas(ROUTE0.topic); // 分享的畫布連結：直接開啟（私人主題訪客沒有，就停在列表）
    if (!r.note && !r.topic && !r.lang) routeFromParent();
  }
  /** 備援：伺服器端沒帶到網址參數時（例如網址被轉址、部署版本較舊），改問 Google 外層頁面目前的網址。參數一律重新驗證，且只在使用者還沒自己點過任何東西時才套用。 */
  function routeFromParent() {
    try {
      if (!(window.google && google.script && google.script.url && google.script.url.getLocation)) return;
      google.script.url.getLocation(function (loc) {
        try {
          var q = (loc && loc.parameter) || {},
            pick = function (k) {
              var v = q[k];
              return String(Array.isArray(v) ? v[0] : v === undefined ? '' : v);
            };
          if (S.note || S.edit || S.up || S.zip || S.settings || S.topicEd || S.canvas || S.f.topic || S.f.q)
            return;
          var r = { lang: '', note: '', topic: '' },
            lg = pick('lang');
          if (lg === 'zh' || lg === 'en') r.lang = lg;
          var n = pick('note'),
            t = pick('topic');
          if (L.parseRoute('#/note/' + n).note) r.note = n;
          else if (L.parseRoute('#/topic/' + t).topic) r.topic = t;
          if (!r.note && !r.topic && !r.lang) return;
          applyRoute(r);
          if (!r.note && r.topic && pick('board') === '1' && S.tmap[r.topic] && U.openCanvas)
            U.openCanvas(r.topic);
        } catch (e) {
          /* 備援失敗就維持首頁 */
        }
      });
    } catch (e) {
      /* 略 */
    }
  }

  function render() {
    if (
      S.cvFull &&
      (S.note || S.edit || S.up || S.zip || S.settings || S.topicEd || S.pub || S.sync) &&
      U.exitCanvasFull
    )
      U.exitCanvasFull(); // 從全螢幕畫布開筆記等頁面時，離開全螢幕版面（否則頁首、書櫃、返回鈕都被藏起來）
    var wrap = $('wrap');
    if (wrap) wrap.classList.toggle('cv-wide', !!(S.canvas && !S.note && !S.edit && !S.up && !S.zip)); // 畫布需要寬版面
    var rd = !!(S.reading && S.note && S.note.data && !S.edit && !S.settings && !S.topicEd);
    if (S.reading && !rd && !(S.note && S.note.loading)) {
      S.reading = false;
      if (document.fullscreenElement && document.exitFullscreen)
        try {
          document.exitFullscreen();
        } catch (e) {
          /* 略 */
        }
    }
    document.body.classList.toggle('reading', !!S.reading && !!S.note);
    var mn = $('main');
    if (mn && mn.classList) mn.classList.toggle('public-read', !S.me.isOwner);
    renderShelf();
    if (S.edit || S.up || S.zip || S.topicEd || S.canvas) {
      S.pub = null;
      S.sync = null;
    } // 開了編輯、上傳、備份、畫布就離開發布檢查與同步頁
    if (S.settings && U.renderSettings) U.renderSettings();
    else if (S.topicEd && U.renderTopicEditor) U.renderTopicEditor();
    else if (S.edit) U.renderEditor();
    else if (S.up) U.renderUpload();
    else if (S.zip) U.renderZip();
    else if (S.pub && U.renderPublish) U.renderPublish();
    else if (S.sync && U.renderSync) U.renderSync();
    else if (S.note) renderNote();
    else if (S.canvas && U.renderCanvas) U.renderCanvas();
    else renderList();
    syncHash();
  }
  function reload() {
    return Promise.all([api('whoami'), api('listIndex')]).then(function (rs) {
      if (rs[1].ok) setData(rs[1], rs[0]);
    });
  }
  function readFile(file) {
    if (file.text) return file.text();
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        resolve(r.result);
      };
      r.onerror = function () {
        reject(new Error(T('讀不到檔案')));
      };
      r.readAsText(file);
    });
  }
  var U = (window.VaultUI = {
    go: go,
    imgGet: imgGet,
    setEditMode: setEditMode,
    loadImgs: loadImgs,
    mdHtml: function (body, byId) {
      return md.render(L.rewriteInternalLinks(body, byId), { toc: [] });
    },
    exitReading: exitReading,
    FEATURES: FEATURES,
    narrow: narrow,
    loadSvgs: loadSvgs,
    el: el,
    api: api,
    S: S,
    $: $,
    render: render,
    reload: reload,
    openNote: openNote,
    topicTitle: topicTitle,
    readFile: readFile,
    flash: '',
    canNew: canEdit,
    fontScale: fontScale,
    setFontScale: setFontScale,
    retranslate: retranslate
  });
  U.shareBox = shareBox;

  /* ───── 啟動 ───── */
  function setData(idx, who) {
    S.items = idx.items || [];
    S.topics = idx.topics || [];
    S.order = idx.order || { cats: [], topics: [] };
    S.me = { isOwner: !!(who && who.isOwner) };
    S.editMode = loadEditMode();
    if (who && who.publicUrl && !ROUTE0.base) ROUTE0.base = who.publicUrl; // 備援：網頁沒帶到時，由後端回報
    S.tmap = L.topicMap(S.topics);
    S.byId = {};
    S.items.forEach(function (it) {
      S.byId[it.id] = it;
    });
    S.back = L.backlinks(S.items);
    if (U.onData) U.onData();
    paintHeader();
  }
  /** 頁首的工具按鈕與身分標籤；換語言時重畫。 */
  function paintHeader() {
    var tools = $('tools');
    tools.textContent = '';
    var cl = el(
      'select',
      { id: 'clang', 'aria-label': T('內容語言') },
      [
        ['', T('全部語言')],
        ['zh', T('中文')],
        ['en', 'English']
      ].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: S.f.lang === o[0] ? 'selected' : false });
      })
    );
    cl.addEventListener('change', function () {
      S.f.lang = cl.value;
      S.shown = PAGE;
      if (!S.note && !S.edit && !S.up && !S.zip) {
        if (U.leaveCanvas && !U.leaveCanvas()) {
          cl.value = S.f.lang;
          return;
        }
      }
      render();
    });
    tools.appendChild(cl);
    tools.appendChild(
      el('button', {
        type: 'button',
        class: 'tbtn',
        id: 'btnQuick',
        title: T('快速切換（Ctrl+K）'),
        text: T('⌕ 快速切換'),
        onclick: function () {
          if (U.openQuick) U.openQuick();
        }
      })
    );
    if (S.me.isOwner)
      tools.appendChild(
        el('button', {
          type: 'button',
          class: 'tbtn' + (S.editMode ? ' on' : ''),
          id: 'btnMode',
          'aria-pressed': S.editMode ? 'true' : 'false',
          title: S.editMode
            ? T('目前是編輯模式：按一下回到閱讀模式（不會誤改內容）')
            : T('目前是閱讀模式：按一下才能新增、編輯、移動卡片'),
          text: S.editMode ? T('✎ 編輯中') : T('👁 閱讀中'),
          onclick: function () {
            setEditMode(!S.editMode);
          }
        })
      );
    if (canEdit()) {
      tools.appendChild(
        el('button', {
          type: 'button',
          class: 'tbtn',
          text: T('新增'),
          onclick: function () {
            U.openEditor(null);
          }
        })
      );
      tools.appendChild(
        el('button', {
          type: 'button',
          class: 'tbtn',
          text: T('上傳'),
          onclick: function () {
            U.openUpload();
          }
        })
      );
      tools.appendChild(
        el('button', {
          type: 'button',
          class: 'tbtn',
          text: T('備份'),
          onclick: function () {
            U.openZip();
          }
        })
      );
      if (U.openSync)
        tools.appendChild(
          el('button', {
            type: 'button',
            class: 'tbtn',
            id: 'btnSync',
            text: T('同步與備份'),
            onclick: function () {
              U.openSync();
            }
          })
        );
      if (U.openPublish)
        tools.appendChild(
          el('button', {
            type: 'button',
            class: 'tbtn',
            id: 'btnPublish',
            text: T('發布檢查'),
            onclick: function () {
              U.openPublish();
            }
          })
        );
    }
    var w = $('who');
    w.textContent = S.me.isOwner ? T('擁有者') : T('訪客・唯讀');
    w.className = 'badge' + (S.me.isOwner ? ' owner' : '');
  }
  /** 換語言後：靜態文字、頁首、目前畫面全部重畫。 */
  function retranslate() {
    if (window.VaultI18n) window.VaultI18n.applyStatic();
    paintHeader();
    render();
  }

  function start() {
    $('main').textContent = '';
    $('main').appendChild(el('p', { class: 'empty', text: T('載入中…') }));
    Promise.all([api('whoami'), api('listIndex')])
      .then(function (rs) {
        if (!rs[1].ok) throw new Error(T(rs[1].error || '讀取失敗'));
        setData(rs[1], rs[0]);
        render();
        initialRoute();
      })
      .catch(function (e) {
        $('who').textContent = T('無法連線');
        var main = $('main');
        main.textContent = '';
        main.appendChild(el('p', { class: 'err', text: T('讀取失敗：{1}', e.message) }));
        main.appendChild(el('button', { type: 'button', class: 'more', text: T('重試'), onclick: start }));
      });
  }

  var timer = null,
    q = $('q');
  q.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (U.leaveCanvas && !U.leaveCanvas()) return;
      S.f.q = q.value.trim();
      S.note = null;
      S.settings = false;
      S.topicEd = null;
      S.shown = PAGE;
      render();
    }, 150);
  });
  q.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (U.leaveCanvas && !U.leaveCanvas()) return;
      q.value = '';
      S.f.q = '';
      S.note = null;
      S.settings = false;
      S.topicEd = null;
      render();
    }
  });
  applyFontScale(fontScale()); // 啟動只套用、不寫回（讀不到時不要把使用者的設定蓋成預設）
  document.body.classList.toggle('shelf-mini', shelfMini());
  $('shelf').open = !narrow.matches && !shelfMini();
  start();
})();
