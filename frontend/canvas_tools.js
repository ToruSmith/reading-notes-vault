/**
 * canvas_tools.js — P7a 畫布工具：對齊線與吸附、對齊／等距、複製貼上（Ctrl+C／X／V／D）、畫布內搜尋（Ctrl+F）。
 * 幾何與資料處理都在 canvasops.js（純函式、有單元測試），這裡只接畫面與鍵盤。
 * 效能：吸附只在拖曳開始時算一次「畫面內」卡片的對齊線；搜尋輸入有 120 ms 延遲；沒用到的功能不建立任何 DOM。
 * 安全：貼上的內容與「匯入」同等對待（全部換新 id、網址只收 http／https、卡片內容一律安全渲染），只有可編輯者能貼上。
 */
(function () {
  'use strict';
  var U = window.VaultUI,
    K = U.cv,
    CL = window.CanvasLogic,
    OP = window.CanvasOps,
    el = U.el,
    S = U.S;
  var SNAP_PX = 6,
    OFFSET = 24;
  var lastCopy = '',
    pasteN = 0;

  /* ───── 對齊吸附 ───── */
  function snapOn() {
    try {
      return localStorage.getItem('vault-cvsnap') !== '0';
    } catch (e) {
      return true;
    }
  }
  function toggleSnap() {
    var on = !snapOn();
    try {
      localStorage.setItem('vault-cvsnap', on ? '1' : '0');
    } catch (e) {
      /* 略 */
    }
    var C = K.C(),
      b = C && C.dom && C.dom.snapBtn;
    if (b) b.textContent = on ? T('對齊吸附：開') : T('對齊吸附：關');
    K.setStatus(on ? T('已開啟對齊吸附（拖曳時按住 Alt 可暫時停用）。') : T('已關閉對齊吸附。'));
  }
  /** 拖曳開始時（第一次移動）準備一次：被拖的外框、畫面內其他卡片的對齊線。 */
  function prep(d) {
    if (d.lines) return;
    var C = K.C(),
      src = d.start || C.board.nodes,
      moved = {};
    if (d.type === 'move')
      d.roots.forEach(function (id) {
        moved[id] = 1;
        CL.descendants(src, id).forEach(function (x) {
          moved[x] = 1;
        });
      });
    else moved[d.nid] = 1;
    var r = K.viewRect(0);
    d.lines = OP.snapLines(
      K.eff().filter(function (n) {
        return !moved[n.id] && CL.hit(n, r);
      })
    );
    d.box0 = CL.bounds(
      src.filter(function (n) {
        return moved[n.id];
      })
    );
  }
  function snapMove(d, dx, dy, alt) {
    if (alt || !snapOn()) {
      clearGuides();
      return { dx: dx, dy: dy };
    }
    prep(d);
    if (!d.box0) return { dx: dx, dy: dy };
    var r = OP.snapMove(d.box0, d.lines, dx, dy, SNAP_PX / K.C().view.k);
    showGuides(r);
    return r;
  }
  function snapResize(d, w, h, alt) {
    if (alt || !snapOn()) {
      clearGuides();
      return { w: w, h: h };
    }
    prep(d);
    if (!d.box0) return { w: w, h: h };
    var r = OP.snapResize(d.box0, d.lines, w, h, SNAP_PX / K.C().view.k);
    showGuides(r);
    return r;
  }
  function guideLayer() {
    var d = K.C().dom;
    if (!d.guides || d.guides.parentNode !== d.world) {
      d.guides = el('div', { class: 'cv-guides', 'aria-hidden': 'true' });
      d.world.appendChild(d.guides);
    }
    return d.guides;
  }
  function showGuides(r) {
    if (!r.gx.length && !r.gy.length) {
      clearGuides();
      return;
    }
    var g = guideLayer();
    g.textContent = '';
    r.gx.forEach(function (l) {
      var e = el('div', { class: 'cv-guide v' });
      e.style.left = l.x + 'px';
      e.style.top = l.y1 + 'px';
      e.style.height = l.y2 - l.y1 + 'px';
      g.appendChild(e);
    });
    r.gy.forEach(function (l) {
      var e = el('div', { class: 'cv-guide h' });
      e.style.top = l.y + 'px';
      e.style.left = l.x1 + 'px';
      e.style.width = l.x2 - l.x1 + 'px';
      g.appendChild(e);
    });
  }
  function clearGuides() {
    var C = K.C();
    if (C && C.dom && C.dom.guides) C.dom.guides.textContent = '';
  }

  /* ───── 對齊、等距 ───── */
  function align(mode) {
    var C = K.C();
    if (!C || !C.editable) return;
    var ids = Object.keys(C.sel),
      before = C.board.nodes,
      after = OP.alignNodes(before, ids, mode);
    if (after === before) {
      K.setStatus(/dist$/.test(mode) ? T('等距需要選取 3 張以上卡片。') : T('對齊需要選取 2 張以上卡片。'));
      return;
    }
    K.mutate(function (b) {
      return Object.assign({}, b, { nodes: after });
    });
    K.setStatus(T('已排列 {1} 張卡片。不滿意可按「復原」。', ids.length));
  }

  /* ───── 複製、貼上 ───── */
  function selFragment() {
    var C = K.C(),
      ids = Object.keys(C.sel);
    return ids.length ? OP.copyFragment(C.board, ids) : null;
  }
  function placeAndSelect(frag, at, verb) {
    var C = K.C(),
      res = OP.pasteFragment(C.board, frag, at);
    if (!res.ids.length) return;
    K.mutate(function () {
      return res.board;
    });
    C.sel = {};
    CL.selectionRoots(res.board.nodes, res.ids).forEach(function (id) {
      C.sel[id] = 1;
    });
    C.selEdge = null;
    K.syncBar();
    K.syncInspector();
    K.draw();
    K.setStatus(T('{1} {2} 張卡片。按「儲存」才會寫入。', verb, res.ids.length));
  }
  function duplicate() {
    var C = K.C(),
      f = selFragment();
    if (!f || !C.editable) {
      K.setStatus(T('請先選取要複製的卡片。'));
      return;
    }
    var bb = CL.bounds(f.nodes);
    placeAndSelect(f, { x: bb.x + OFFSET, y: bb.y + OFFSET }, T('已複製'));
  }
  function busyTarget(e) {
    var t = e.target && e.target.tagName;
    return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT';
  }
  function onCopy(e, cut) {
    var C = K.C();
    if (!C || busyTarget(e)) return;
    var f = selFragment();
    if (!f) return;
    var text = JSON.stringify(f);
    lastCopy = text;
    pasteN = 0;
    try {
      e.clipboardData.setData('text/plain', text);
      e.preventDefault();
    } catch (x) {
      /* 沒有剪貼簿時只留在本頁 */
    }
    if (cut && C.editable) {
      K.deleteSel();
      K.setStatus(T('已剪下 {1} 張卡片。', f.nodes.length));
    } else K.setStatus(T('已複製 {1} 張卡片（可貼到其他畫布或 Obsidian）。', f.nodes.length));
  }

  /* ───── 圖片卡（P7b-2）：選檔／貼上／拖放 → 縮到最長邊 1600 px、轉 WebP → 上傳 → 放一張圖片卡 ───── */
  var IMG_MAX = 1600,
    IMG_OK = /^image\/(png|jpeg|webp)$/;
  function shrinkImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file),
        im = new Image();
      im.onload = function () {
        var w = im.naturalWidth,
          h = im.naturalHeight,
          sc = Math.min(1, IMG_MAX / Math.max(w, h)),
          cw = Math.max(1, Math.round(w * sc)),
          ch = Math.max(1, Math.round(h * sc));
        var cv = document.createElement('canvas');
        cv.width = cw;
        cv.height = ch;
        cv.getContext('2d').drawImage(im, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        cv.toBlob(
          function (b) {
            if (!b) {
              reject(new Error(T('無法處理這張圖片')));
              return;
            }
            var fr = new FileReader();
            fr.onload = function () {
              resolve({ data: String(fr.result), width: cw, height: ch });
            };
            fr.onerror = function () {
              reject(new Error(T('無法處理這張圖片')));
            };
            fr.readAsDataURL(b);
          },
          'image/webp',
          0.86
        );
      };
      im.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error(T('無法讀取這個圖片檔')));
      };
      im.src = url;
    });
  }
  function addImageFile(file, at) {
    var C = K.C();
    if (!C || !C.editable) return;
    if (!IMG_OK.test(file.type || '')) {
      K.setStatus(T('只支援 PNG、JPG、WebP 圖片。'));
      return;
    }
    var topic = C.topic;
    K.setStatus(T('處理圖片中…'));
    shrinkImage(file)
      .then(function (o) {
        if (!/^data:image\/(png|jpeg|webp);base64,/.test(o.data)) throw new Error(T('無法處理這張圖片'));
        return U.api('uploadImage', { data: o.data }).then(function (r) {
          var C2 = K.C();
          if (!C2 || C2.topic !== topic) return;
          if (!r.ok) {
            K.setStatus(T('圖片上傳失敗：{1}', T.all(r.reasons || [r.error]).join(T('；'))));
            return;
          }
          var sc = Math.min(1, 480 / Math.max(o.width, o.height)),
            size = [Math.max(80, Math.round(o.width * sc)), Math.max(60, Math.round(o.height * sc))];
          K.addNode('file', { file: 'assets/' + r.id + '.img' }, at, size);
          var kb = Math.round(r.bytes / 1024);
          K.setStatus(
            (r.warnings && r.warnings.length
              ? T('圖片已加入（{1} KB）。', kb) + ' ' + r.warnings.join(' ')
              : T('圖片已加入（{1} KB）。', kb)) +
              ' ' +
              T('記得按「儲存」。')
          );
        });
      })
      .catch(function (e) {
        K.setStatus(T('圖片處理失敗：{1}', e.message));
      });
  }
  function pickImage() {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/png,image/jpeg,image/webp';
    inp.multiple = true;
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = function () {
      if (inp.parentNode) inp.parentNode.removeChild(inp);
      Array.prototype.forEach.call(inp.files || [], function (f, i) {
        var c = K.viewCenter();
        addImageFile(f, { x: c.x + i * 30, y: c.y + i * 30 });
      });
    };
    inp.click();
  }
  function imageFilesOf(dt) {
    return dt && dt.files
      ? Array.prototype.filter.call(dt.files, function (f) {
          return IMG_OK.test(f.type || '');
        })
      : [];
  }
  function onPaste(e) {
    var C = K.C();
    if (!C || !C.editable || busyTarget(e)) return;
    var imgs = imageFilesOf(e.clipboardData);
    if (imgs.length) {
      e.preventDefault();
      imgs.forEach(function (f, i) {
        var c = K.viewCenter();
        addImageFile(f, { x: c.x + i * 30, y: c.y + i * 30 });
      });
      return;
    }
    var text = '';
    try {
      text = e.clipboardData.getData('text/plain');
    } catch (x) {
      text = lastCopy;
    }
    var frag = OP.parseFragment(text);
    if (!frag) return;
    e.preventDefault();
    var bb = CL.bounds(frag.nodes),
      at;
    if (text === lastCopy && CL.hit({ x: bb.x, y: bb.y, width: bb.w, height: bb.h }, K.viewRect(0))) {
      pasteN++;
      at = { x: bb.x + OFFSET * pasteN, y: bb.y + OFFSET * pasteN };
    } // 原處還看得到：錯開貼上
    else {
      var c = K.viewCenter();
      at = { x: c.x - bb.w / 2, y: c.y - bb.h / 2 };
    } // 否則貼到畫面中央
    placeAndSelect(frag, at, T('已貼上'));
  }
  function bind(root) {
    root.addEventListener('copy', function (e) {
      onCopy(e, false);
    });
    root.addEventListener('cut', function (e) {
      onCopy(e, true);
    });
    root.addEventListener('paste', onPaste);
    root.addEventListener('dragover', function (e) {
      var C = K.C();
      if (
        C &&
        C.editable &&
        e.dataTransfer &&
        Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0
      )
        e.preventDefault();
    });
    root.addEventListener('drop', function (e) {
      var C = K.C();
      if (!C || !C.editable) return;
      var htmls = K.embed
        ? Array.prototype.filter.call((e.dataTransfer && e.dataTransfer.files) || [], K.embed.htmlOk)
        : [];
      var imgs = imageFilesOf(e.dataTransfer);
      if (!imgs.length && !htmls.length) return;
      e.preventDefault();
      var p = K.toWorld(e.clientX, e.clientY);
      htmls.forEach(function (f, i) {
        K.embed.addHtmlFile(f, { x: p.x + i * 30, y: p.y + i * 30 });
      });
      imgs.forEach(function (f, i) {
        addImageFile(f, { x: p.x + i * 30, y: p.y + i * 30 });
      });
    });
  }

  /* ───── 畫布內搜尋 ───── */
  function nodeText(n) {
    if (n.type === 'text') return n.text;
    if (n.type === 'group') return n.label;
    if (n.type === 'link') {
      var pv = CL.effPreview(CL.safeUrl(n.url), n['x-preview']);
      return [n.url, pv && pv.title, pv && pv.description].join(' ');
    }
    var id = K.noteIdOf(n),
      it = id && S.byId[id],
      c = id && K.noteCache()[id];
    return [
      K.nodeTitle(n),
      it ? (it.tags || []).join(' ') : '',
      c && c.state === 'ok' ? c.body : '',
      n.file
    ].join(' ');
  }
  function runFind(p) {
    var C = K.C(),
      ids = OP.searchNodes(C.board.nodes, p.q, nodeText);
    p.ids = ids;
    p.i = ids.length ? 0 : -1;
    p.lastQ = p.q;
    C.hits = {};
    ids.forEach(function (id) {
      C.hits[id] = 1;
    });
    show(p);
  }
  /** 移到第 i 個結果；卡片在收合的群組裡就移到最外層的收合群組。 */
  function show(p) {
    var C = K.C(),
      id = p.i >= 0 ? p.ids[p.i] : null;
    C.hitCur = id;
    if (p.count)
      p.count.textContent = p.ids.length
        ? T('{1} / {2}', p.i + 1, p.ids.length)
        : String(p.q || '').trim()
          ? T('找不到')
          : '';
    if (!id) {
      K.draw();
      return;
    }
    var map = K.nodeMap(),
      n = map[id],
      target = n;
    CL.ancestors(map, n).forEach(function (a) {
      if (map[a]['x-collapsed'] === true) target = map[a];
    });
    if (target !== n) K.setStatus(T('這張卡片在收合的群組「{1}」裡。', target.label || ''));
    var s = K.viewSize(),
      pad = 60,
      w = target === n ? n.width : CL.COLL.w,
      h = target === n ? n.height : CL.COLL.h;
    var k = Math.max(0.3, Math.min((s.w - pad * 2) / Math.max(w, 1), (s.h - pad * 2) / Math.max(h, 1), 1.2));
    C.view = { x: (s.w - w * k) / 2 - target.x * k, y: (s.h - h * k) / 2 - target.y * k, k: k };
    C.focus = null;
    K.draw();
  }
  function step(p, by) {
    if (!p.ids || !p.ids.length) return;
    p.i = (p.i + by + p.ids.length) % p.ids.length;
    show(p);
  }
  function findPanel(p) {
    var C = K.C(),
      timer = 0;
    var inp = el('input', {
      type: 'search',
      class: 'in',
      id: 'cv-find',
      placeholder: T('找卡片：標題、文字、標籤、網址、群組名'),
      'aria-label': T('在畫布上搜尋'),
      value: p.q || ''
    });
    p.count = el('span', { class: 'sub cv-findn', role: 'status', 'aria-live': 'polite' });
    var close = function () {
      C.hits = null;
      C.hitCur = null;
      C.panel = null;
      K.draw();
      K.renderPanel();
      C.dom.view.focus({ preventScroll: true });
    };
    inp.addEventListener('input', function () {
      p.q = inp.value;
      clearTimeout(timer);
      timer = setTimeout(function () {
        runFind(p);
      }, 120);
    });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        clearTimeout(timer);
        if (p.lastQ !== p.q) runFind(p);
        else step(p, e.shiftKey ? -1 : 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        step(p, -1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    });
    setTimeout(function () {
      inp.focus();
      inp.select();
      if (p.q) runFind(p);
    }, 0);
    return el('div', { class: 'panel cv-panel cv-find' }, [
      el('div', { class: 'row' }, [
        inp,
        p.count,
        el('button', {
          type: 'button',
          class: 'tbtn cv-b',
          title: T('上一個（↑）'),
          'aria-label': T('上一個'),
          text: '↑',
          onclick: function () {
            step(p, -1);
          }
        }),
        el('button', {
          type: 'button',
          class: 'tbtn cv-b',
          title: T('下一個（Enter）'),
          'aria-label': T('下一個'),
          text: '↓',
          onclick: function () {
            step(p, 1);
          }
        }),
        el('button', { type: 'button', class: 'linkbtn', text: T('關閉'), onclick: close })
      ])
    ]);
  }

  /* ───── 多選時屬性欄的快速排列 ───── */
  function alignRow(n) {
    var b = function (m, label, need) {
      return el('button', {
        type: 'button',
        class: 'tbtn cv-b',
        'data-align': m,
        text: label,
        disabled: n < need ? 'disabled' : false,
        onclick: function () {
          align(m);
        }
      });
    };
    return el('div', { class: 'cv-alignrow', role: 'group', 'aria-label': T('排列') }, [
      b('left', T('靠左'), 2),
      b('hcenter', T('水平置中'), 2),
      b('right', T('靠右'), 2),
      b('top', T('靠上'), 2),
      b('vcenter', T('垂直置中'), 2),
      b('bottom', T('靠下'), 2),
      b('hdist', T('水平等距'), 3),
      b('vdist', T('垂直等距'), 3)
    ]);
  }

  /* ───── 邊緣拉線（P7b）：選一張卡片，四邊出現小圓點；點一下＝旁邊長出新卡片並連線，拖到別張卡片＝連線，拖到空白處＝在那裡長出新卡片並連線 ───── */
  var SIDE_OF = {
    'cv-ed-top': 'top',
    'cv-ed-right': 'right',
    'cv-ed-bottom': 'bottom',
    'cv-ed-left': 'left'
  };
  function decorate(e, n) {
    // 每次繪製時呼叫：只有「唯一被選取的非群組卡片」才有圓點，離開選取就移除
    var C = K.C(),
      want = !!(
        C.editable &&
        n.type !== 'group' &&
        C.sel[n.id] &&
        C.mode === 'select' &&
        Object.keys(C.sel).length === 1 &&
        !C.selEdge
      );
    if (want && !e._ed) {
      e._ed = ['top', 'right', 'bottom', 'left'].map(function (sd) {
        var h = el('div', {
          class: 'cv-ed cv-ed-' + sd,
          title: T('拖曳到空白處新增卡片，拖到另一張卡片就連線（點一下＝在旁邊新增）'),
          'aria-hidden': 'true'
        });
        e.appendChild(h);
        return h;
      });
    } else if (!want && e._ed) {
      e._ed.forEach(function (h) {
        if (h.parentNode) h.parentNode.removeChild(h);
      });
      e._ed = null;
    }
  }
  function sideOfHandle(h) {
    for (var k in SIDE_OF) if (h.classList.contains(k)) return SIDE_OF[k];
    return 'right';
  }
  function edgeStart(d, h) {
    d.side = sideOfHandle(h);
    d.from = K.nodeMap()[h.closest('.cv-node').getAttribute('data-id')];
  }
  function rubber(d, p) {
    var C = K.C(),
      w = C.dom.world;
    if (!d.rub) {
      d.rub = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      d.rub.setAttribute('class', 'cv-rubber');
      d.line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      d.rub.appendChild(d.line);
      w.appendChild(d.rub);
    }
    var a = CL.center(d.from);
    var sx = d.side === 'right' ? d.from.x + d.from.width : d.side === 'left' ? d.from.x : a.x,
      sy = d.side === 'bottom' ? d.from.y + d.from.height : d.side === 'top' ? d.from.y : a.y;
    d.line.setAttribute('x1', sx);
    d.line.setAttribute('y1', sy);
    d.line.setAttribute('x2', p.x);
    d.line.setAttribute('y2', p.y);
  }
  function edgeMove(d, e) {
    if (d.from) rubber(d, K.toWorld(e.clientX, e.clientY));
  }
  function dropTarget(e, from) {
    var el2 = document.elementFromPoint(e.clientX, e.clientY),
      ne = el2 && el2.closest && el2.closest('.cv-node');
    if (!ne) return null;
    var n = K.nodeMap()[ne.getAttribute('data-id')];
    return n && n.id !== from.id ? n : null;
  }
  function edgeEnd(d, e) {
    var C = K.C();
    if (d.rub && d.rub.parentNode) d.rub.parentNode.removeChild(d.rub);
    if (!d.from || !C.editable) return;
    var from = K.nodeMap()[d.from.id];
    if (!from) return;
    var p = K.toWorld(e.clientX, e.clientY),
      target = d.moved ? dropTarget(e, from) : null,
      def = CL.DEF.text,
      taken = {},
      eTaken = {};
    C.board.nodes.forEach(function (n) {
      taken[n.id] = 1;
    });
    C.board.edges.forEach(function (x) {
      eTaken[x.id] = 1;
    });
    var edge = {
        id: CL.newId(eTaken),
        fromNode: from.id,
        toNode: '',
        fromSide: d.side,
        fromEnd: 'none',
        toEnd: 'arrow'
      },
      add = null;
    if (target) {
      if (
        C.board.edges.some(function (x) {
          return x.fromNode === from.id && x.toNode === target.id;
        })
      ) {
        K.setStatus(T('這兩張卡片之間已經有連線。'));
        return;
      }
      edge.toNode = target.id;
      edge.toSide = OP.sideToward(target, CL.center(from).x, CL.center(from).y);
    } else {
      var pos = d.moved
        ? { x: Math.round(p.x - def[0] / 2), y: Math.round(p.y - def[1] / 2) }
        : OP.adjacentPos(from, d.side, def, 80);
      add = {
        id: CL.newId(taken),
        type: 'text',
        text: '',
        x: pos.x,
        y: pos.y,
        width: def[0],
        height: def[1]
      };
      var c = CL.center(add),
        g = CL.smallestGroupAt(C.board.nodes, c.x, c.y, null, null);
      if (g) add['x-parent'] = g.id;
      edge.toNode = add.id;
      edge.toSide = OP.sideToward(add, CL.center(from).x, CL.center(from).y);
    }
    K.mutate(function (b) {
      return Object.assign({}, b, {
        nodes: add ? b.nodes.concat([add]) : b.nodes,
        edges: b.edges.concat([edge])
      });
    }); // 一步完成，復原一次就全部還原
    C.sel = {};
    C.selEdge = null;
    if (add) {
      C.sel[add.id] = 1;
      K.syncBar();
      K.syncInspector();
      K.draw();
      if (C.dom.ta) C.dom.ta.focus();
      K.setStatus(T('已新增卡片並連線。直接輸入內容；按「儲存」才會寫入。'));
    } else {
      C.selEdge = edge.id;
      K.syncBar();
      K.syncInspector();
      K.draw();
      K.setStatus(T('已建立連線。可在右側設定名稱、顏色、線型。'));
    }
  }

  /* ───── 手繪（P7b）：畫在一塊小畫板上，完成後存成 SVG 圖片卡（走既有的 SVG 檢查與公開規則） ───── */
  var PAD_W = 720,
    PAD_H = 360,
    PEN_W = [2, 4, 8];
  function drawPanel(p, close) {
    var C = K.C();
    p.strokes = p.strokes || [];
    p.tool = p.tool || 'pen';
    p.color = p.color || OP.PEN_COLORS[0];
    p.size = p.size == null ? 1 : p.size;
    if (p.bg === undefined) p.bg = true;
    var NS = 'http://www.w3.org/2000/svg',
      pad = document.createElementNS(NS, 'svg'),
      cur = null,
      erasing = false;
    pad.setAttribute('class', 'cv-drawpad');
    pad.setAttribute('viewBox', '0 0 ' + PAD_W + ' ' + PAD_H);
    pad.setAttribute('role', 'img');
    pad.setAttribute('aria-label', T('手繪畫板'));
    var gl = document.createElementNS(NS, 'g');
    pad.appendChild(gl);
    function paths() {
      gl.textContent = '';
      p.strokes.forEach(function (st) {
        var pa = document.createElementNS(NS, 'path');
        pa.setAttribute('d', OP.strokePath(st.pts));
        pa.setAttribute('fill', 'none');
        pa.setAttribute('stroke', st.color);
        pa.setAttribute('stroke-width', st.w);
        pa.setAttribute('stroke-linecap', 'round');
        pa.setAttribute('stroke-linejoin', 'round');
        if (st.op < 1) pa.setAttribute('stroke-opacity', st.op);
        gl.appendChild(pa);
      });
      cnt.textContent = T('{1} 筆', p.strokes.length);
      undoB.disabled = !p.strokes.length;
      doneB.disabled = !p.strokes.length || !!p.busy;
    }
    function pt(e) {
      var r = pad.getBoundingClientRect();
      return [
        Math.max(0, Math.min(PAD_W, ((e.clientX - r.left) * PAD_W) / r.width)),
        Math.max(0, Math.min(PAD_H, ((e.clientY - r.top) * PAD_H) / r.height))
      ];
    }
    function erase(e) {
      var q = pt(e),
        i = OP.strokeAt(p.strokes, q[0], q[1], 8);
      if (i >= 0) {
        p.strokes.splice(i, 1);
        paths();
      }
    }
    pad.addEventListener('pointerdown', function (e) {
      if (e.button > 0 || p.busy) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        pad.setPointerCapture(e.pointerId);
      } catch (x) {
        /* 略 */
      }
      if (p.tool === 'erase') {
        erasing = true;
        erase(e);
        return;
      }
      var hl = p.tool === 'hl';
      cur = { pts: [pt(e)], color: p.color, w: PEN_W[p.size] * (hl ? 4 : 1), op: hl ? 0.35 : 1 };
      p.strokes.push(cur);
      paths();
    });
    pad.addEventListener('pointermove', function (e) {
      if (erasing) {
        erase(e);
        return;
      }
      if (!cur) return;
      e.preventDefault();
      var q = pt(e),
        l = cur.pts[cur.pts.length - 1];
      if (Math.abs(q[0] - l[0]) + Math.abs(q[1] - l[1]) < 1) return;
      cur.pts.push(q);
      var last = gl.lastChild;
      if (last) last.setAttribute('d', OP.strokePath(cur.pts));
    });
    var end = function () {
      cur = null;
      erasing = false;
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    var cnt = el('span', { class: 'sub', role: 'status' });
    var undoB = el('button', {
      type: 'button',
      class: 'tbtn cv-b',
      text: T('上一筆'),
      title: T('取消最後一筆'),
      onclick: function () {
        p.strokes.pop();
        paths();
      }
    });
    var doneB = el('button', {
      type: 'button',
      class: 'tbtn cv-b primary',
      id: 'cv-draw-ok',
      text: p.busy ? T('處理中…') : T('完成並放進畫布'),
      onclick: function () {
        var r = OP.buildDrawingSvg(p.strokes, { bg: p.bg ? '#ffffff' : null });
        if (!r) return;
        p.busy = true;
        doneB.disabled = true;
        K.setStatus(T('儲存圖片中…'));
        U.api('uploadSvg', { text: r.svg })
          .then(function (res) {
            if (K.C() !== C) return;
            p.busy = false;
            if (!res.ok) {
              K.setStatus(T('圖片儲存失敗：{1}', T(res.error || '未知錯誤')));
              paths();
              return;
            }
            K.addNode('file', { file: 'assets/' + res.id + '.svg' }, null, [r.width, r.height]);
            C.panel = null;
            K.renderPanel();
            K.setStatus(T('已放進畫布。按「儲存」才會寫入畫布。'));
          })
          .catch(function (x) {
            if (K.C() === C) {
              p.busy = false;
              K.setStatus(T('圖片儲存失敗：{1}', x.message));
              paths();
            }
          });
      }
    });
    var tools = [
      ['pen', T('畫筆')],
      ['hl', T('螢光筆')],
      ['erase', T('橡皮擦')]
    ].map(function (o) {
      return el('button', {
        type: 'button',
        class: 'tbtn cv-b' + (p.tool === o[0] ? ' on' : ''),
        'aria-pressed': p.tool === o[0] ? 'true' : 'false',
        'data-tool': o[0],
        text: o[1],
        onclick: function () {
          p.tool = o[0];
          K.renderPanel();
        }
      });
    });
    var sw = OP.PEN_COLORS.map(function (c) {
      var b = el('button', {
        type: 'button',
        class: 'cv-pen' + (p.color === c ? ' on' : ''),
        title: c,
        'aria-label': T('顏色 {1}', c),
        'aria-pressed': p.color === c ? 'true' : 'false',
        onclick: function () {
          p.color = c;
          if (p.tool === 'erase') p.tool = 'pen';
          K.renderPanel();
        }
      });
      b.style.background = c;
      return b;
    });
    var size = el(
      'select',
      { class: 'in', 'aria-label': T('筆的粗細') },
      [
        [0, T('細')],
        [1, T('中')],
        [2, T('粗')]
      ].map(function (o) {
        return el('option', { value: String(o[0]), text: o[1] });
      })
    );
    size.value = String(p.size);
    size.addEventListener('change', function () {
      p.size = Number(size.value);
    });
    var bg = el('input', { type: 'checkbox', id: 'cv-draw-bg' });
    bg.checked = !!p.bg;
    bg.addEventListener('change', function () {
      p.bg = bg.checked;
    });
    paths();
    return el('div', { class: 'panel cv-panel cv-draw' }, [
      el('h3', { text: T('手繪') }),
      pad,
      el('div', { class: 'cv-drawbar' }, tools.concat(sw, [size])),
      el('div', { class: 'cv-drawbar' }, [
        bg,
        el('label', { for: 'cv-draw-bg', text: T('白色底（深色佈景主題下也看得清楚）') }),
        cnt,
        undoB,
        el('button', {
          type: 'button',
          class: 'tbtn cv-b',
          text: T('全部清除'),
          onclick: function () {
            p.strokes = [];
            paths();
          }
        }),
        doneB,
        close
      ])
    ]);
  }

  K.snapOn = snapOn;
  K.extraPanels = { find: findPanel, draw: drawPanel };
  K.tools = {
    pickImage: pickImage,
    addImageFile: addImageFile,
    snapMove: snapMove,
    snapResize: snapResize,
    clearGuides: clearGuides,
    toggleSnap: toggleSnap,
    align: align,
    duplicate: duplicate,
    bind: bind,
    alignRow: alignRow,
    decorate: decorate,
    edgeStart: edgeStart,
    edgeMove: edgeMove,
    edgeEnd: edgeEnd
  };
})();
