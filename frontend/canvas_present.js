/**
 * canvas_present.js — P7c 呈現：簡報模式、匯出圖片（PNG／SVG）、群組轉大綱筆記。
 * 純函式在 canvasops.js（slideOrder／buildBoardSvg／groupOutline）；這裡只接畫面。
 * 安全：匯出的 SVG 只含矩形、文字、路徑與 data: 圖片，不含外部資源；簡報與匯出都不送任何請求（圖片卡的圖除外，走原本的讀取）。
 */
(function () {
  'use strict';
  var U = window.VaultUI,
    K = U.cv,
    CL = window.CanvasLogic,
    OP = window.CanvasOps,
    el = U.el,
    S = U.S;
  var P = null; // 簡報狀態 { c, list, i, prev, bar, label, onKey }

  /* ───── 簡報模式 ───── */
  function show(i) {
    var C = K.C();
    if (!P || C !== P.c) {
      stop();
      return;
    }
    i = Math.max(0, Math.min(P.list.length - 1, i));
    P.i = i;
    var s = P.list[i],
      vs = K.viewSize(),
      pad = 56,
      k = Math.max(
        0.05,
        Math.min((vs.w - pad * 2) / Math.max(s.width, 1), (vs.h - pad * 2) / Math.max(s.height, 1), 2.5)
      );
    C.view = { x: (vs.w - s.width * k) / 2 - s.x * k, y: (vs.h - s.height * k) / 2 - s.y * k, k: k };
    C.focus = null;
    K.draw();
    P.label.textContent = i + 1 + ' / ' + P.list.length;
    P.prevBtn.disabled = i === 0;
    P.nextBtn.disabled = i === P.list.length - 1;
  }
  function start() {
    var C = K.C();
    if (!C || P) return;
    var list = OP.slideOrder(C.board.nodes);
    if (!list.length) {
      K.setStatus(T('畫布是空的，沒有可簡報的內容。'));
      return;
    }
    C.sel = {};
    C.selEdge = null;
    if (C.mode !== 'select') K.setMode('select');
    P = { c: C, list: list, i: 0, prev: C.view };
    P.prevBtn = el('button', {
      type: 'button',
      class: 'tbtn',
      id: 'pres-prev',
      text: T('← 上一頁'),
      onclick: function () {
        show(P.i - 1);
      }
    });
    P.nextBtn = el('button', {
      type: 'button',
      class: 'tbtn',
      id: 'pres-next',
      text: T('下一頁 →'),
      onclick: function () {
        show(P.i + 1);
      }
    });
    P.label = el('span', { class: 'cv-pres-n', id: 'pres-n', role: 'status' });
    P.bar = el('div', { class: 'cv-pres', role: 'toolbar', 'aria-label': T('簡報') }, [
      P.prevBtn,
      P.label,
      P.nextBtn,
      el('button', { type: 'button', class: 'tbtn', id: 'pres-exit', text: T('離開（Esc）'), onclick: stop })
    ]);
    C.dom.root.classList.add('cv-presenting');
    C.dom.root.appendChild(P.bar);
    P.onKey = function (e) {
      if (!P) return;
      var k = e.key;
      if (k === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        stop();
      } else if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        show(P.i + 1);
      } else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        show(P.i - 1);
      } else if (k === 'Home') {
        e.preventDefault();
        show(0);
      } else if (k === 'End') {
        e.preventDefault();
        show(P.list.length - 1);
      }
    };
    document.addEventListener('keydown', P.onKey, true);
    show(0);
    P.nextBtn.focus();
  }
  function stop() {
    if (!P) return;
    var p = P;
    P = null;
    document.removeEventListener('keydown', p.onKey, true);
    if (p.bar.parentNode) p.bar.parentNode.removeChild(p.bar);
    var C = K.C();
    if (C === p.c && C.dom && C.dom.root) {
      C.dom.root.classList.remove('cv-presenting');
      C.view = p.prev;
      K.draw();
    }
  }

  /* ───── 匯出圖片 ───── */
  function selectedOrAll() {
    var C = K.C(),
      ids = Object.keys(C.sel || {}),
      nodes = C.board.nodes,
      set = {};
    if (!ids.length) return { nodes: nodes, edges: C.board.edges, part: false };
    ids.forEach(function (id) {
      set[id] = 1;
      CL.descendants(nodes, id).forEach(function (d) {
        set[d] = 1;
      });
    });
    var ns = nodes.filter(function (n) {
      return set[n.id];
    });
    return {
      nodes: ns,
      edges: C.board.edges.filter(function (e) {
        return set[e.fromNode] && set[e.toNode];
      }),
      part: true
    };
  }
  function infoFor(imgs) {
    return function (n) {
      if (n.type === 'text') return { body: OP.plainText(n.text) };
      if (n.type === 'link') {
        var pv = CL.effPreview(CL.safeUrl(n.url), n['x-preview']);
        return { title: (pv && pv.title) || n.url, body: (pv && pv.description) || n.url };
      }
      if (n.type === 'file') {
        var iid = K.imgIdOf(n);
        if (iid) return { img: imgs[iid] || null, title: imgs[iid] ? '' : K.nodeTitle(n) };
        var nid = K.noteIdOf(n),
          c = nid && K.noteCache()[nid];
        return {
          title: K.nodeTitle(n),
          body: c && c.state === 'ok' ? OP.plainText(c.body).slice(0, 400) : ''
        };
      }
      return {};
    };
  }
  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    try {
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      /* 被擋時無法下載 */
    }
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 4000);
  }
  function exportImage(kind) {
    var C = K.C();
    if (!C) return;
    var sel = selectedOrAll();
    if (!sel.nodes.length) {
      K.setStatus(T('畫布是空的，沒有可匯出的內容。'));
      return;
    }
    K.setStatus(T('產生圖片中…'));
    var imgs = {},
      want = sel.nodes.map(K.imgIdOf).filter(Boolean);
    Promise.all(
      want.map(function (id) {
        return U.imgGet(id).then(function (d) {
          imgs[id] = d;
        });
      })
    ).then(function () {
      var r = OP.buildBoardSvg(sel.nodes, sel.edges, infoFor(imgs)),
        base = C.topic + (sel.part ? '-selection' : '');
      if (!r) return;
      if (kind === 'svg') {
        saveBlob(new Blob([r.svg], { type: 'image/svg+xml' }), base + '.svg');
        K.setStatus(T('已嘗試下載「{1}」。', base + '.svg'));
        return;
      }
      var sc = Math.min(2, 4096 / Math.max(r.width, r.height));
      while (r.width * r.height * sc * sc > 40e6 && sc > 0.1) sc *= 0.8;
      var im = new Image();
      im.onload = function () {
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(r.width * sc));
        cv.height = Math.max(1, Math.round(r.height * sc));
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(im, 0, 0, cv.width, cv.height);
        cv.toBlob(function (b) {
          if (!b) {
            K.setStatus(T('圖片太大，無法產生 PNG；請改匯出 SVG，或只選取一部分。'));
            return;
          }
          saveBlob(b, base + '.png');
          K.setStatus(T('已嘗試下載「{1}」。', base + '.png'));
        }, 'image/png');
      };
      im.onerror = function () {
        K.setStatus(T('無法產生 PNG；請改匯出 SVG。'));
      };
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.svg);
    });
  }

  /* ───── 群組轉大綱筆記 ───── */
  function outline(gid) {
    var C = K.C();
    if (!C || !C.editable) return;
    var g = C.board.nodes.filter(function (n) {
      return n.id === gid;
    })[0];
    if (!g) return;
    var text = OP.groupOutline(C.board.nodes, gid, function (n) {
      if (n.type === 'text') return OP.plainText(n.text).trim().split('\n').slice(0, 8).join('\n');
      if (n.type === 'link') {
        var u = CL.safeUrl(n.url);
        return u
          ? '[' +
              String((CL.effPreview(u, n['x-preview']) || {}).title || u).replace(/[\[\]\n]/g, ' ') +
              '](' +
              u +
              ')'
          : '';
      }
      if (n.type === 'file') {
        var nid = K.noteIdOf(n),
          sid = K.svgIdOf(n);
        return nid ? '[[' + nid + ']]' : sid ? '![](assets/' + sid + '.svg)' : '';
      }
      return '';
    });
    if (!U.openEditor || !U.leaveCanvas()) return;
    U.openEditor(
      null,
      {
        title: String(g.label || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 80),
        topic: C.topic
      },
      text
    );
  }

  K.pres = { start: start, stop: stop, exportImage: exportImage, outline: outline };
})();
