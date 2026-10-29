/**
 * canvasops.js — P7 的畫布純函式（不碰畫面、不連網），全部有單元測試。
 *   對齊吸附（snapLines／snapMove／snapResize）、對齊與等距（alignNodes）、
 *   複製貼上（copyFragment／parseFragment／pasteFragment）、畫布內搜尋（searchNodes）。
 * 輸入的 board 一律不改動，回傳新物件。
 */
var CanvasOps = (function () {
  'use strict';
  var CL = typeof CanvasLogic !== 'undefined' ? CanvasLogic : require('./canvaslogic.js');
  var MAX_PASTE = 500,
    MAX_TEXT = 20000;

  /* ───── 對齊吸附 ───── */
  /** 由「不會被移動的卡片」算出可吸附的線：每張卡片的左、中、右（x）與上、中、下（y）。 */
  function snapLines(nodes) {
    var xs = [],
      ys = [];
    nodes.forEach(function (n) {
      var x2 = n.x + n.width,
        y2 = n.y + n.height;
      [n.x, n.x + n.width / 2, x2].forEach(function (v) {
        xs.push({ v: v, a: n.y, b: y2 });
      });
      [n.y, n.y + n.height / 2, y2].forEach(function (v) {
        ys.push({ v: v, a: n.x, b: x2 });
      });
    });
    return { xs: xs, ys: ys };
  }
  /** 在 cands（被拖的框上的幾個位置）與 lines 之間找最近、且在 tol 以內的一組，回傳要補的位移。 */
  function nearest(cands, lines, tol) {
    var best = null;
    cands.forEach(function (c) {
      lines.forEach(function (l) {
        var d = l.v - c;
        if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best))) best = d;
      });
    });
    return best;
  }
  /** 吸附後畫出的對齊線：所有與框上位置重合的線，長度涵蓋框與對方卡片。 */
  function guides(box, lines) {
    var gx = [],
      gy = [],
      seen = {};
    [box.x, box.x + box.w / 2, box.x + box.w].forEach(function (c) {
      lines.xs.forEach(function (l) {
        if (Math.abs(l.v - c) > 0.5) return;
        var k = 'x' + Math.round(l.v),
          a = Math.min(l.a, box.y),
          b = Math.max(l.b, box.y + box.h);
        if (seen[k]) {
          seen[k].y1 = Math.min(seen[k].y1, a);
          seen[k].y2 = Math.max(seen[k].y2, b);
          return;
        }
        seen[k] = { x: l.v, y1: a, y2: b };
        gx.push(seen[k]);
      });
    });
    [box.y, box.y + box.h / 2, box.y + box.h].forEach(function (c) {
      lines.ys.forEach(function (l) {
        if (Math.abs(l.v - c) > 0.5) return;
        var k = 'y' + Math.round(l.v),
          a = Math.min(l.a, box.x),
          b = Math.max(l.b, box.x + box.w);
        if (seen[k]) {
          seen[k].x1 = Math.min(seen[k].x1, a);
          seen[k].x2 = Math.max(seen[k].x2, b);
          return;
        }
        seen[k] = { y: l.v, x1: a, x2: b };
        gy.push(seen[k]);
      });
    });
    return { gx: gx, gy: gy };
  }
  /** 拖曳：box 是被拖的卡片（含群組成員）原始外框，dx、dy 是滑鼠位移（世界座標）。 */
  function snapMove(box, lines, dx, dy, tol) {
    var b = { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h };
    var ax = nearest([b.x, b.x + b.w / 2, b.x + b.w], lines.xs, tol),
      ay = nearest([b.y, b.y + b.h / 2, b.y + b.h], lines.ys, tol);
    if (ax !== null) {
      dx += ax;
      b.x += ax;
    }
    if (ay !== null) {
      dy += ay;
      b.y += ay;
    }
    var g = guides(b, lines);
    return { dx: dx, dy: dy, gx: g.gx, gy: g.gy };
  }
  /** 調整大小：只吸附右邊與下邊。 */
  function snapResize(box, lines, w, h, tol) {
    var ax = nearest([box.x + w], lines.xs, tol),
      ay = nearest([box.y + h], lines.ys, tol);
    if (ax !== null) w += ax;
    if (ay !== null) h += ay;
    var b = { x: box.x, y: box.y, w: w, h: h },
      g = guides(b, {
        xs: lines.xs.filter(function (l) {
          return Math.abs(l.v - (b.x + w)) <= 0.5;
        }),
        ys: lines.ys.filter(function (l) {
          return Math.abs(l.v - (b.y + h)) <= 0.5;
        })
      });
    return { w: w, h: h, gx: g.gx, gy: g.gy };
  }

  /* ───── 對齊、等距 ───── */
  var ALIGN = ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom', 'hdist', 'vdist'];
  /**
   * 依選取對齊或平均分佈。只移動「根」（祖先沒被一起選的卡片），群組帶著成員走；完成後依位置重新判斷群組歸屬。
   * 對齊需要 2 張以上，等距需要 3 張以上；不足時原樣回傳。
   */
  function alignNodes(nodes, ids, mode) {
    var map = CL.byId(nodes),
      roots = CL.selectionRoots(nodes, ids).filter(function (id) {
        return map[id];
      });
    var need = mode === 'hdist' || mode === 'vdist' ? 3 : 2;
    if (ALIGN.indexOf(mode) < 0 || roots.length < need) return nodes;
    var rs = roots.map(function (id) {
        return map[id];
      }),
      bb = CL.bounds(rs),
      moves = {};
    if (mode === 'hdist' || mode === 'vdist') {
      var hz = mode === 'hdist',
        pos = hz ? 'x' : 'y',
        len = hz ? 'width' : 'height';
      var sorted = rs.slice().sort(function (a, b) {
        return a[pos] + a[len] / 2 - (b[pos] + b[len] / 2);
      });
      var first = sorted[0],
        last = sorted[sorted.length - 1];
      var span = last[pos] + last[len] - first[pos],
        sum = 0;
      sorted.forEach(function (n) {
        sum += n[len];
      });
      var gap = (span - sum) / (sorted.length - 1),
        at = first[pos];
      sorted.forEach(function (n) {
        moves[n.id] = hz ? { dx: at - n.x, dy: 0 } : { dx: 0, dy: at - n.y };
        at += n[len] + gap;
      });
    } else {
      rs.forEach(function (n) {
        var dx = 0,
          dy = 0;
        if (mode === 'left') dx = bb.x - n.x;
        else if (mode === 'right') dx = bb.x + bb.w - (n.x + n.width);
        else if (mode === 'hcenter') dx = bb.x + bb.w / 2 - (n.x + n.width / 2);
        else if (mode === 'top') dy = bb.y - n.y;
        else if (mode === 'bottom') dy = bb.y + bb.h - (n.y + n.height);
        else dy = bb.y + bb.h / 2 - (n.y + n.height / 2);
        moves[n.id] = { dx: dx, dy: dy };
      });
    }
    var out = nodes;
    roots.forEach(function (id) {
      var m = moves[id];
      if (m && (m.dx || m.dy)) out = CL.moveNodes(out, [id], m.dx, m.dy);
    });
    out = CL.assignParents(out, roots);
    return out.map(function (n) {
      return n.x % 1 || n.y % 1 ? Object.assign({}, n, { x: Math.round(n.x), y: Math.round(n.y) }) : n;
    });
  }

  /* ───── 複製、貼上 ───── */
  /** 選取的卡片（群組連同所有成員）＋兩端都在其中的連線。回傳可序列化的 JSON Canvas 片段。 */
  function copyFragment(board, ids) {
    var set = {};
    ids.forEach(function (id) {
      set[id] = 1;
      CL.descendants(board.nodes, id).forEach(function (d) {
        set[d] = 1;
      });
    });
    var nodes = board.nodes
      .filter(function (n) {
        return set[n.id];
      })
      .map(function (n) {
        var m = CL.clone(n);
        if (m['x-parent'] && !set[m['x-parent']]) delete m['x-parent'];
        return m;
      });
    var edges = board.edges
      .filter(function (e) {
        return set[e.fromNode] && set[e.toNode];
      })
      .map(CL.clone);
    return { nodes: nodes, edges: edges };
  }
  /** 剪貼簿文字 → 片段。JSON Canvas（自己或 Obsidian 複製的）照用；單一網址變連結卡；其他文字變文字卡。空白回傳 null。 */
  function parseFragment(text) {
    var s = String(text == null ? '' : text);
    if (!s.trim()) return null;
    if (/^\s*\{/.test(s)) {
      try {
        var o = JSON.parse(s);
        if (o && typeof o === 'object' && !Array.isArray(o) && Array.isArray(o.nodes)) {
          var b = CL.normalize({
            nodes: o.nodes.slice(0, MAX_PASTE),
            edges: Array.isArray(o.edges) ? o.edges : []
          });
          b.nodes = b.nodes
            .filter(function (n) {
              return ['text', 'file', 'link', 'group'].indexOf(n.type) >= 0;
            })
            .filter(function (n) {
              if (n.type === 'link') return !!CL.safeUrl(n.url); // 只收 http／https 網址
              if (n.type === 'file')
                return /^(notes\/\d{8}-[a-z0-9]{2,8}\.md|assets\/\d{8}-[a-z0-9]{2,8}\.(svg|img))$/.test(
                  String(n.file || '')
                ); // 只收筆記與 SVG 的標準路徑
              if (n.type === 'text') return typeof n.text === 'string';
              return true;
            })
            .map(function (n) {
              if (n.type === 'link') {
                var m = Object.assign({}, n, { url: CL.safeUrl(n.url) });
                var pv = CL.safePreview(n['x-preview']);
                if (pv) m['x-preview'] = pv;
                else delete m['x-preview'];
                return m;
              }
              var m2 = n;
              if (n.type === 'text' && n.text.length > MAX_TEXT)
                m2 = Object.assign({}, m2, { text: n.text.slice(0, MAX_TEXT) });
              if (m2['x-fontsize'] !== undefined && FONT_SIZES.indexOf(m2['x-fontsize']) < 0) {
                m2 = Object.assign({}, m2);
                delete m2['x-fontsize'];
              }
              return m2;
            });
          return b.nodes.length ? { nodes: b.nodes, edges: b.edges } : null;
        }
      } catch (e) {
        /* 不是 JSON，當成一般文字 */
      }
    }
    var t = s.trim(),
      u = /\s/.test(t) ? null : CL.safeUrl(t),
      d = CL.DEF[u ? 'link' : 'text'];
    var n = u
      ? { id: 'p', type: 'link', url: u, x: 0, y: 0, width: d[0], height: d[1] }
      : { id: 'p', type: 'text', text: s.slice(0, MAX_TEXT), x: 0, y: 0, width: d[0], height: d[1] };
    return { nodes: [n], edges: [] };
  }
  /**
   * 把片段貼進畫布：全部換成新 id（卡片、連線），x-parent 只保留片段內的；片段整體移到 at（左上角）。
   * 貼上後頂層卡片依位置歸屬到畫布上的群組。回傳 { board, ids }。
   */
  function pasteFragment(board, frag, at) {
    var f = CL.normalize(frag || {}),
      taken = {},
      idMap = {};
    board.nodes.forEach(function (n) {
      taken[n.id] = 1;
    });
    var src = f.nodes.slice(0, MAX_PASTE);
    src.forEach(function (n) {
      var id = CL.newId(taken);
      taken[id] = 1;
      idMap[n.id] = id;
    });
    var bb = CL.bounds(src),
      dx = at && bb ? Math.round(at.x - bb.x) : 0,
      dy = at && bb ? Math.round(at.y - bb.y) : 0;
    var nodes = src.map(function (n) {
      var m = CL.clone(n);
      m.id = idMap[n.id];
      m.x = Math.round(n.x + dx);
      m.y = Math.round(n.y + dy);
      m.width = Math.round(n.width);
      m.height = Math.round(n.height);
      if (m['x-parent']) {
        if (idMap[m['x-parent']]) m['x-parent'] = idMap[m['x-parent']];
        else delete m['x-parent'];
      }
      return m;
    });
    nodes = CL.fixParents(nodes);
    var eTaken = {};
    board.edges.forEach(function (e) {
      eTaken[e.id] = 1;
    });
    var edges = f.edges
      .filter(function (e) {
        return idMap[e.fromNode] && idMap[e.toNode] && e.fromNode !== e.toNode;
      })
      .map(function (e) {
        var m = CL.clone(e);
        m.id = CL.newId(eTaken);
        eTaken[m.id] = 1;
        m.fromNode = idMap[e.fromNode];
        m.toNode = idMap[e.toNode];
        return m;
      });
    var all = board.nodes.concat(nodes),
      roots = nodes
        .filter(function (n) {
          return !n['x-parent'];
        })
        .map(function (n) {
          return n.id;
        });
    all = CL.assignParents(all, roots);
    return {
      board: Object.assign({}, board, { nodes: all, edges: board.edges.concat(edges) }),
      ids: nodes.map(function (n) {
        return n.id;
      })
    };
  }

  /* ───── 搜尋 ───── */
  /** 依 text(n) 回傳的文字比對（不分大小寫，每個關鍵字都要出現）。結果依閱讀順序（由上而下、由左而右）。 */
  function searchNodes(nodes, q, text) {
    var words = String(q || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) return [];
    return nodes
      .filter(function (n) {
        var s = String(text(n) || '').toLowerCase();
        return words.every(function (w) {
          return s.indexOf(w) >= 0;
        });
      })
      .sort(function (a, b) {
        return Math.round(a.y / 40) - Math.round(b.y / 40) || a.x - b.x;
      })
      .map(function (n) {
        return n.id;
      });
  }

  /* ───── 邊緣拉線（P7b）：從卡片的某一邊拉出新卡片或連到既有卡片 ───── */
  var OPP = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  function oppositeSide(side) {
    return OPP[side] || 'top';
  }
  /** 卡片 n 的 side 邊外側緊鄰處放一張 size 大小的新卡片的左上角（間距 gap），與 n 置中對齊。 */
  function adjacentPos(n, side, size, gap) {
    gap = gap == null ? 80 : gap;
    if (side === 'right')
      return { x: Math.round(n.x + n.width + gap), y: Math.round(n.y + n.height / 2 - size[1] / 2) };
    if (side === 'left')
      return { x: Math.round(n.x - gap - size[0]), y: Math.round(n.y + n.height / 2 - size[1] / 2) };
    if (side === 'top')
      return { x: Math.round(n.x + n.width / 2 - size[0] / 2), y: Math.round(n.y - gap - size[1]) };
    return { x: Math.round(n.x + n.width / 2 - size[0] / 2), y: Math.round(n.y + n.height + gap) };
  }
  /** 拖曳放開的點離哪一邊最近（相對卡片中心的主要方向）；用來決定新卡片那一端接哪一邊。 */
  function sideToward(n, px, py) {
    var dx = px - (n.x + n.width / 2),
      dy = py - (n.y + n.height / 2);
    return Math.abs(dx) * n.height > Math.abs(dy) * n.width
      ? dx > 0
        ? 'right'
        : 'left'
      : dy > 0
        ? 'bottom'
        : 'top';
  }

  /* ───── 文字大小（P7b） ───── */
  var FONT_SIZES = ['s', 'm', 'l', 'xl'];
  function fontSizeOf(n) {
    var v = n && n['x-fontsize'];
    return FONT_SIZES.indexOf(v) >= 0 ? v : 'm';
  }

  /* ───── 手繪（P7b）：筆跡 → SVG ───── */
  /** 移除距離太近的點（省檔案大小），一定保留頭尾。 */
  function thinPoints(pts, minDist) {
    if (pts.length <= 2) return pts.slice();
    var out = [pts[0]],
      last = pts[0],
      m2 = minDist * minDist;
    for (var i = 1; i < pts.length - 1; i++) {
      var dx = pts[i][0] - last[0],
        dy = pts[i][1] - last[1];
      if (dx * dx + dy * dy >= m2) {
        out.push(pts[i]);
        last = pts[i];
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function n1(v) {
    return Math.round(v * 10) / 10;
  }
  /** 點列 → 平滑的 SVG path（相鄰點中點之間用二次曲線）。單點畫成一個小圓點。 */
  function strokePath(pts) {
    if (!pts.length) return '';
    if (pts.length === 1) return 'M' + n1(pts[0][0]) + ' ' + n1(pts[0][1]) + 'l0.01 0';
    var d = 'M' + n1(pts[0][0]) + ' ' + n1(pts[0][1]);
    if (pts.length === 2) return d + 'L' + n1(pts[1][0]) + ' ' + n1(pts[1][1]);
    for (var i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i][0] + pts[i + 1][0]) / 2,
        my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += 'Q' + n1(pts[i][0]) + ' ' + n1(pts[i][1]) + ' ' + n1(mx) + ' ' + n1(my);
    }
    var l = pts[pts.length - 1];
    return d + 'L' + n1(l[0]) + ' ' + n1(l[1]);
  }
  var PEN_COLORS = ['#1f1f1f', '#d64545', '#e8833a', '#e0b100', '#3f9b5a', '#2f7fb8', '#7a5bbf'];
  /**
   * strokes：[{ pts:[[x,y]…], color:'#rrggbb', w:線寬, op:透明度 0~1 }]。裁成筆跡範圍加邊距，可選白底。
   * 回傳 { svg, width, height }（width／height 是建議的卡片大小，最長邊 ≤ maxSide）；沒有筆跡回傳 null。顏色只收預設色盤與 #rrggbb。
   */
  function buildDrawingSvg(strokes, opts) {
    opts = opts || {};
    var pad = opts.pad == null ? 16 : opts.pad,
      maxSide = opts.maxSide || 640;
    var ss = (strokes || []).filter(function (s) {
      return s && s.pts && s.pts.length;
    });
    if (!ss.length) return null;
    var x1 = Infinity,
      y1 = Infinity,
      x2 = -Infinity,
      y2 = -Infinity;
    ss.forEach(function (s) {
      var h = Math.max(1, Math.min(40, Number(s.w) || 3)) / 2;
      s.pts.forEach(function (p) {
        x1 = Math.min(x1, p[0] - h);
        y1 = Math.min(y1, p[1] - h);
        x2 = Math.max(x2, p[0] + h);
        y2 = Math.max(y2, p[1] + h);
      });
    });
    x1 = Math.floor(x1 - pad);
    y1 = Math.floor(y1 - pad);
    x2 = Math.ceil(x2 + pad);
    y2 = Math.ceil(y2 + pad);
    var w = Math.max(x2 - x1, 40),
      h2 = Math.max(y2 - y1, 40),
      body = [];
    if (opts.bg)
      body.push(
        '<rect x="' +
          x1 +
          '" y="' +
          y1 +
          '" width="' +
          w +
          '" height="' +
          h2 +
          '" fill="' +
          (/^#[0-9a-fA-F]{6}$/.test(opts.bg) ? opts.bg : '#ffffff') +
          '"/>'
      );
    ss.forEach(function (s) {
      var col = /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : PEN_COLORS[0],
        lw = Math.max(1, Math.min(40, Number(s.w) || 3)),
        op = Math.max(0.1, Math.min(1, Number(s.op) || 1));
      body.push(
        '<path d="' +
          strokePath(thinPoints(s.pts, 1.5)) +
          '" fill="none" stroke="' +
          col +
          '" stroke-width="' +
          n1(lw) +
          '" stroke-linecap="round" stroke-linejoin="round"' +
          (op < 1 ? ' stroke-opacity="' + n1(op * 100) / 100 + '"' : '') +
          '/>'
      );
    });
    var sc = Math.min(1, maxSide / Math.max(w, h2));
    return {
      svg:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
        x1 +
        ' ' +
        y1 +
        ' ' +
        w +
        ' ' +
        h2 +
        '">' +
        body.join('') +
        '</svg>',
      width: Math.max(120, Math.round(w * sc)),
      height: Math.max(80, Math.round(h2 * sc))
    };
  }
  /** 橡皮擦：回傳「被 (x,y) 半徑 r 內碰到」的最上面一筆的索引，沒有回傳 -1。 */
  function strokeAt(strokes, x, y, r) {
    for (var i = strokes.length - 1; i >= 0; i--) {
      var s = strokes[i],
        rr = r + (s.w || 3) / 2,
        p = s.pts;
      for (var j = 0; j < p.length; j++) {
        if (
          Math.abs(p[j][0] - x) <= rr &&
          Math.abs(p[j][1] - y) <= rr &&
          Math.hypot(p[j][0] - x, p[j][1] - y) <= rr
        )
          return i;
        if (j > 0) {
          var ax = p[j - 1][0],
            ay = p[j - 1][1],
            bx = p[j][0],
            by = p[j][1],
            dx = bx - ax,
            dy = by - ay,
            L = dx * dx + dy * dy,
            t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
          if (Math.hypot(ax + t * dx - x, ay + t * dy - y) <= rr) return i;
        }
      }
    }
    return -1;
  }

  /* ───── 簡報、匯出圖片、群組轉大綱（P7c） ───── */
  function reading(a, b) {
    return a.y - b.y || a.x - b.x;
  }
  /** 簡報順序：有群組就一個群組一頁（最外層群組，由上到下、左到右）；沒有群組就逐張卡片。回傳 [{ id, x, y, width, height }]。 */
  function slideOrder(nodes) {
    var top = nodes.filter(function (n) {
      return !n['x-parent'];
    });
    var groups = top.filter(function (n) {
      return n.type === 'group';
    });
    var base = groups.length ? groups : top;
    return base
      .slice()
      .sort(reading)
      .map(function (n) {
        return { id: n.id, x: n.x, y: n.y, width: n.width, height: n.height };
      });
  }
  /** 去掉 Markdown 記號，只留可讀文字（匯出圖片用；不執行、不渲染任何內容）。 */
  function plainText(s) {
    return String(s || '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[\[([^\]]*)\]\]/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '• ')
      .replace(/[*_`~]/g, '')
      .replace(/\r/g, '');
  }
  /** 群組 → Markdown 大綱：內容依位置（上到下、左到右）排成清單，子群組縮排。不含任何連結以外的外部內容。 */
  function groupOutline(nodes, gid, titleOf) {
    var g = nodes.filter(function (n) {
      return n.id === gid;
    })[0];
    if (!g) return '';
    var lines = [
      '# ' +
        String(g.label || '')
          .replace(/\s+/g, ' ')
          .trim()
    ];
    function walk(pid, depth) {
      nodes
        .filter(function (n) {
          return n['x-parent'] === pid;
        })
        .sort(reading)
        .forEach(function (n) {
          var pad = new Array(depth + 1).join('  ');
          if (n.type === 'group') {
            lines.push(
              pad +
                '- **' +
                String(n.label || '')
                  .replace(/\s+/g, ' ')
                  .trim() +
                '**'
            );
            walk(n.id, depth + 1);
            return;
          }
          var t = String(titleOf(n) || '')
            .split('\n')
            .map(function (x) {
              return x.trim();
            })
            .filter(Boolean);
          if (!t.length) return;
          lines.push(pad + '- ' + t[0]);
          t.slice(1).forEach(function (x) {
            lines.push(pad + '  ' + x);
          });
        });
    }
    walk(gid, 0);
    return lines.join('\n') + '\n';
  }
  function xmlEsc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function charW(ch, px) {
    return /[⺀-鿿＀-￯　-〿]/.test(ch) ? px : px * 0.56;
  }
  /** 依寬度折行（中文每字一格、英數約 0.56 格）；超過 maxLines 以「…」收尾。 */
  function wrapText(text, widthPx, px, maxLines) {
    var out = [];
    String(text)
      .split('\n')
      .forEach(function (para) {
        var cur = '',
          w = 0;
        for (var i = 0; i < para.length; i++) {
          var c = para.charAt(i),
            cw = charW(c, px);
          if (w + cw > widthPx && cur) {
            out.push(cur);
            cur = '';
            w = 0;
          }
          cur += c;
          w += cw;
        }
        out.push(cur);
      });
    if (out.length > maxLines) {
      out = out.slice(0, maxLines);
      out[maxLines - 1] = out[maxLines - 1].replace(/.?$/, '…');
    }
    return out;
  }
  /**
   * 畫布 → 獨立的 SVG（白底、固定配色；只有 <rect>/<text>/<path>/<image>，沒有 script、沒有外部資源）。
   * info(n) 回傳 { title, body, img }：img 只能是 data:image/(png|jpeg|webp) 網址。回傳 { svg, width, height }；沒有卡片回傳 null。
   */
  function buildBoardSvg(nodes, edges, info) {
    var bb = CL.bounds(nodes);
    if (!bb) return null;
    var pad = 40,
      ox = bb.x - pad,
      oy = bb.y - pad,
      W = Math.round(bb.w + pad * 2),
      H = Math.round(bb.h + pad * 2),
      map = {};
    nodes.forEach(function (n) {
      map[n.id] = n;
    });
    var o = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
        W +
        '" height="' +
        H +
        '" viewBox="' +
        ox +
        ' ' +
        oy +
        ' ' +
        W +
        ' ' +
        H +
        '" font-family="system-ui,\'Noto Sans TC\',sans-serif">',
      '<rect x="' + ox + '" y="' + oy + '" width="' + W + '" height="' + H + '" fill="#ffffff"/>'
    ];
    nodes
      .filter(function (n) {
        return n.type === 'group';
      })
      .forEach(function (n) {
        var c = CL.colorOf(n.color) || '#9aa0a6';
        o.push(
          '<rect x="' +
            n.x +
            '" y="' +
            n.y +
            '" width="' +
            n.width +
            '" height="' +
            n.height +
            '" rx="12" fill="' +
            c +
            '" fill-opacity="0.08" stroke="' +
            c +
            '" stroke-opacity="0.6"/>'
        );
        o.push(
          '<text x="' +
            (n.x + 14) +
            '" y="' +
            (n.y + 26) +
            '" font-size="18" font-weight="600" fill="#333">' +
            xmlEsc(String(n.label || '').slice(0, 80)) +
            '</text>'
        );
      });
    edges.forEach(function (e) {
      var a = map[e.fromNode],
        b = map[e.toNode];
      if (!a || !b) return;
      var g = CL.edgeGeom(a, b, e),
        col = CL.colorOf(e.color) || '#80868b',
        ends = CL.edgeEnds(e);
      o.push(
        '<path d="' +
          g.d +
          '" fill="none" stroke="' +
          col +
          '" stroke-width="2"' +
          (e['x-style'] === 'dashed' ? ' stroke-dasharray="8 6"' : '') +
          '/>'
      );
      if (ends.to === 'arrow')
        o.push('<polygon points="' + CL.arrowPoints(g.p2, g.c2, 12) + '" fill="' + col + '"/>');
      if (ends.from === 'arrow')
        o.push('<polygon points="' + CL.arrowPoints(g.p1, g.c1, 12) + '" fill="' + col + '"/>');
      if (e.label) {
        var lp = CL.labelPoint(g, e),
          px = CL.LABEL_PX[CL.labelSizeOf(e)];
        o.push(
          '<text x="' +
            lp.x.toFixed(1) +
            '" y="' +
            lp.y.toFixed(1) +
            '" font-size="' +
            px +
            '" text-anchor="middle" dominant-baseline="middle" fill="#222" stroke="#fff" stroke-width="5" paint-order="stroke">' +
            xmlEsc(String(e.label).slice(0, 60)) +
            '</text>'
        );
      }
    });
    nodes
      .filter(function (n) {
        return n.type !== 'group';
      })
      .forEach(function (n) {
        var c = CL.colorOf(n.color) || '#c4c7c5',
          inf = info(n) || {};
        o.push(
          '<rect x="' +
            n.x +
            '" y="' +
            n.y +
            '" width="' +
            n.width +
            '" height="' +
            n.height +
            '" rx="8" fill="#ffffff" stroke="' +
            c +
            '" stroke-width="2"/>'
        );
        if (inf.img && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/]+={0,2}$/.test(inf.img)) {
          o.push(
            '<image x="' +
              (n.x + 4) +
              '" y="' +
              (n.y + 4) +
              '" width="' +
              (n.width - 8) +
              '" height="' +
              (n.height - 8) +
              '" preserveAspectRatio="xMidYMid meet" href="' +
              inf.img +
              '"/>'
          );
          return;
        }
        var px = 16,
          y = n.y + 28,
          lines = [];
        if (inf.title)
          (o.push(
            '<text x="' +
              (n.x + 12) +
              '" y="' +
              y +
              '" font-size="17" font-weight="600" fill="#222">' +
              xmlEsc(wrapText(inf.title, n.width - 24, 17, 2)[0]) +
              '</text>'
          ),
            (y += 24));
        lines = wrapText(
          inf.body || '',
          n.width - 24,
          px,
          Math.max(1, Math.floor((n.y + n.height - y - 6) / 22))
        );
        if (inf.body)
          lines.forEach(function (ln, i) {
            o.push(
              '<text x="' +
                (n.x + 12) +
                '" y="' +
                (y + i * 22) +
                '" font-size="' +
                px +
                '" fill="#333">' +
                xmlEsc(ln) +
                '</text>'
            );
          });
      });
    o.push('</svg>');
    return { svg: o.join(''), width: W, height: H };
  }

  return {
    slideOrder: slideOrder,
    plainText: plainText,
    groupOutline: groupOutline,
    wrapText: wrapText,
    buildBoardSvg: buildBoardSvg,
    snapLines: snapLines,
    snapMove: snapMove,
    snapResize: snapResize,
    ALIGN: ALIGN,
    alignNodes: alignNodes,
    copyFragment: copyFragment,
    parseFragment: parseFragment,
    pasteFragment: pasteFragment,
    searchNodes: searchNodes,
    MAX_PASTE: MAX_PASTE,
    oppositeSide: oppositeSide,
    adjacentPos: adjacentPos,
    sideToward: sideToward,
    FONT_SIZES: FONT_SIZES,
    fontSizeOf: fontSizeOf,
    thinPoints: thinPoints,
    strokePath: strokePath,
    PEN_COLORS: PEN_COLORS,
    buildDrawingSvg: buildDrawingSvg,
    strokeAt: strokeAt
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CanvasOps;
