/**
 * canvas.js — 畫布介面（P2）
 * 架構：一個可平移縮放的「世界」容器（CSS transform），裡面三層：群組層、連線層（SVG）、卡片層。
 * 效能：只建立視窗內（含邊界）的卡片 DOM，離開視窗就移除；縮小到 LOD 以下只畫「標題方塊」，不載入內容。
 * 安全：卡片文字一律 textContent；Markdown 走與筆記相同的安全渲染器；SVG 一律 <img>；
 *       YouTube 只有按下「載入影片」後才建立 iframe；連結只接受 http(s)。
 * 權限：是否能編輯只影響介面，真正的權限由後端判斷。
 */
(function () {
  'use strict';
  var U = window.VaultUI,
    CL = window.CanvasLogic,
    L = VaultLogic;
  var K = (U.cv = {}); // 給 canvas_panels.js、canvas_insp.js、canvas_tools.js 用的小介面（見檔尾）
  var el = U.el,
    S = U.S,
    $ = U.$;
  var md = L.makeMarkdown(window.markdownit);
  var LOD_K = 0.4,
    CARD_CHARS = 1500,
    THRESH = 4;
  var C = null; // 目前開啟的畫布工作階段（離開畫布才清掉）
  var noteCache = {}; // 筆記 id → { state, title, body }
  var waiters = {},
    running = 0,
    queue = [];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function touchLike() {
    return U.narrow.matches || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }
  function canvasEditable() {
    return !!S.me.isOwner && S.editMode === true && (!touchLike() || U.FEATURES.canvasTouchEdit);
  }

  /* ───── 筆記內容（延遲載入、最多同時 4 個請求） ───── */
  function noteIdOf(n) {
    var m = /^notes\/(\d{8}-[a-z0-9]{2,8})\.md$/.exec(n.file || '');
    return m ? m[1] : null;
  }
  function imgIdOf(n) {
    var m = /^assets\/(\d{8}-[a-z0-9]{2,8})\.img$/.exec(n.file || '');
    return m ? m[1] : null;
  }
  function svgIdOf(n) {
    var m = /^assets\/(\d{8}-[a-z0-9]{2,8})\.svg$/.exec(n.file || '');
    return m ? m[1] : null;
  }
  function pump() {
    while (running < 4 && queue.length) {
      (function (id) {
        running++;
        U.api('getNote', { id: id })
          .then(function (r) {
            noteCache[id] = r.ok ? { state: 'ok', title: r.meta.title, body: r.body } : { state: 'err' };
          })
          .catch(function () {
            noteCache[id] = { state: 'err' };
          })
          .then(function () {
            running--;
            (waiters[id] || []).forEach(function (f) {
              f(noteCache[id]);
            });
            delete waiters[id];
            pump();
          });
      })(queue.shift());
    }
  }
  function loadNote(id, cb) {
    var c = noteCache[id];
    if (c) return cb(c);
    if (waiters[id]) {
      waiters[id].push(cb);
      return;
    }
    waiters[id] = [cb];
    noteCache[id] = null;
    queue.push(id);
    pump();
  }

  /* ───── 工作階段 ───── */
  function snap() {
    return JSON.stringify(C.board);
  }
  function eff() {
    // 實際畫出來的節點（收合的群組縮成小方塊、被收合的子孫拿掉）；陣列每次修改都是新的，所以可用身分比對快取
    if (C.effOf !== C.board.nodes) {
      C.cinfo = CL.collapseInfo(C.board.nodes);
      C.eff = CL.effectiveNodes(C.board.nodes, C.cinfo);
      C.effOf = C.board.nodes;
      C.effMap = CL.byId(C.eff);
    }
    return C.eff;
  }
  function nodeMap() {
    if (C.mapOf !== C.board.nodes) {
      C.map = CL.byId(C.board.nodes);
      C.mapOf = C.board.nodes;
    }
    return C.map;
  }
  function markDirty() {
    C.dirty = true;
    syncBar();
  }
  function mutate(fn) {
    var nb = fn(C.board);
    if (!nb || nb === C.board) return false;
    C.hist.push(snap());
    C.board = nb;
    markDirty();
    draw();
    return true;
  }
  function setStatus(msg) {
    C.status = msg || '';
    if (C.dom && C.dom.status) C.dom.status.textContent = C.status;
  }

  function openCanvas(topic) {
    S.settings = false;
    S.topicEd = null;
    noteCache = {};
    waiters = {};
    queue = [];
    C = {
      topic: topic,
      loading: true,
      error: '',
      board: { nodes: [], edges: [] },
      base: null,
      updatedAt: null,
      view: { x: 0, y: 0, k: 1 },
      sel: {},
      selEdge: null,
      mode: 'select',
      pending: null,
      hist: CL.makeHistory(),
      dirty: false,
      status: '',
      conflict: null,
      panel: null,
      nodeEls: {},
      ptrs: {},
      drag: null,
      typing: false
    };
    S.canvas = { topic: topic };
    U.render();
    U.api('getBoard', { topic: topic })
      .then(function (r) {
        if (!C || C.topic !== topic) return;
        if (!r.ok) {
          C.error = T(r.error || '讀取失敗');
          C.loading = false;
          mountIfShown();
          return;
        }
        C.board = CL.normalize(r.board);
        C.updatedAt = r.updatedAt;
        C.base = { board: CL.clone(C.board), updatedAt: r.updatedAt };
        C.loading = false;
        C.needFit = true;
        mountIfShown();
      })
      .catch(function (e) {
        if (C && C.topic === topic) {
          C.error = e.message;
          C.loading = false;
          mountIfShown();
        }
      });
  }
  function mountIfShown() {
    if (S.canvas && !S.note && !S.edit && !S.up && !S.zip) mount();
  }
  function leave() {
    if (C && C.dirty && !window.confirm(T('這張畫布還有沒儲存的修改，確定要離開嗎？'))) return false;
    setFull(false);
    C = null;
    S.canvas = null;
    return true;
  }

  /* ───── 畫面 ───── */
  function tb(label, title, fn, cls, aria) {
    return el('button', {
      type: 'button',
      class: 'tbtn cv-b' + (cls ? ' ' + cls : ''),
      title: title || label,
      'aria-label': aria || false,
      text: label,
      onclick: fn
    });
  } // 無障礙名稱預設就是按鈕文字

  /* 工具列的下拉選單：按鈕＋選單（role=menu）。點選項、點外面或按 Esc 會收起。選項引用存在 C.dom.menuRefs。 */
  function closeMenus(except) {
    if (!C || !C.dom || !C.dom.root) return;
    Array.prototype.forEach.call(C.dom.root.querySelectorAll('.cv-mlist'), function (l) {
      if (l !== except && !l.hidden) {
        l.hidden = true;
        l.previousSibling.setAttribute('aria-expanded', 'false');
      }
    });
  }
  function menu(label, title, items) {
    var refs = (C.dom.menuRefs = C.dom.menuRefs || {});
    var list = el('div', { class: 'cv-mlist', role: 'menu', 'aria-label': label });
    var btn = el('button', {
      type: 'button',
      class: 'tbtn cv-b cv-mbtn',
      title: title,
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      text: label + ' ▾',
      onclick: function () {
        var open = list.hidden;
        closeMenus();
        list.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
          var f = list.querySelector('button:not([disabled])');
          if (f) f.focus();
        }
      }
    });
    list.hidden = true;
    items.forEach(function (it) {
      if (it.sep) {
        list.appendChild(el('div', { class: 'cv-msep', role: 'separator' }));
        return;
      }
      var b = el('button', {
        type: 'button',
        role: 'menuitem',
        class: 'cv-mi' + (it.danger ? ' danger' : ''),
        title: it.title || it.label,
        text: it.label,
        onclick: function () {
          closeMenus();
          btn.focus();
          if (it.fn) it.fn();
        }
      });
      if (it.ref) refs[it.ref] = b;
      list.appendChild(b);
    });
    list.addEventListener('keydown', function (e) {
      var all = Array.prototype.filter.call(list.querySelectorAll('button'), function (x) {
          return !x.disabled;
        }),
        i = all.indexOf(document.activeElement);
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeMenus();
        btn.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (all.length) all[(i + 1) % all.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (all.length) all[(i - 1 + all.length) % all.length].focus();
      }
    });
    return el('div', { class: 'cv-menu' }, [btn, list]);
  }
  document.addEventListener('pointerdown', function (e) {
    if (C && C.dom && C.dom.root && !(e.target.closest && e.target.closest('.cv-menu'))) closeMenus();
    if (
      C &&
      C.dom &&
      C.dom.tools &&
      C.dom.tools.classList.contains('open') &&
      !(e.target.closest && e.target.closest('.cv-bar'))
    ) {
      C.dom.tools.classList.remove('open');
      if (C.dom.toolsBtn) C.dom.toolsBtn.setAttribute('aria-expanded', 'false');
    }
  });

  function mount() {
    var main = $('main');
    main.textContent = '';
    if (!C) return;
    var title = U.topicTitle(C.topic) || C.topic;
    var top = el('p', { class: 'back' }, [
      el('button', {
        type: 'button',
        class: 'linkbtn',
        text: T('← 回到列表'),
        onclick: function () {
          if (leave()) U.render();
        }
      })
    ]);
    main.appendChild(top);
    main.appendChild(el('h2', { text: T('{1}・畫布', title) }));
    var tp = S.tmap && S.tmap[C.topic];
    if (tp && S.me.isOwner)
      main.appendChild(
        el('p', { class: 'sub', id: 'cv-vis' }, [
          T('公開與否跟著主題：目前{1}。', tp.defaultPublic === true ? T('公開') : T('私人')),
          ' ',
          U.openTopicEditor
            ? el('button', {
                type: 'button',
                class: 'linkbtn',
                text: T('到主題設定修改'),
                onclick: function () {
                  U.openTopicEditor(C.topic);
                }
              })
            : null
        ])
      );
    if (C.loading) {
      main.appendChild(el('p', { class: 'empty', text: T('載入中…') }));
      return;
    }
    if (C.error) {
      main.appendChild(el('p', { class: 'err', text: C.error }));
      return;
    }
    C.editable = canvasEditable();
    C.dom = {};
    C.nodeEls = {};
    C.mapOf = null;
    var d = C.dom;
    d.root = el('div', { class: 'cv-root' });

    var bar = el('div', { class: 'cv-bar', role: 'toolbar', 'aria-label': T('畫布工具') });
    var X = function (n) {
      return function () {
        if (K.tools && K.tools[n]) K.tools[n].apply(null, arguments);
      };
    }; // P7 工具在 canvas_tools.js
    if (C.editable) {
      bar.appendChild(
        menu(T('＋ 新增'), T('新增卡片'), [
          {
            label: T('文字卡片'),
            fn: function () {
              addNode('text');
            }
          },
          {
            label: T('筆記卡片'),
            title: T('放入一則筆記'),
            fn: function () {
              togglePanel('note');
            }
          },
          {
            label: T('連結卡片'),
            title: T('新增連結卡片（可嵌入 YouTube）'),
            fn: function () {
              togglePanel('link');
            }
          },
          {
            label: T('群組框'),
            fn: function () {
              addNode('group');
            }
          },
          {
            label: T('SVG 圖片'),
            title: T('放入一張 SVG 圖片'),
            fn: function () {
              togglePanel('svg');
            }
          },
          {
            label: T('圖片'),
            title: T('放入一張圖片（PNG、JPG、WebP；也可直接貼上或拖進畫布）'),
            fn: X('pickImage')
          },
          {
            label: T('HTML 檔'),
            title: T('放入一個 HTML 檔（最大 500 KB；預設只靜態顯示，也可拖進畫布）'),
            fn: function () {
              if (K.embed) K.embed.pickHtml();
            }
          },
          {
            label: T('手繪'),
            title: T('用筆畫圖，存成 SVG 圖片卡'),
            fn: function () {
              togglePanel('draw');
            }
          }
        ])
      );
      d.bEdge = tb(T('連線'), T('依序點選兩張卡片建立連線'), function () {
        setMode(C.mode === 'edge' ? 'select' : 'edge');
      });
      d.bBox = tb(T('框選'), T('拖曳框選多張卡片（也可按住 Shift 拖曳）'), function () {
        setMode(C.mode === 'box' ? 'select' : 'box');
      });
      d.bUndo = tb(T('復原'), T('復原（Ctrl+Z）'), undo);
      d.bRedo = tb(T('重做'), T('重做（Ctrl+Y）'), redo);
      d.bDel = tb(T('刪除'), T('刪除選取（Delete）'), deleteSel);
      [d.bEdge, d.bBox, d.bUndo, d.bRedo, d.bDel].forEach(function (b) {
        bar.appendChild(b);
      });
      d.align = {};
      bar.appendChild(
        menu(T('排列'), T('對齊、等距、整理排版'), [
          { label: T('靠左對齊'), ref: 'left', fn: X('align', 'left') },
          { label: T('水平置中'), ref: 'hcenter' },
          { label: T('靠右對齊'), ref: 'right' },
          { label: T('靠上對齊'), ref: 'top' },
          { label: T('垂直置中'), ref: 'vcenter' },
          { label: T('靠下對齊'), ref: 'bottom' },
          { label: T('水平等距'), ref: 'hdist' },
          { label: T('垂直等距'), ref: 'vdist' },
          { sep: true },
          {
            label: K.snapOn && K.snapOn() ? T('對齊吸附：開') : T('對齊吸附：關'),
            title: T('拖曳時自動對齊附近卡片（按住 Alt 暫時停用）'),
            ref: '_snap',
            fn: X('toggleSnap')
          },
          {
            label: T('整理排版'),
            title: T('把筆記卡片自動排整齊（可復原）'),
            fn: function () {
              togglePanel('layout');
            }
          }
        ])
      );
    }
    bar.appendChild(
      tb(
        T('－'),
        T('縮小'),
        function () {
          zoomBy(1 / 1.25);
        },
        '',
        T('縮小')
      )
    );
    d.zoom = el('span', { class: 'cv-zoom', text: '100%' });
    bar.appendChild(d.zoom);
    bar.appendChild(
      tb(
        T('＋'),
        T('放大'),
        function () {
          zoomBy(1.25);
        },
        '',
        T('放大')
      )
    );
    bar.appendChild(tb(T('符合視窗'), T('顯示全部卡片（0）'), fit));
    d.fullBtn = tb(S.cvFull ? T('離開全螢幕') : T('全螢幕'), T('畫布全螢幕（Esc 離開）'), function () {
      setFull(!S.cvFull);
    });
    bar.appendChild(d.fullBtn);
    bar.appendChild(
      tb(T('簡報'), T('簡報模式：依群組逐頁放大，←／→ 換頁，Esc 離開'), function () {
        if (K.pres) K.pres.start();
      })
    );
    bar.appendChild(
      tb(T('搜尋'), T('在畫布上找卡片（Ctrl+F）'), function () {
        togglePanel('find');
      })
    );
    var more = [];
    if (C.editable)
      more.push(
        { label: T('放大所選'), title: T('放大到選取的那張卡片（再按一次回原本視角）'), fn: focusSel },
        {
          label: zoomClick() ? T('單擊放大：開') : T('單擊放大：關'),
          title: T('單擊卡片時是否放大到該卡片（拖曳仍是移動）'),
          ref: '_zc',
          fn: toggleZoomClick
        }
      );
    more.push(
      {
        label: thumbsOn() ? T('預覽圖：開') : T('預覽圖：關'),
        title: T('是否載入外部網站的縮圖（會連線到該網站，對方看得到你的 IP；預設關閉）'),
        ref: '_th',
        fn: toggleThumbs
      },
      {
        label: T('分享連結'),
        title: T('取得這張畫布的分享連結'),
        fn: function () {
          togglePanel('share');
        }
      },
      { sep: true },
      { label: T('匯出'), title: T('下載成 Obsidian 可開啟的 .canvas 檔'), fn: exportBoard },
      {
        label: T('匯出 PNG 圖片'),
        title: T('把整張畫布（有選取時只匯出選取的卡片）存成 PNG 圖片'),
        fn: function () {
          if (K.pres) K.pres.exportImage('png');
        }
      },
      {
        label: T('匯出 SVG 圖片'),
        title: T('存成向量 SVG 圖片（可放大不失真）'),
        fn: function () {
          if (K.pres) K.pres.exportImage('svg');
        }
      }
    );
    if (C.editable)
      more.push(
        {
          label: T('匯入'),
          title: T('用 .canvas 檔取代目前畫布（可復原）'),
          fn: function () {
            d.file.click();
          }
        },
        { sep: true },
        {
          label: T('刪除畫布'),
          title: T('把這張畫布移到 Google Drive 垃圾桶（主題與筆記不受影響）'),
          danger: true,
          fn: function () {
            togglePanel('delboard');
          }
        }
      );
    bar.appendChild(menu(T('更多'), T('更多功能'), more));
    d.zcBtn = d.menuRefs._zc;
    d.thBtn = d.menuRefs._th;
    d.snapBtn = d.menuRefs._snap;
    ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom', 'hdist', 'vdist'].forEach(function (m) {
      if (d.menuRefs[m]) {
        d.align[m] = d.menuRefs[m];
        d.menuRefs[m].onclick = function () {
          closeMenus();
          X('align')(m);
        };
      }
    });
    if (C.editable) {
      d.file = el('input', {
        type: 'file',
        accept: '.canvas,.json,application/json',
        class: 'cv-file',
        'aria-label': T('選擇畫布檔'),
        onchange: onImportFile
      });
      bar.appendChild(d.file);
      d.save = tb(T('儲存'), T('儲存（Ctrl+S）'), save, 'primary');
      bar.appendChild(d.save);
    }
    /* 全螢幕（或手機橫向）空間不夠：「簡報」以後的按鈕收進「☰ 工具」下拉；縮放、全螢幕、儲存永遠留在外面 */
    var kids = Array.prototype.slice.call(bar.children),
      at = kids.indexOf(d.fullBtn);
    if (at >= 0) {
      var tw = el('div', { class: 'cv-tools', id: 'cv-tools' });
      kids.slice(at + 1).forEach(function (k) {
        if (!/\bprimary\b/.test(k.className) && !/\bcv-file\b/.test(k.className)) tw.appendChild(k);
      });
      d.toolsBtn = tb(
        T('☰ 工具'),
        T('展開／收起所有畫布工具'),
        function () {
          var open = !tw.classList.contains('open');
          tw.classList.toggle('open', open);
          d.toolsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
          if (!open) closeMenus();
        },
        'cv-toolsbtn',
        false
      );
      d.toolsBtn.setAttribute('aria-expanded', 'false');
      d.toolsBtn.setAttribute('aria-controls', 'cv-tools');
      bar.insertBefore(tw, d.fullBtn.nextSibling);
      bar.insertBefore(d.toolsBtn, tw);
      d.tools = tw;
      tw.addEventListener('click', function (e) {
        var t = e.target;
        if (t.closest && (t.closest('.cv-mi') || (t.closest('.cv-b') && !t.closest('.cv-mbtn'))))
          setTimeout(function () {
            tw.classList.remove('open');
            if (d.toolsBtn) d.toolsBtn.setAttribute('aria-expanded', 'false');
          }, 0);
      });
    }
    d.root.appendChild(bar);
    d.status = el('p', { class: 'status cv-status', role: 'status', text: C.status });
    d.root.appendChild(d.status);
    d.panelBox = el('div', { class: 'cv-panelbox' });
    d.root.appendChild(d.panelBox);

    d.view = el('div', {
      class: 'cv-view' + (C.editable ? ' edit' : ''),
      tabindex: '0',
      role: 'application',
      'aria-label': T('畫布。方向鍵平移，加減號縮放，0 符合視窗。')
    });
    d.world = el('div', { class: 'cv-world' });
    d.gl = el('div', { class: 'cv-layer' });
    d.edges = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    d.edges.setAttribute('class', 'cv-edges');
    d.cl = el('div', { class: 'cv-layer' });
    d.world.appendChild(d.gl);
    d.world.appendChild(d.edges);
    d.world.appendChild(d.cl);
    d.view.appendChild(d.world);
    d.box = el('div', { class: 'cv-boxsel' });
    d.box.style.display = 'none';
    d.view.appendChild(d.box);
    d.mini = el('canvas', {
      class: 'cv-mini',
      width: '180',
      height: '120',
      'aria-label': T('小地圖，點擊可移動視窗')
    });
    d.view.appendChild(d.mini);
    d.empty = el('p', {
      class: 'cv-hint',
      text: C.board.nodes.length
        ? ''
        : C.editable
          ? T('這張畫布是空的。用上方「＋ 新增」開始，或直接貼上文字、網址。')
          : T('這個主題還沒有畫布。')
    });
    d.view.appendChild(d.empty);
    d.insp = el('aside', { class: 'cv-insp', 'aria-label': T('屬性') });
    var wrap = el('div', { class: 'cv-wrap' + (C.editable ? ' has-insp' : '') }, [d.view]);
    if (C.editable) wrap.appendChild(d.insp);
    d.root.appendChild(wrap);
    main.appendChild(d.root);

    bindView();
    if (C.needFit) {
      C.view = CL.fitView(eff(), d.view.clientWidth || 800, d.view.clientHeight || 520);
      C.needFit = false;
    }
    syncBar();
    syncInspector();
    renderPanel();
    draw();
  }

  function syncBar() {
    var d = C && C.dom;
    if (!d) return;
    if (d.save) {
      d.save.disabled = !C.dirty;
      d.save.textContent = C.dirty ? T('儲存 ●') : T('儲存');
    }
    if (d.bUndo) {
      d.bUndo.disabled = !C.hist.canUndo();
      d.bRedo.disabled = !C.hist.canRedo();
      d.bDel.disabled = !(Object.keys(C.sel).length || C.selEdge);
    }
    if (d.align) {
      var ns = Object.keys(C.sel).length;
      Object.keys(d.align).forEach(function (m) {
        d.align[m].disabled = ns < (/dist$/.test(m) ? 3 : 2);
      });
    }
    if (d.bEdge) {
      d.bEdge.classList.toggle('on', C.mode === 'edge');
      d.bBox.classList.toggle('on', C.mode === 'box');
      d.bEdge.setAttribute('aria-pressed', C.mode === 'edge');
      d.bBox.setAttribute('aria-pressed', C.mode === 'box');
    }
    if (d.empty)
      d.empty.textContent = C.board.nodes.length
        ? ''
        : C.editable
          ? T('這張畫布是空的。用上方「＋ 新增」開始，或直接貼上文字、網址。')
          : T('這個主題還沒有畫布。');
  }
  function setMode(m) {
    C.mode = m;
    C.pending = null;
    setStatus(
      m === 'edge'
        ? T('連線：請點第一張卡片，再點第二張卡片；要連到群組，請點群組的標題列或邊框。（Esc 取消）')
        : m === 'box'
          ? T('框選：在空白處拖曳。')
          : ''
    );
    syncBar();
    draw();
  }

  /* ───── 繪製 ───── */
  function draw() {
    if (!C || !C.dom || !C.dom.view || C.raf) return;
    C.raf = requestAnimationFrame(function () {
      C.raf = 0;
      if (C && C.dom && C.dom.view) {
        var t0 = performance.now();
        paint();
        (C.pm = C.pm || []).push(performance.now() - t0);
        if (C.pm.length > 600) C.pm.shift();
      }
    });
  }
  function viewRect(margin) {
    var v = C.view,
      d = C.dom.view,
      m = margin / v.k;
    return {
      x: -v.x / v.k - m,
      y: -v.y / v.k - m,
      w: d.clientWidth / v.k + 2 * m,
      h: d.clientHeight / v.k + 2 * m
    };
  }
  function paint() {
    var v = C.view,
      d = C.dom;
    d.world.style.transform = 'translate(' + v.x + 'px,' + v.y + 'px) scale(' + v.k + ')';
    d.world.style.setProperty('--inv', (1 / v.k).toFixed(3));
    d.world.classList.toggle('lod', v.k < LOD_K);
    d.zoom.textContent = Math.round(v.k * 100) + '%';
    var r = viewRect(200);
    paintNodes(r);
    paintEdges(r);
    paintMini();
  }
  function nodeSig(n) {
    var o = {};
    Object.keys(n).forEach(function (k) {
      if (k !== 'x' && k !== 'y' && k !== 'width' && k !== 'height' && k !== 'x-parent') o[k] = n[k];
    });
    var id = n.type === 'file' ? noteIdOf(n) : null;
    if (n.type === 'file') {
      o._t = id && S.byId[id] ? S.byId[id].title : '';
    }
    if (n.type === 'file' && id) {
      var it = S.byId[id];
      o._m = it ? (it.cover || '') + '|' + (it.tags || []).join(',') + '|' + (it.date || '') : '';
    }
    if (n.type === 'link') o._th = thumbsOn() ? 1 : 0;
    if (n.type === 'group') o._c = C.cinfo.count[n.id] || 0;
    return CL.stable(o);
  }
  function paintNodes(r) {
    var nodes = eff(),
      vis = {},
      lod = C.view.k < LOD_K;
    CL.visibleNodes(nodes, r).forEach(function (id) {
      vis[id] = 1;
    });
    Object.keys(C.nodeEls).forEach(function (id) {
      if (!vis[id]) {
        var e = C.nodeEls[id];
        if (e.parentNode) e.parentNode.removeChild(e);
        delete C.nodeEls[id];
      }
    });
    var z = 0;
    CL.drawOrder(nodes).forEach(function (n) {
      z++;
      if (!vis[n.id]) return;
      var e = C.nodeEls[n.id],
        sig = nodeSig(n);
      if (!e || e._sig !== sig) {
        var ne = buildNode(n);
        ne._sig = sig;
        if (e && e.parentNode) e.parentNode.replaceChild(ne, e);
        else (n.type === 'group' ? C.dom.gl : C.dom.cl).appendChild(ne);
        e = C.nodeEls[n.id] = ne;
      }
      var s = e.style;
      s.left = n.x + 'px';
      s.top = n.y + 'px';
      s.width = n.width + 'px';
      s.height = n.height + 'px';
      s.zIndex = n.type === 'group' ? String(z) : String(10000 + z); // 群組（大到小）< 連線 5000 < 卡片
      e.classList.toggle('sel', !!C.sel[n.id]);
      e.classList.toggle('hit', !!(C.hits && C.hits[n.id]));
      e.classList.toggle('hitcur', C.hitCur === n.id);
      e.classList.toggle('pend', C.pending === n.id);
      e.classList.toggle('collapsed', n.type === 'group' && n['x-collapsed'] === true);
      if (K.tools && K.tools.decorate) K.tools.decorate(e, n);
      if (!lod && !e._filled) fillContent(e, n);
    });
  }
  function nodeTitle(n) {
    if (n.type === 'group') return n.label || T('（未命名群組）');
    if (n.type === 'file') {
      var id = noteIdOf(n);
      if (id && S.byId[id]) return S.byId[id].title;
      var c = id && noteCache[id];
      return c && c.state === 'ok'
        ? c.title
        : CL.htmlIdOf(n.file)
          ? T('HTML：{1}', n['x-title'] || CL.htmlIdOf(n.file))
          : imgIdOf(n)
            ? T('圖片：{1}', imgIdOf(n))
            : svgIdOf(n)
              ? T('圖：{1}', svgIdOf(n))
              : n.file || T('（檔案）');
    }
    if (n.type === 'link') {
      var pv = CL.effPreview(CL.safeUrl(n.url), n['x-preview']);
      return (pv && pv.title) || CL.hostOf(n.url) || n.url || T('（連結）');
    }
    var line =
      String(n.text || '')
        .split('\n')
        .filter(function (x) {
          return x.trim();
        })[0] || T('（空白文字卡片）');
    return line.replace(/^#+\s*/, '').slice(0, 80);
  }

  function buildNode(n) {
    var d = el('div', {
      class: 'cv-node t-' + n.type,
      'data-id': n.id,
      role: 'group',
      'aria-label': nodeTitle(n)
    });
    var col = CL.colorOf(n.color);
    if (col) d.style.setProperty('--nc', col);
    if (n.type === 'text' && window.CanvasOps) d.classList.add('fs-' + window.CanvasOps.fontSizeOf(n));
    if (n.type === 'group') {
      var coll = n['x-collapsed'] === true,
        cnt = C.cinfo.count[n.id] || 0;
      d.appendChild(
        el('button', {
          type: 'button',
          class: 'cv-gtoggle',
          title: coll ? T('展開群組') : T('收合群組'),
          'aria-label': (coll ? T('展開群組：') : T('收合群組：')) + (n.label || ''),
          'aria-expanded': coll ? 'false' : 'true',
          text: coll ? '▸' : '▾',
          onclick: function (ev) {
            ev.stopPropagation();
            toggleGroup(n.id);
          }
        })
      );
      d.appendChild(
        el('div', { class: 'cv-glabel', text: (n.label || '') + (coll ? T('（{1}）', cnt) : '') })
      );
      ['t', 'r', 'b', 'l'].forEach(function (s) {
        d.appendChild(el('div', { class: 'cv-gb cv-gb-' + s }));
      });
    } else {
      d.appendChild(el('div', { class: 'cv-lodtitle', text: nodeTitle(n) }));
      var head = el('div', { class: 'cv-head' });
      if (n.type === 'file' && noteIdOf(n)) {
        head.appendChild(el('span', { class: 'cv-ttl', text: nodeTitle(n) }));
        head.appendChild(
          el('button', {
            type: 'button',
            class: 'cv-open',
            title: T('開啟筆記'),
            'aria-label': T('開啟筆記：{1}', nodeTitle(n)),
            text: '↗',
            onclick: function (ev) {
              ev.stopPropagation();
              openNoteFromCanvas(noteIdOf(n));
            }
          })
        );
        d.appendChild(head);
      } else if (n.type === 'link') {
        head.appendChild(el('span', { class: 'cv-ttl', text: nodeTitle(n) }));
        var lu = CL.safeUrl(n.url);
        if (lu)
          head.appendChild(
            el('a', {
              href: lu,
              target: '_blank',
              rel: 'noopener noreferrer',
              class: 'cv-open cv-openext',
              title: T('在新分頁開啟原連結'),
              'aria-label': T('在新分頁開啟原連結：{1}', nodeTitle(n)),
              text: '↗',
              onclick: function (ev) {
                ev.stopPropagation();
              }
            })
          );
        d.appendChild(head);
      }
      d.appendChild(el('div', { class: 'cv-body md' }));
    }
    d.appendChild(el('div', { class: 'cv-h', title: T('拖曳調整大小') }));
    return d;
  }
  U.exitCanvasFull = function () {
    if (S.cvFull) setFull(false);
  };
  function openNoteFromCanvas(id) {
    if (S.byId[id]) U.openNote(id);
    else setStatus(T('這則筆記不在目前可見的索引中。'));
  }

  function fillContent(e, n) {
    var body = e.querySelector('.cv-body');
    if (!body) {
      e._filled = true;
      return;
    }
    if (n.type === 'text') {
      e._filled = true;
      if (!String(n.text || '').trim()) {
        body.textContent = '';
        body.appendChild(el('span', { class: 'cv-ph', text: T('（雙擊編輯）') }));
        return;
      }
      body.innerHTML = md.render(L.rewriteInternalLinks(String(n.text).slice(0, CARD_CHARS * 2), S.byId));
      U.loadSvgs(body);
      bindCardLinks(body);
    } else if (K.embed && K.embed.fill(e, n, body)) {
      return; // HTML 檔卡片、嵌入網頁（canvas_embed.js）
    } else if (n.type === 'file') {
      var iid = imgIdOf(n);
      if (iid) {
        e._filled = true;
        body.appendChild(el('img', { 'data-img': iid, alt: '', class: 'cv-photo', draggable: 'false' }));
        U.loadImgs(body);
        return;
      }
      var sid = svgIdOf(n);
      if (sid) {
        e._filled = true;
        var img = el('img', { 'data-svg': sid, alt: '', class: 'svg-img cv-svg' });
        body.appendChild(img);
        U.loadSvgs(body);
        return;
      }
      var id = noteIdOf(n);
      if (!id) {
        e._filled = true;
        body.appendChild(el('span', { class: 'cv-ph', text: n.file || '' }));
        return;
      }
      e._filled = true;
      body.appendChild(el('span', { class: 'cv-ph', text: T('載入中…') }));
      loadNote(id, function (c) {
        if (C.nodeEls[n.id] !== e) return;
        body.textContent = '';
        if (c.state !== 'ok') {
          body.appendChild(el('span', { class: 'cv-ph', text: T('（找不到這則筆記）') }));
          return;
        }
        var t = e.querySelector('.cv-ttl');
        if (t && !S.byId[id]) t.textContent = c.title;
        var mi = S.byId[id];
        if (mi) {
          var mt = [];
          if (mi.date) mt.push(mi.date);
          if (mi.cover && /^\d{8}-[a-z0-9]{2,8}$/.test(mi.cover))
            body.appendChild(el('img', { 'data-svg': mi.cover, alt: '', class: 'svg-img cv-cover' }));
          if (mt.length || (mi.tags || []).length)
            body.appendChild(
              el(
                'div',
                { class: 'cv-meta' },
                [mt.join('・')].concat(
                  (mi.tags || []).slice(0, 4).map(function (g) {
                    return el('span', { class: 'cv-tag', text: g });
                  })
                )
              )
            );
        }
        var tmp = el('div', { class: 'cv-excerpt' });
        body.appendChild(tmp);
        tmp.innerHTML = md.render(L.rewriteInternalLinks(String(c.body).slice(0, CARD_CHARS), S.byId));
        U.loadSvgs(body);
        bindCardLinks(body);
      });
    } else if (n.type === 'link') {
      e._filled = true;
      var url = CL.safeUrl(n.url);
      if (!url) {
        body.appendChild(el('span', { class: 'cv-ph', text: T('（不支援的連結）') }));
        return;
      }
      var yt = CL.youtubeId(url),
        pv = CL.effPreview(url, n['x-preview']),
        th = thumbsOn();
      var thumb = '';
      if (th) thumb = yt ? CL.ytThumb(yt) : CL.isImageUrl(url) ? url : (pv && pv.image) || '';
      if (yt) {
        var ph = el('button', {
          type: 'button',
          class: 'cv-play' + (thumb ? ' has-thumb' : ''),
          text: T('▶ 載入影片（會連線到 YouTube）'),
          onclick: function (ev) {
            ev.stopPropagation();
            var f = el('iframe', {
              src: 'https://www.youtube-nocookie.com/embed/' + yt,
              title: T('嵌入的影片'),
              allow: 'encrypted-media; picture-in-picture',
              allowfullscreen: 'true',
              referrerpolicy: 'strict-origin-when-cross-origin',
              sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
              class: 'cv-yt'
            });
            body.textContent = '';
            body.appendChild(f);
            body.appendChild(
              el('a', {
                href: url,
                target: '_blank',
                rel: 'noopener noreferrer',
                class: 'cv-ext',
                text: T('無法播放？在新分頁開啟')
              })
            );
          }
        });
        if (thumb) ph.style.backgroundImage = 'url("' + thumb + '")';
        body.appendChild(ph);
      } else if (thumb) {
        body.appendChild(
          el('img', {
            class: 'cv-thumb',
            src: thumb,
            alt: '',
            loading: 'lazy',
            referrerpolicy: 'no-referrer',
            decoding: 'async'
          })
        );
      } else if (CL.isImageUrl(url)) {
        body.appendChild(
          el('span', { class: 'cv-ph', text: T('圖片連結（預覽圖已關閉，可按上方「預覽圖」開啟）') })
        );
      }
      if (pv && (pv.title || pv.description)) {
        body.appendChild(
          el('div', { class: 'cv-pv' }, [
            pv.title ? el('strong', { class: 'cv-pvt', text: pv.title }) : null,
            pv.description ? el('span', { class: 'cv-pvd', text: pv.description }) : null,
            pv.site ? el('span', { class: 'cv-pvs', text: pv.site }) : null
          ])
        );
      }
      body.appendChild(
        el('a', {
          href: url,
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'cv-ext',
          text: yt ? T('在 YouTube 開啟') : pv ? CL.hostOf(url) : url
        })
      );
    }
  }
  function bindCardLinks(body) {
    body.addEventListener('click', function (ev) {
      var a = ev.target.closest && ev.target.closest('a.note-link');
      if (a) {
        ev.preventDefault();
        openNoteFromCanvas(a.getAttribute('data-note'));
      }
    });
  }

  function paintEdges(r) {
    eff();
    var map = C.effMap,
      rd = C.cinfo.redirect,
      out = [],
      k = C.view.k,
      sz = Math.max(12, 14 / Math.max(k, 0.3));
    C.board.edges.forEach(function (e) {
      var a = map[e.fromNode] || map[rd[e.fromNode]],
        b = map[e.toNode] || map[rd[e.toNode]];
      if (!a || !b || a === b) return; // 連到被收合子孫的線改接到群組；兩端都在同一個收合群組內的線隱藏
      var g = CL.edgeGeom(a, b, e),
        bx = g.box;
      if (bx.x > r.x + r.w || bx.x + bx.w < r.x || bx.y > r.y + r.h || bx.y + bx.h < r.y) return;
      var col = CL.colorOf(e.color) || 'var(--mute)',
        ends = CL.edgeEnds(e),
        sel = C.selEdge === e.id;
      out.push('<g class="cv-e' + (sel ? ' sel' : '') + '" data-e="' + esc(e.id) + '">');
      out.push('<path class="cv-eh" d="' + g.d + '"/>');
      out.push(
        '<path class="cv-el" d="' +
          g.d +
          '" style="stroke:' +
          col +
          '"' +
          (e['x-style'] === 'dashed' ? ' stroke-dasharray="8 6"' : '') +
          '/>'
      );
      if (ends.to === 'arrow')
        out.push('<polygon points="' + CL.arrowPoints(g.p2, g.c2, sz) + '" style="fill:' + col + '"/>');
      if (ends.from === 'arrow')
        out.push('<polygon points="' + CL.arrowPoints(g.p1, g.c1, sz) + '" style="fill:' + col + '"/>');
      if (e.label) {
        var lp = CL.labelPoint(g, e),
          lsz = CL.labelSizeOf(e);
        out.push(
          '<text class="cv-et" x="' +
            lp.x.toFixed(1) +
            '" y="' +
            lp.y.toFixed(1) +
            '"' +
            (lsz === 'm' ? '' : ' style="font-size:' + CL.LABEL_PX[lsz] + 'px"') +
            ' data-ls="' +
            lsz +
            '" data-lp="' +
            CL.labelPosOf(e) +
            '" text-anchor="middle" dominant-baseline="middle">' +
            esc(e.label) +
            '</text>'
        );
      }
      out.push('</g>');
    });
    C.dom.edges.innerHTML = out.join('');
  }

  function paintMini() {
    var cv = C.dom.mini,
      ctx = cv.getContext('2d'),
      W = cv.width,
      H = cv.height,
      nodes = eff();
    var cs = getComputedStyle(C.dom.view),
      accent = cs.getPropertyValue('--accent') || '#2f5d62',
      line = cs.getPropertyValue('--mute') || '#888';
    ctx.clearRect(0, 0, W, H);
    var vr = viewRect(0),
      b = CL.bounds(nodes) || vr;
    var x1 = Math.min(b.x, vr.x),
      y1 = Math.min(b.y, vr.y),
      x2 = Math.max(b.x + b.w, vr.x + vr.w),
      y2 = Math.max(b.y + b.h, vr.y + vr.h);
    var s = Math.min((W - 8) / Math.max(x2 - x1, 1), (H - 8) / Math.max(y2 - y1, 1));
    var ox = (W - (x2 - x1) * s) / 2 - x1 * s,
      oy = (H - (y2 - y1) * s) / 2 - y1 * s;
    C.miniT = { s: s, ox: ox, oy: oy };
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = line.trim();
    nodes.forEach(function (n) {
      if (n.type === 'group') ctx.strokeRect(n.x * s + ox, n.y * s + oy, n.width * s, n.height * s);
      else ctx.fillRect(n.x * s + ox, n.y * s + oy, Math.max(1.5, n.width * s), Math.max(1.5, n.height * s));
    });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = accent.trim();
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vr.x * s + ox, vr.y * s + oy, vr.w * s, vr.h * s);
  }

  /* ───── 視角 ───── */
  function viewSize() {
    return { w: C.dom.view.clientWidth, h: C.dom.view.clientHeight };
  }
  /* 單擊卡片＝放大到那張卡片（再點一次回到原本視角）；雙擊＝開啟筆記。唯讀（訪客、手機）單擊即生效；可編輯時單擊是選取，改用「放大所選」。 */
  function focusNode(id) {
    var n = nodeMap()[id];
    if (!n) return;
    var f = C.focus,
      v = C.view;
    if (
      f &&
      f.id === id &&
      Math.abs(f.at.x - v.x) < 1 &&
      Math.abs(f.at.y - v.y) < 1 &&
      Math.abs(f.at.k - v.k) < 0.001
    ) {
      C.view = f.prev;
      C.focus = null;
      draw();
      return;
    } // 視角沒動過才還原，動過就當新的放大
    var s = viewSize(),
      pad = 48,
      k = Math.max(
        0.1,
        Math.min((s.w - pad * 2) / Math.max(n.width, 1), (s.h - pad * 2) / Math.max(n.height, 1), 2.5)
      );
    var prev = f && Math.abs(f.at.x - v.x) < 1 && Math.abs(f.at.k - v.k) < 0.001 ? f.prev : v;
    C.view = { x: (s.w - n.width * k) / 2 - n.x * k, y: (s.h - n.height * k) / 2 - n.y * k, k: k };
    C.focus = { id: id, prev: prev, at: C.view };
    draw();
  }
  /* 可編輯時「單擊放大」可開關（預設開）；只有沒拖曳的單擊才算，拖曳仍是移動卡片 */
  function zoomClick() {
    try {
      return localStorage.getItem('vault-cvzoomclick') !== '0';
    } catch (e) {
      return true;
    }
  }
  function toggleZoomClick() {
    var on = !zoomClick();
    try {
      localStorage.setItem('vault-cvzoomclick', on ? '1' : '0');
    } catch (e) {
      /* 略 */
    }
    if (C.dom.zcBtn) {
      C.dom.zcBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      C.dom.zcBtn.textContent = on ? T('單擊放大：開') : T('單擊放大：關');
    }
  }
  /* 外部縮圖（YouTube 縮圖、圖片網址、網頁封面）預設關閉：載入時對方網站會看到你的 IP。每位檢視者各自決定。 */
  function thumbsOn() {
    try {
      return localStorage.getItem('vault-cvthumbs') === '1';
    } catch (e) {
      return false;
    }
  }
  function toggleThumbs() {
    var on = !thumbsOn();
    try {
      localStorage.setItem('vault-cvthumbs', on ? '1' : '0');
    } catch (e) {
      /* 略 */
    }
    if (C.dom.thBtn) {
      C.dom.thBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      C.dom.thBtn.textContent = on ? T('預覽圖：開') : T('預覽圖：關');
    }
    setStatus(on ? T('已開啟預覽圖：會從各網站載入縮圖。') : T('已關閉預覽圖：不再連線到外部網站載入縮圖。'));
    draw();
  }
  function focusSel() {
    var ids = Object.keys(C.sel);
    if (ids.length === 1) focusNode(ids[0]);
    else setStatus(T('請先選取一張卡片。'));
  }
  /* 全螢幕：隱藏頁首、書櫃，畫布佔滿；Esc 先退出瀏覽器全螢幕，再按一次離開此版面 */
  function setFull(on) {
    var was = !!S.cvFull;
    S.cvFull = on;
    document.body.classList.toggle('cv-full', on);
    var de = document.documentElement;
    if (on && !was && de.requestFullscreen) {
      try {
        var p = de.requestFullscreen();
        if (p && p.catch)
          p.catch(function () {
            /* 不支援時只用版面 */
          });
      } catch (e) {
        /* 略 */
      }
    }
    if (!on && was && document.fullscreenElement && document.exitFullscreen) {
      try {
        document.exitFullscreen();
      } catch (e) {
        /* 略 */
      }
    }
    if (C && C.dom) {
      if (C.dom.fullBtn) C.dom.fullBtn.textContent = on ? T('離開全螢幕') : T('全螢幕');
      setTimeout(function () {
        if (C && C.dom) draw();
      }, 50);
    }
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && S.cvFull && !document.fullscreenElement) setFull(false);
  });
  function zoomBy(f) {
    var s = viewSize();
    C.view = CL.zoomAt(C.view, s.w / 2, s.h / 2, f);
    draw();
  }
  function fit() {
    var s = viewSize();
    C.view = CL.fitView(eff(), s.w, s.h);
    draw();
  }
  function toWorld(cx, cy) {
    var b = C.dom.view.getBoundingClientRect();
    return { x: (cx - b.left - C.view.x) / C.view.k, y: (cy - b.top - C.view.y) / C.view.k };
  }
  function viewCenter() {
    var s = viewSize();
    return { x: (s.w / 2 - C.view.x) / C.view.k, y: (s.h / 2 - C.view.y) / C.view.k };
  }

  /* ───── 編輯操作 ───── */
  function addNode(type, extra, at, size) {
    var p = at || viewCenter(),
      def = size || CL.DEF[type],
      taken = nodeMap(),
      id = CL.newId(taken);
    var n = Object.assign(
      {
        id: id,
        type: type,
        x: Math.round(p.x - def[0] / 2),
        y: Math.round(p.y - def[1] / 2),
        width: def[0],
        height: def[1]
      },
      extra || {}
    );
    if (type === 'text' && n.text === undefined) n.text = '';
    if (type === 'group' && n.label === undefined) n.label = T('新群組');
    var c = CL.center(n),
      g = CL.smallestGroupAt(C.board.nodes, c.x, c.y, null, type === 'group' ? CL.area(n) : null);
    if (g) n['x-parent'] = g.id;
    mutate(function (b) {
      return Object.assign({}, b, { nodes: b.nodes.concat([n]) });
    });
    C.sel = {};
    C.sel[id] = 1;
    C.selEdge = null;
    if (C.view.k < LOD_K) {
      // 縮太小時新卡片看不到內容：自動拉近到 100% 並置中在新卡片
      var s = viewSize(),
        cc = CL.center(n);
      C.view = { x: s.w / 2 - cc.x, y: s.h / 2 - cc.y, k: 1 };
    }
    syncBar();
    syncInspector();
    draw();
    return id;
  }
  /** 請後端擷取網頁預覽，存進卡片的 x-preview（可復原）；失敗只顯示原因，卡片仍保留。 */
  function fetchPreviewFor(id, url) {
    if (CL.notionInfo(url)) {
      setStatus(T('Notion 不提供公開預覽，卡片標題改用網址上的頁面名稱。'));
      return;
    }
    var topic = C.topic;
    setStatus(T('擷取預覽中…'));
    U.api('fetchPreview', { url: url })
      .then(function (r) {
        if (!C || C.topic !== topic) return;
        if (!r.ok) {
          setStatus(T('無法擷取預覽：{1}（卡片仍已加入）', T(r.error || '未知錯誤')));
          return;
        }
        if (!nodeMap()[id]) return;
        updateNode(id, { 'x-preview': r.preview });
        syncInspector();
        setStatus(T('已擷取預覽。按「儲存」才會寫入。'));
      })
      .catch(function (e) {
        if (C) setStatus(T('無法擷取預覽：{1}', e.message));
      });
  }
  function updateNode(id, patch, typing) {
    var apply = function (b) {
      return Object.assign({}, b, {
        nodes: b.nodes.map(function (n) {
          if (n.id !== id) return n;
          var m = Object.assign({}, n);
          Object.keys(patch).forEach(function (k) {
            if (patch[k] === undefined) delete m[k];
            else m[k] = patch[k];
          });
          return m;
        })
      });
    };
    if (typing) {
      if (!C.typing) {
        C.hist.push(snap());
        C.typing = true;
      }
      C.board = apply(C.board);
      markDirty();
      draw();
    } else mutate(apply);
  }
  function updateEdge(id, patch) {
    mutate(function (b) {
      return Object.assign({}, b, {
        edges: b.edges.map(function (e) {
          if (e.id !== id) return e;
          var m = Object.assign({}, e);
          Object.keys(patch).forEach(function (k) {
            if (patch[k] === undefined) delete m[k];
            else m[k] = patch[k];
          });
          return m;
        })
      });
    });
  }
  function addEdge(from, to) {
    var map = nodeMap(),
      a = map[from],
      b = map[to];
    if (!a || !b || from === to) return;
    if (
      C.board.edges.some(function (e) {
        return e.fromNode === from && e.toNode === to;
      })
    ) {
      setStatus(T('這兩張卡片之間已經有連線。'));
      return;
    }
    var ids = {};
    C.board.edges.forEach(function (e) {
      ids[e.id] = 1;
    });
    var e = { id: CL.newId(ids), fromNode: from, toNode: to, fromEnd: 'none', toEnd: 'arrow' };
    mutate(function (bd) {
      return Object.assign({}, bd, { edges: bd.edges.concat([e]) });
    });
    C.sel = {};
    C.selEdge = e.id;
    setMode('select');
    setStatus(T('已建立連線。可在右側設定名稱、顏色、線型。'));
    syncInspector();
  }
  function deleteSel() {
    if (!C.editable) return;
    var ids = Object.keys(C.sel);
    if (C.selEdge) {
      var eid = C.selEdge;
      mutate(function (b) {
        return Object.assign({}, b, {
          edges: b.edges.filter(function (e) {
            return e.id !== eid;
          })
        });
      });
      C.selEdge = null;
    } else if (ids.length) {
      mutate(function (b) {
        return CL.deleteNodes(b, ids);
      });
      C.sel = {};
    }
    syncBar();
    syncInspector();
    draw();
  }
  function toggleGroup(id) {
    var before = C.board;
    var next = CL.toggleCollapsed(before, id);
    if (C.editable)
      mutate(function () {
        return next;
      }); // 擁有者：寫入 x-collapsed，視為修改（可復原、按儲存才生效）
    else {
      C.board = next;
    } // 訪客與手機唯讀：只在這個畫面暫時展開或收合，不存檔
    var info = CL.collapseInfo(C.board.nodes);
    Object.keys(C.sel).forEach(function (k) {
      if (info.hidden[k]) delete C.sel[k];
    });
    syncBar();
    syncInspector();
    draw();
  }
  function restore(str) {
    C.board = JSON.parse(str);
    C.sel = {};
    C.selEdge = null;
    C.typing = false;
    markDirty();
    syncBar();
    syncInspector();
    draw();
  }
  function undo() {
    var s = C.hist.undo(snap());
    if (s) restore(s);
  }
  function redo() {
    var s = C.hist.redo(snap());
    if (s) restore(s);
  }

  /* ───── 存檔、衝突 ───── */
  function save() {
    if (!C.editable || !C.dirty || C.saving) return;
    C.saving = true;
    setStatus(T('儲存中…'));
    C.dom.save.disabled = true;
    var dd = CL.dropDanglingEdges(C.board);
    if (dd.removed) {
      C.hist.push(snap());
      C.board = dd.board;
      syncInspector();
      draw();
    } // 先清掉端點已不存在的連線，畫面與雲端才一致
    var sent = CL.prepareForSave(C.board),
      topic = C.topic,
      before = snap(),
      dropped = dd.removed;
    U.api('saveBoard', { topic: topic, board: sent, baseUpdatedAt: C.base.updatedAt })
      .then(function (r) {
        if (!C || C.topic !== topic) return;
        C.saving = false;
        if (r.ok) {
          C.base = { board: CL.clone(sent), updatedAt: r.updatedAt };
          C.dirty = snap() !== before;
          setStatus(
            (C.dirty ? T('已儲存（儲存期間又有新修改，尚未儲存）。') : T('已儲存。')) +
              (dropped ? T('　已自動移除 {1} 條失效連線。', dropped) : '')
          );
          syncBar();
          draw();
          return;
        }
        if (r.code === 409) {
          C.conflict = r.server || { updatedAt: null, board: { nodes: [], edges: [] } };
          setStatus('');
          renderPanel();
          syncBar();
          return;
        }
        setStatus(
          T(
            '儲存失敗：{1}{2}',
            T(r.error || '未知錯誤'),
            r.reasons ? T('（{1}）', T.all(r.reasons).join(T('；'))) : ''
          )
        );
        syncBar();
      })
      .catch(function (e) {
        if (C) {
          C.saving = false;
          setStatus(T('儲存失敗：{1}（修改仍保留在畫面上）', e.message));
          syncBar();
        }
      });
  }
  function download(name, text) {
    var blob = new Blob([text], { type: 'application/json' }),
      url = URL.createObjectURL(blob);
    try {
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      /* 被擋時改用面板內的複製欄位 */
    }
    return url;
  }
  function exportBoard() {
    var text = JSON.stringify(CL.prepareForSave(C.board), null, 2),
      name = C.topic + '.canvas';
    download(name, text);
    C.panel = { kind: 'export', text: text, name: name };
    renderPanel();
    setStatus(T('已嘗試下載「{1}」。若沒有開始下載，請從下方欄位複製內容。', name));
  }
  function onImportFile(ev) {
    var f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    U.readFile(f)
      .then(function (text) {
        var b;
        try {
          b = CL.parse(text);
        } catch (e) {
          setStatus(T('匯入失敗：不是有效的畫布檔（{1}）', e.message));
          return;
        }
        var probs = CL.validateCanvas(b).filter(function (p) {
            return !/必須是整數/.test(p);
          }),
          pp = CL.parentProblems(b.nodes);
        if (
          C.board.nodes.length &&
          !window.confirm(T('要用「{1}」取代目前畫布嗎？（可用復原還原，尚未儲存前不會寫入雲端）', f.name))
        )
          return;
        b.nodes = CL.fixParents(b.nodes);
        mutate(function () {
          return b;
        });
        C.sel = {};
        C.selEdge = null;
        fit();
        syncInspector();
        setStatus(
          T(
            '已匯入 {1} 張卡片、{2} 條連線{3}。按「儲存」才會寫入。',
            b.nodes.length,
            b.edges.length,
            probs.length || pp.length
              ? T('；有 {1} 項格式提醒（例如：{2}）', probs.length + pp.length, probs.concat(pp)[0])
              : ''
          )
        );
      })
      .catch(function () {
        setStatus(T('讀不到檔案'));
      });
  }

  /* ───── 浮動面板與屬性欄：實作在 canvas_panels.js、canvas_insp.js（透過 VaultUI.cv 掛上） ───── */
  function togglePanel(kind) {
    C.panel = C.panel && C.panel.kind === kind ? null : { kind: kind, q: '' };
    renderPanel();
  }
  function renderPanel() {
    if (K.renderPanel) K.renderPanel();
  }
  function syncInspector() {
    if (K.syncInspector) K.syncInspector();
  }

  /* ───── 指標、鍵盤 ───── */
  function selectOnly(id) {
    C.sel = {};
    if (id) C.sel[id] = 1;
    C.selEdge = null;
  }
  function canDragNow(e) {
    return C.editable && (e.pointerType !== 'touch' || U.FEATURES.canvasTouchEdit);
  }
  function bindView() {
    var v = C.dom.view;
    v.addEventListener('pointerdown', onDown);
    v.addEventListener('pointermove', onMove);
    v.addEventListener('pointerup', onUp);
    v.addEventListener('pointercancel', onUp);
    v.addEventListener('wheel', onWheel, { passive: false });
    C.dom.root.addEventListener('keydown', onKey);
    v.addEventListener('dblclick', onDbl);
    var mini = C.dom.mini,
      mv = function (e) {
        if (!(e.buttons & 1) || !C.miniT) return;
        var b = mini.getBoundingClientRect(),
          t = C.miniT,
          wx = ((e.clientX - b.left) * (mini.width / b.width) - t.ox) / t.s,
          wy = ((e.clientY - b.top) * (mini.height / b.height) - t.oy) / t.s,
          s = viewSize();
        C.view = { x: s.w / 2 - wx * C.view.k, y: s.h / 2 - wy * C.view.k, k: C.view.k };
        draw();
      };
    mini.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
      mini.setPointerCapture(e.pointerId);
      mv(e);
    });
    mini.addEventListener('pointermove', mv);
    ['dblclick', 'wheel'].forEach(function (t) {
      mini.addEventListener(t, function (e) {
        e.stopPropagation();
      });
    });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(draw).observe(v);
    if (K.tools && K.tools.bind) K.tools.bind(C.dom.root);
  }
  function pinchState() {
    var ids = Object.keys(C.ptrs);
    if (ids.length < 2) return null;
    var a = C.ptrs[ids[0]],
      b = C.ptrs[ids[1]],
      r = C.dom.view.getBoundingClientRect();
    return {
      d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      mx: (a.x + b.x) / 2 - r.left,
      my: (a.y + b.y) / 2 - r.top
    };
  }
  function onDown(e) {
    if (
      e.target.closest &&
      e.target.closest('.cv-open, .cv-play, .cv-gtoggle, a, iframe, input, textarea, select')
    )
      return;
    if (e.pointerType === 'mouse' && e.button > 1) return;
    C.dom.view.focus({ preventScroll: true });
    C.ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (Object.keys(C.ptrs).length === 2) {
      var p = pinchState();
      C.drag = {
        type: 'pinch',
        d0: p.d,
        k0: C.view.k,
        wx: (p.mx - C.view.x) / C.view.k,
        wy: (p.my - C.view.y) / C.view.k
      };
      C.dom.view.setPointerCapture(e.pointerId);
      return;
    }
    if (Object.keys(C.ptrs).length > 2) return;
    var t = e.target,
      ne = t.closest && t.closest('.cv-node'),
      eh = t.closest && t.closest('[data-e]'),
      h = t.closest && t.closest('.cv-h');
    var can = canDragNow(e),
      d = { sx: e.clientX, sy: e.clientY, moved: false, id: e.pointerId, shift: e.shiftKey };
    if (t.closest && t.closest('.cv-ed') && can && K.tools && K.tools.edgeStart) {
      d.type = 'edgenew';
      K.tools.edgeStart(d, t.closest('.cv-ed'));
    } else if (h && ne && can) {
      var n = nodeMap()[ne.getAttribute('data-id')];
      d.type = 'resize';
      d.nid = n.id;
      d.w0 = n.width;
      d.h0 = n.height;
      d.old = { x: n.x, y: n.y, width: n.width, height: n.height };
      d.snap = snap();
      if (!C.sel[n.id]) {
        selectOnly(n.id);
        syncInspector();
      }
    } else if (ne && can) {
      var id = ne.getAttribute('data-id');
      if (C.mode === 'edge') {
        onEdgeClick(id);
        return;
      }
      if (e.shiftKey) {
        if (C.sel[id]) {
          delete C.sel[id];
          d.deselected = true;
        } else C.sel[id] = 1;
        C.selEdge = null;
      } else if (!C.sel[id]) selectOnly(id);
      d.type = 'move';
      d.nid = id;
      d.snap = snap();
      d.start = C.board.nodes;
      d.roots = CL.selectionRoots(C.board.nodes, Object.keys(C.sel));
      syncInspector();
      syncBar();
      draw();
    } else if (eh && can) {
      C.sel = {};
      C.selEdge = eh.getAttribute('data-e');
      syncInspector();
      syncBar();
      draw();
      return;
    } else if (can && (e.shiftKey || C.mode === 'box') && !ne) {
      d.type = 'box';
    } else {
      d.type = 'pan';
      d.vx = C.view.x;
      d.vy = C.view.y;
      d.clear = !ne;
      d.nid = ne ? ne.getAttribute('data-id') : '';
    }
    C.drag = d;
  }
  function onEdgeClick(id) {
    var n = nodeMap()[id];
    if (!n) return;
    if (!C.pending) {
      C.pending = id;
      setStatus(T('已選第一張，請點第二張卡片。'));
      draw();
      return;
    }
    var from = C.pending;
    C.pending = null;
    addEdge(from, id);
    draw();
  }
  function onMove(e) {
    if (C.ptrs[e.pointerId]) C.ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    var d = C.drag;
    if (!d) return;
    if (d.type === 'pinch') {
      var p = pinchState();
      if (!p) return;
      var k = CL.clampK((d.k0 * p.d) / d.d0);
      C.view = { x: p.mx - d.wx * k, y: p.my - d.wy * k, k: k };
      draw();
      return;
    }
    if (d.id !== e.pointerId) return;
    var dx = e.clientX - d.sx,
      dy = e.clientY - d.sy;
    if (!d.moved) {
      if (Math.abs(dx) < THRESH && Math.abs(dy) < THRESH) return;
      d.moved = true;
      try {
        C.dom.view.setPointerCapture(e.pointerId);
      } catch (x) {
        /* 略 */
      }
      C.dom.view.classList.add('dragging');
    }
    var k = C.view.k;
    if (d.type === 'pan') {
      C.view = { x: d.vx + dx, y: d.vy + dy, k: k };
      draw();
    } else if (d.type === 'move') {
      var mv =
        K.tools && K.tools.snapMove
          ? K.tools.snapMove(d, dx / k, dy / k, e.altKey)
          : { dx: dx / k, dy: dy / k };
      C.board = Object.assign({}, C.board, { nodes: CL.moveNodes(d.start, d.roots, mv.dx, mv.dy) });
      draw();
    } else if (d.type === 'edgenew') {
      if (K.tools && K.tools.edgeMove) K.tools.edgeMove(d, e);
    } else if (d.type === 'resize') {
      var rs =
        K.tools && K.tools.snapResize
          ? K.tools.snapResize(d, d.w0 + dx / k, d.h0 + dy / k, e.altKey)
          : { w: d.w0 + dx / k, h: d.h0 + dy / k };
      C.board = Object.assign({}, C.board, { nodes: CL.resizeNode(C.board.nodes, d.nid, rs.w, rs.h) });
      draw();
    } else if (d.type === 'box') {
      var r = C.dom.view.getBoundingClientRect(),
        b = C.dom.box.style;
      b.display = 'block';
      b.left = Math.min(d.sx, e.clientX) - r.left + 'px';
      b.top = Math.min(d.sy, e.clientY) - r.top + 'px';
      b.width = Math.abs(dx) + 'px';
      b.height = Math.abs(dy) + 'px';
    }
  }
  function onUp(e) {
    delete C.ptrs[e.pointerId];
    var d = C.drag;
    if (!d) return;
    if (d.type === 'pinch') {
      if (Object.keys(C.ptrs).length < 2) C.drag = null;
      return;
    }
    if (d.id !== e.pointerId) return;
    C.drag = null;
    C.dom.view.classList.remove('dragging');
    if (K.tools && K.tools.clearGuides) K.tools.clearGuides();
    try {
      C.dom.view.releasePointerCapture(e.pointerId);
    } catch (x) {
      /* 略 */
    }
    if (d.type === 'edgenew') {
      if (K.tools && K.tools.edgeEnd) K.tools.edgeEnd(d, e);
      return;
    }
    if (d.type === 'pan') {
      if (!d.moved && d.nid && !(C.editable && canDragNow(e))) {
        focusNode(d.nid);
        return;
      }
      if (!d.moved && d.clear && (Object.keys(C.sel).length || C.selEdge)) {
        C.sel = {};
        C.selEdge = null;
        syncInspector();
        syncBar();
        draw();
      }
      return;
    }
    if (d.type === 'box') {
      C.dom.box.style.display = 'none';
      var a = toWorld(d.sx, d.sy),
        b = toWorld(e.clientX, e.clientY),
        r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
      if (d.moved) {
        var sel = {};
        eff().forEach(function (n) {
          var inside = n.x >= r.x && n.y >= r.y && n.x + n.width <= r.x + r.w && n.y + n.height <= r.y + r.h;
          if (n.type === 'group' ? inside : CL.hit(n, r)) sel[n.id] = 1;
        });
        C.sel = sel;
        C.selEdge = null;
      } else {
        C.sel = {};
        C.selEdge = null;
      }
      if (C.mode === 'box') setMode('select');
      syncInspector();
      syncBar();
      draw();
      return;
    }
    if (d.type === 'move' || d.type === 'resize') {
      if (!d.moved) {
        if (d.shift && d.deselected) {
          syncInspector();
          syncBar();
          draw();
        } else if (!d.shift && d.type === 'move' && zoomClick() && Object.keys(C.sel).length === 1)
          focusNode(d.nid);
        return;
      }
      var nodes = C.board.nodes;
      if (d.type === 'move') nodes = CL.assignParents(nodes, d.roots);
      else nodes = CL.reassignAfterResize(nodes, d.nid, d.old);
      nodes = nodes.map(function (n) {
        return Object.assign({}, n, {
          x: Math.round(n.x),
          y: Math.round(n.y),
          width: Math.round(n.width),
          height: Math.round(n.height)
        });
      });
      C.hist.push(d.snap);
      C.board = Object.assign({}, C.board, { nodes: nodes });
      markDirty();
      syncInspector();
      syncBar();
      draw();
    }
  }
  function onWheel(e) {
    e.preventDefault();
    var r = C.dom.view.getBoundingClientRect();
    var notch =
      !e.ctrlKey &&
      e.deltaX === 0 &&
      Number.isInteger(e.deltaY) &&
      Math.abs(e.deltaY) >= 50 &&
      e.deltaMode === 0; // 滑鼠滾輪的一格通常是 100 的整數倍
    if (e.ctrlKey || e.metaKey || notch || e.deltaMode === 1)
      C.view = CL.zoomAt(
        C.view,
        e.clientX - r.left,
        e.clientY - r.top,
        Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
      );
    else C.view = { x: C.view.x - e.deltaX, y: C.view.y - e.deltaY, k: C.view.k };
    draw();
  }
  function onDbl(e) {
    if (e.target.closest && e.target.closest('a, input, textarea, select, .cv-play')) return;
    var ne = e.target.closest && e.target.closest('.cv-node');
    if (ne) {
      var n = nodeMap()[ne.getAttribute('data-id')];
      if (!n) return;
      if (n.type === 'file' && noteIdOf(n)) {
        openNoteFromCanvas(noteIdOf(n));
        return;
      }
      if (C.editable && n.type === 'text') {
        selectOnly(n.id);
        syncInspector();
        draw();
        if (C.dom.ta) C.dom.ta.focus();
      }
      if (C.editable && n.type === 'group') {
        selectOnly(n.id);
        syncInspector();
        draw();
        if (C.dom.gl2) {
          C.dom.gl2.focus();
          C.dom.gl2.select();
        }
      }
      return;
    }
    /* 雙擊空白處不再新增卡片：它會和單擊放大的連點衝突，誤建空白卡片。新增請用工具列「＋文字」。 */
  }
  function onKey(e) {
    var tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
    var mod = e.ctrlKey || e.metaKey,
      key = e.key;
    if (mod && (key === 's' || key === 'S')) {
      e.preventDefault();
      save();
      return;
    }
    if (mod && (key === 'f' || key === 'F')) {
      e.preventDefault();
      C.panel = { kind: 'find', q: C.panel && C.panel.kind === 'find' ? C.panel.q : '' };
      renderPanel();
      return;
    }
    if (mod && (key === 'd' || key === 'D') && C.editable) {
      e.preventDefault();
      if (K.tools && K.tools.duplicate) K.tools.duplicate();
      return;
    }
    if (mod && (key === 'z' || key === 'Z') && C.editable) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && (key === 'y' || key === 'Y') && C.editable) {
      e.preventDefault();
      redo();
      return;
    }
    if ((key === 'Delete' || key === 'Backspace') && C.editable) {
      e.preventDefault();
      deleteSel();
      return;
    }
    if (key === 'Escape') {
      if (C.mode !== 'select') setMode('select');
      else {
        C.sel = {};
        C.selEdge = null;
        syncInspector();
        syncBar();
        draw();
      }
      return;
    }
    if (key === '+' || key === '=') {
      zoomBy(1.25);
      return;
    }
    if (key === '-' || key === '_') {
      zoomBy(1 / 1.25);
      return;
    }
    if (key === '0') {
      fit();
      return;
    }
    var step = e.shiftKey ? 200 : 60;
    if (key === 'ArrowLeft') {
      C.view = { x: C.view.x + step, y: C.view.y, k: C.view.k };
      e.preventDefault();
      draw();
    } else if (key === 'ArrowRight') {
      C.view = { x: C.view.x - step, y: C.view.y, k: C.view.k };
      e.preventDefault();
      draw();
    } else if (key === 'ArrowUp') {
      C.view = { x: C.view.x, y: C.view.y + step, k: C.view.k };
      e.preventDefault();
      draw();
    } else if (key === 'ArrowDown') {
      C.view = { x: C.view.x, y: C.view.y - step, k: C.view.k };
      e.preventDefault();
      draw();
    }
  }
  window.addEventListener('beforeunload', function (e) {
    if (C && C.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  U.openCanvas = openCanvas;
  U.renderCanvas = mount;
  U.leaveCanvas = function () {
    return !S.canvas || leave();
  };
  U.canvasDirty = function () {
    return !!(C && C.dirty);
  };
  U.reopenCanvas = function () {
    if (!C) return;
    var t = C.topic;
    C.dirty = false;
    openCanvas(t);
  };
  U.canvasState = function () {
    return C;
  }; // 測試用
  Object.assign(K, {
    C: function () {
      return C;
    },
    LOD_K: LOD_K,
    el: el,
    fillContent: fillContent,
    nodeMap: nodeMap,
    eff: eff,
    snap: snap,
    mutate: mutate,
    markDirty: markDirty,
    setStatus: setStatus,
    syncBar: syncBar,
    draw: draw,
    setMode: setMode,
    addNode: addNode,
    updateNode: updateNode,
    updateEdge: updateEdge,
    addEdge: addEdge,
    deleteSel: deleteSel,
    selectOnly: selectOnly,
    restore: restore,
    fit: fit,
    focusNode: focusNode,
    viewRect: viewRect,
    viewSize: viewSize,
    viewCenter: viewCenter,
    toWorld: toWorld,
    noteIdOf: noteIdOf,
    svgIdOf: svgIdOf,
    imgIdOf: imgIdOf,
    nodeTitle: nodeTitle,
    openNoteFromCanvas: openNoteFromCanvas,
    fetchPreviewFor: fetchPreviewFor,
    save: save,
    download: download,
    togglePanel: togglePanel,
    noteCache: function () {
      return noteCache;
    }
  });
})();
