/**
 * canvas_panels.js — 畫布上方的浮動面板：新增連結／筆記／SVG、整理排版、分享、刪除畫布、匯出、儲存衝突。
 * 只透過 VaultUI.cv（canvas.js 公開的小介面）操作畫布，不直接碰其他檔案。
 */
(function () {
  'use strict';
  var U = window.VaultUI,
    K = U.cv,
    CL = window.CanvasLogic,
    el = U.el,
    S = U.S;
  var f = function (n) {
    return function () {
      return K[n].apply(null, arguments);
    };
  };
  var addNode = f('addNode'),
    download = f('download'),
    draw = f('draw'),
    fetchPreviewFor = f('fetchPreviewFor'),
    fit = f('fit'),
    markDirty = f('markDirty'),
    mutate = f('mutate'),
    nodeMap = f('nodeMap'),
    noteIdOf = f('noteIdOf'),
    save = f('save'),
    setStatus = f('setStatus'),
    snap = f('snap'),
    svgIdOf = f('svgIdOf'),
    syncBar = f('syncBar'),
    syncInspector = f('syncInspector');

  function renderPanel() {
    var C = K.C(),
      box = C && C.dom && C.dom.panelBox;
    if (!box) return;
    box.textContent = '';
    if (C.conflict) {
      box.appendChild(conflictPanel());
      return;
    }
    var p = C.panel;
    if (!p) return;
    var close = el('button', {
      type: 'button',
      class: 'linkbtn',
      text: T('關閉'),
      onclick: function () {
        C.panel = null;
        renderPanel();
      }
    });
    if (K.extraPanels && K.extraPanels[p.kind]) {
      box.appendChild(K.extraPanels[p.kind](p, close));
      return;
    } // canvas_tools.js 的面板（搜尋）
    if (p.kind === 'link') {
      var inp = el('input', {
        type: 'url',
        class: 'in',
        placeholder: T('https://…（YouTube 連結可嵌入播放）'),
        'aria-label': T('連結網址')
      });
      var cb = el('input', { type: 'checkbox', id: 'cv-lk-pv' });
      cb.checked = p.pv !== false;
      cb.addEventListener('change', function () {
        p.pv = cb.checked;
      });
      var add = function () {
        var u = CL.safeUrl(inp.value);
        if (!u) {
          setStatus(T('請輸入 http 或 https 開頭的網址。'));
          return;
        }
        var id = addNode('link', { url: u });
        C.panel = null;
        renderPanel();
        if (cb.checked && /^https:\/\//i.test(u)) fetchPreviewFor(id, u);
      };
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') add();
      });
      box.appendChild(
        el('div', { class: 'panel cv-panel' }, [
          el('h3', { text: T('新增連結卡片') }),
          inp,
          el('p', { class: 'sub' }, [
            cb,
            ' ',
            el('label', {
              for: 'cv-lk-pv',
              text: T('加入後擷取網頁預覽（由 Apps Script 連到該網址一次，只存標題、描述與封面圖網址）')
            })
          ]),
          el('p', {}, [
            el('button', { type: 'button', class: 'tbtn', text: T('加入'), onclick: add }),
            ' ',
            close
          ])
        ])
      );
      setTimeout(function () {
        inp.focus();
      }, 0);
    } else if (p.kind === 'note') {
      var q = el('input', {
        type: 'search',
        class: 'in',
        placeholder: T('搜尋要放上畫布的筆記標題或標籤'),
        'aria-label': T('搜尋筆記'),
        value: p.q || ''
      });
      var list = el('ul', { class: 'cv-picklist' });
      var onBoard = {};
      C.board.nodes.forEach(function (n) {
        if (n.type === 'file') {
          var id = noteIdOf(n);
          if (id) onBoard[id] = 1;
        }
      });
      var fill = function () {
        list.textContent = '';
        p.q = q.value;
        var t = q.value.trim().toLowerCase();
        var items = S.items.filter(function (it) {
          return (
            !t ||
            String(it.title).toLowerCase().indexOf(t) >= 0 ||
            (it.tags || []).join(' ').toLowerCase().indexOf(t) >= 0
          );
        });
        items.sort(function (a, b) {
          return (
            (b.topic === C.topic) - (a.topic === C.topic) || String(b.date).localeCompare(String(a.date))
          );
        });
        items.slice(0, 30).forEach(function (it) {
          list.appendChild(
            el('li', {}, [
              el(
                'button',
                {
                  type: 'button',
                  class: 'cv-pick',
                  onclick: function () {
                    addNode('file', { file: 'notes/' + it.id + '.md' });
                  }
                },
                [
                  it.title,
                  el('span', {
                    class: 'm',
                    text: T(
                      '　{1}',
                      [it.date, U.topicTitle(it.topic), onBoard[it.id] ? T('已在畫布上') : '']
                        .filter(Boolean)
                        .join('・')
                    )
                  })
                ]
              )
            ])
          );
        });
        if (!items.length) list.appendChild(el('li', { class: 'empty', text: T('沒有符合的筆記。') }));
      };
      q.addEventListener('input', fill);
      fill();
      box.appendChild(
        el('div', { class: 'panel cv-panel' }, [
          el('h3', { text: T('放入筆記（本主題的筆記排在前面）') }),
          q,
          list,
          close
        ])
      );
      setTimeout(function () {
        q.focus();
      }, 0);
    } else if (p.kind === 'share') {
      box.appendChild(U.shareBox(C.topic, true));
      box.appendChild(el('p', {}, [close]));
    } else if (p.kind === 'svg') {
      var seen = {},
        onB = {};
      C.board.nodes.forEach(function (n) {
        var sid = svgIdOf(n);
        if (sid) onB[sid] = 1;
      });
      var svgs = [];
      S.items.forEach(function (it) {
        [it.cover].concat(it.svgs || []).forEach(function (sid) {
          if (sid && /^\d{8}-[a-z0-9]{2,8}$/.test(sid) && !seen[sid]) {
            seen[sid] = 1;
            svgs.push({ id: sid, from: it.title });
          }
        });
      });
      var grid = el('div', { class: 'cv-svggrid' });
      svgs.slice(0, 60).forEach(function (o) {
        grid.appendChild(
          el(
            'button',
            {
              type: 'button',
              class: 'cv-svgpick',
              title: T('{1}（來自「{2}」）', o.id, o.from),
              onclick: function () {
                addNode('file', { file: 'assets/' + o.id + '.svg' }, null, [260, 200]);
              }
            },
            [
              el('img', { 'data-svg': o.id, alt: '', class: 'svg-img' }),
              el('span', { class: 'm', text: onB[o.id] ? T('已在畫布上') : o.id })
            ]
          )
        );
      });
      if (!svgs.length)
        grid.appendChild(
          el('p', { class: 'empty', text: T('目前沒有可放的圖片。先在筆記裡引用 SVG（或設為封面）。') })
        );
      box.appendChild(
        el('div', { class: 'panel cv-panel' }, [
          el('h3', { text: T('放入 SVG 圖片（來自你的筆記引用或封面）') }),
          grid,
          close
        ])
      );
      U.loadSvgs(grid);
    } else if (p.kind === 'layout') {
      var selFiles = Object.keys(C.sel).filter(function (id) {
        var nn = nodeMap()[id];
        return nn && nn.type === 'file';
      });
      var allFiles = C.board.nodes.filter(function (nn) {
        return nn.type === 'file';
      });
      var onBoard2 = {};
      allFiles.forEach(function (nn) {
        var id = noteIdOf(nn);
        if (id) onBoard2[id] = 1;
      });
      var missing = S.items.filter(function (it) {
        return it.topic === C.topic && !onBoard2[it.id];
      });
      p.mode = p.mode || 'grid';
      var modes = [
        ['grid', T('網格（依日期排列）')],
        ['tags', T('依標籤分組')],
        ['timeline', T('依月份排成時間軸')]
      ];
      var radios = modes.map(function (m) {
        var r = el('input', { type: 'radio', name: 'cv-lay', id: 'cv-lay-' + m[0], value: m[0] });
        r.checked = p.mode === m[0];
        r.addEventListener('change', function () {
          p.mode = m[0];
        });
        return el('p', { class: 'sub' }, [r, ' ', el('label', { for: 'cv-lay-' + m[0], text: m[1] })]);
      });
      var addCb = el('input', { type: 'checkbox', id: 'cv-lay-add' });
      addCb.checked = !!p.add;
      addCb.addEventListener('change', function () {
        p.add = addCb.checked;
      });
      var scope = selFiles.length
        ? T('只整理已選取的 {1} 張筆記／圖片卡片。', selFiles.length)
        : T('整理畫布上全部 {1} 張筆記／圖片卡片；文字、連結與其他卡片不動。', allFiles.length);
      box.appendChild(
        el(
          'div',
          { class: 'panel cv-panel' },
          [el('h3', { text: T('整理排版') }), el('p', { class: 'sub', text: scope })].concat(radios, [
            missing.length
              ? el('p', { class: 'sub' }, [
                  addCb,
                  ' ',
                  el('label', {
                    for: 'cv-lay-add',
                    text: T('也放入本主題還沒上畫布的 {1} 則筆記', missing.length)
                  })
                ])
              : null,
            el('p', {}, [
              el('button', {
                type: 'button',
                class: 'tbtn primary',
                id: 'cv-lay-go',
                text: T('套用'),
                onclick: function () {
                  var ids = null;
                  if (selFiles.length) {
                    ids = {};
                    selFiles.forEach(function (id) {
                      ids[id] = 1;
                    });
                  }
                  var add =
                    p.add && missing.length
                      ? missing.map(function (it) {
                          return 'notes/' + it.id + '.md';
                        })
                      : [];
                  if (!allFiles.length && !add.length) {
                    setStatus(T('畫布上沒有可整理的筆記卡片。'));
                    return;
                  }
                  var res = CL.autoLayout(C.board, {
                    mode: p.mode,
                    ids: ids,
                    add: add,
                    labels: { none: T('未分類'), nodate: T('未標日期'), image: T('圖片') },
                    info: function (nn) {
                      var id = noteIdOf(nn),
                        it = id && S.byId[id];
                      return it
                        ? { title: it.title, date: it.date, tags: it.tags }
                        : { title: nn.file || '' };
                    }
                  });
                  mutate(function () {
                    return res.board;
                  });
                  C.sel = {};
                  C.selEdge = null;
                  C.panel = null;
                  renderPanel();
                  fit();
                  syncInspector();
                  setStatus(
                    T(
                      '已整理 {1} 張卡片{2}。按「儲存」才會寫入；不滿意可按「復原」。',
                      res.moved + res.added,
                      res.groups ? T('，建立 {1} 個群組', res.groups) : ''
                    ) +
                      (res.droppedEdges
                        ? T('　因舊群組已移除，{1} 條連到它的連線也一併移除。', res.droppedEdges)
                        : '')
                  );
                }
              }),
              ' ',
              el('button', {
                type: 'button',
                class: 'tbtn',
                text: T('取消'),
                onclick: function () {
                  C.panel = null;
                  renderPanel();
                }
              })
            ])
          ])
        )
      );
    } else if (p.kind === 'delboard') {
      var doDel = function () {
        var topic = C.topic;
        p.busy = true;
        p.err = '';
        renderPanel();
        U.api('deleteBoard', { topic: topic })
          .then(function (r) {
            if (K.C() !== C) return;
            if (!r.ok) {
              p.busy = false;
              p.err = T(r.error || '刪除失敗');
              renderPanel();
              return;
            }
            C.hist.push(snap());
            C.board = CL.normalize({ nodes: [], edges: [] });
            C.base = { board: CL.clone(C.board), updatedAt: null };
            C.dirty = false;
            C.sel = {};
            C.selEdge = null;
            C.conflict = null;
            C.panel = null;
            renderPanel();
            syncBar();
            syncInspector();
            draw();
            setStatus(T('畫布已刪除（可從 Google Drive 垃圾桶還原檔案）。'));
          })
          .catch(function (e) {
            p.busy = false;
            p.err = e.message;
            renderPanel();
          });
      };
      box.appendChild(
        el('div', { class: 'panel cv-panel', role: 'alertdialog', 'aria-label': T('刪除這張畫布') }, [
          el('h3', { text: T('刪除這張畫布？') }),
          el('p', {
            text: T(
              '「{1}」的畫布檔會移到 Google Drive 垃圾桶（可從垃圾桶還原），並清空畫面；主題與筆記都不會被刪除。',
              S.tmap && S.tmap[C.topic] ? S.tmap[C.topic].title : C.topic
            )
          }),
          C.dirty ? el('p', { class: 'sub', text: T('尚未儲存的修改也會一併消失。') }) : null,
          el('p', { class: 'row' }, [
            el('button', {
              type: 'button',
              class: 'tbtn danger',
              id: 'cv-del-ok',
              text: T('確定刪除'),
              disabled: p.busy ? 'disabled' : false,
              onclick: doDel
            }),
            ' ',
            el('button', {
              type: 'button',
              class: 'tbtn',
              text: T('取消'),
              onclick: function () {
                C.panel = null;
                renderPanel();
              }
            })
          ]),
          p.err ? el('p', { class: 'err', role: 'alert', text: p.err }) : null
        ])
      );
    } else if (p.kind === 'export') {
      var ta = el('textarea', {
        class: 'ro',
        rows: '6',
        readonly: 'readonly',
        'aria-label': T('畫布檔內容')
      });
      ta.value = p.text;
      box.appendChild(
        el('div', { class: 'panel cv-panel' }, [
          el('h3', { text: T('匯出：{1}', p.name) }),
          el('p', { class: 'sub', text: T('存成 {1} 後放進 Obsidian 資料夾即可開啟。', p.name) }),
          ta,
          close
        ])
      );
    }
  }
  function conflictPanel() {
    var C = K.C(),
      srv = C.conflict,
      mine = CL.prepareForSave(C.board);
    var go = function (fn) {
      return function () {
        fn();
      };
    };
    var panel = el('div', { class: 'panel cv-panel', role: 'alert' }, [
      el('h3', { text: T('儲存衝突：雲端的畫布在你開啟之後被改過') }),
      el('p', { text: T('不會自動覆蓋任何一邊。請選擇處理方式：') }),
      el('p', {}, [
        el('button', {
          type: 'button',
          class: 'tbtn',
          text: T('合併'),
          title: T('依卡片、連線的 id 逐一合併；兩邊都改過的以你的為準'),
          onclick: go(function () {
            var res = CL.mergeBoards(C.base.board, C.board, CL.normalize(srv.board || {}));
            C.hist.push(snap());
            C.board = res.board;
            C.base = { board: CL.clone(CL.normalize(srv.board || {})), updatedAt: srv.updatedAt };
            C.conflict = null;
            markDirty();
            setStatus(
              T(
                '已合併{1}。請檢查後按「儲存」。',
                res.conflicts ? T('（有 {1} 項兩邊都改過，採用你的版本）', res.conflicts) : ''
              )
            );
            renderPanel();
            syncInspector();
            draw();
          })
        }),
        ' ',
        el('button', {
          type: 'button',
          class: 'tbtn',
          text: T('用我的覆蓋'),
          title: T('雲端版本會被取代'),
          onclick: go(function () {
            if (!window.confirm(T('雲端目前的版本會被你的版本取代，確定嗎？'))) return;
            C.base = { board: CL.clone(CL.normalize(srv.board || {})), updatedAt: srv.updatedAt };
            C.conflict = null;
            renderPanel();
            save();
          })
        }),
        ' ',
        el('button', {
          type: 'button',
          class: 'tbtn',
          text: T('另存我的版本'),
          title: T('下載成檔案，然後載入雲端版本'),
          onclick: go(function () {
            download(C.topic + '-mine.canvas', JSON.stringify(mine, null, 2));
            setStatus(T('已嘗試下載你的版本。'));
          })
        }),
        ' ',
        el('button', {
          type: 'button',
          class: 'tbtn',
          text: T('放棄我的修改，載入雲端版'),
          onclick: go(function () {
            if (!window.confirm(T('你尚未儲存的修改會消失（可先「另存我的版本」），確定嗎？'))) return;
            C.hist.push(snap());
            C.board = CL.normalize(srv.board || {});
            C.base = { board: CL.clone(C.board), updatedAt: srv.updatedAt };
            C.dirty = false;
            C.conflict = null;
            C.sel = {};
            C.selEdge = null;
            renderPanel();
            syncBar();
            syncInspector();
            draw();
            setStatus(T('已載入雲端版本。'));
          })
        })
      ])
    ]);
    return panel;
  }

  K.renderPanel = renderPanel;
})();
