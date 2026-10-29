/**
 * canvaslogic.js — 畫布純邏輯（不碰 DOM，可在 node 測試）
 * 幾何、群組歸屬、連線路徑、復原重做、三方合併、JSON Canvas 檢查。
 *
 * 資料原則（規劃書 4.4、D7）：
 *  - 節點、連線一律「不可變更新」：改一個欄位就產生一個新物件，其他欄位（含 x- 自訂欄位與不認得的欄位）原樣帶著走。
 *  - 只有明確要改的欄位會被動到；寫回時整份物件照舊輸出，所以未知欄位不會遺失。
 */
var CanvasLogic = (function () {
  'use strict';
  /** 翻譯（介面層有載入 T 時用 T；node 測試環境直接填入參數）。 */
  var Tr = function (k) {
    var a = arguments;
    if (typeof T === 'function') return T.apply(null, a);
    return k.replace(/\{(\d+)\}/g, function (m, n) {
      return a[+n] === undefined ? '' : a[+n];
    });
  };
  var PRESET = {
    1: 'var(--c1)',
    2: 'var(--c2)',
    3: 'var(--c3)',
    4: 'var(--c4)',
    5: 'var(--c5)',
    6: 'var(--c6)'
  }; // Obsidian 6 色編號；實際顏色由主題的 --c1~--c6 決定（P3）
  var COLL = { w: 220, h: 56 };
  var DEF = { text: [260, 120], file: [260, 170], link: [400, 225], group: [420, 300] };
  var SIDES = ['top', 'right', 'bottom', 'left'];
  var NORMAL = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }
  function stable(o) {
    if (o === null || typeof o !== 'object') return JSON.stringify(o);
    if (Array.isArray(o)) return '[' + o.map(stable).join(',') + ']';
    return (
      '{' +
      Object.keys(o)
        .sort()
        .filter(function (k) {
          return o[k] !== undefined;
        })
        .map(function (k) {
          return JSON.stringify(k) + ':' + stable(o[k]);
        })
        .join(',') +
      '}'
    );
  }
  function same(a, b) {
    return stable(a) === stable(b);
  }
  function num(v, d) {
    return typeof v === 'number' && isFinite(v) ? v : d;
  }

  /* ───── 讀入 ───── */
  function parse(text) {
    var b = JSON.parse(text);
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error(Tr('畫布必須是 JSON 物件'));
    return normalize(b);
  }
  /** 補齊 nodes、edges 陣列與缺漏的座標數字；其餘欄位不動。 */
  function normalize(b) {
    var out = Object.assign({}, b);
    out.nodes = (Array.isArray(b.nodes) ? b.nodes : [])
      .filter(function (n) {
        return n && typeof n === 'object' && typeof n.id === 'string';
      })
      .map(function (n) {
        var d = DEF[n.type] || DEF.text,
          m = Object.assign({}, n);
        if (typeof m.x !== 'number' || !isFinite(m.x)) m.x = 0;
        if (typeof m.y !== 'number' || !isFinite(m.y)) m.y = 0;
        if (typeof m.width !== 'number' || !isFinite(m.width) || m.width <= 0) m.width = d[0];
        if (typeof m.height !== 'number' || !isFinite(m.height) || m.height <= 0) m.height = d[1];
        return m;
      });
    out.edges = (Array.isArray(b.edges) ? b.edges : []).filter(function (e) {
      return e && typeof e === 'object' && typeof e.id === 'string';
    });
    return out;
  }

  /* ───── 顏色、連結 ───── */
  function colorOf(c) {
    if (typeof c !== 'string') return null;
    if (PRESET[c]) return PRESET[c];
    return /^#[0-9a-fA-F]{6}$/.test(c) ? c : null;
  }
  function safeUrl(u) {
    return /^https?:\/\/[^\s<>"']+$/i.test(String(u || '').trim()) ? String(u).trim() : null;
  }
  function youtubeId(url) {
    var u = String(url || '').trim();
    var m =
      /^https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})(?:[&#]|$)/.exec(
        u
      ) ||
      /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})(?:[?&#\/]|$)/.exec(u) ||
      /^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})(?:[?&#\/]|$)/.exec(
        u
      ) ||
      /^https?:\/\/(?:www\.)?youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]{11})(?:[?&#\/]|$)/.exec(u);
    return m ? m[1] : null;
  }
  function hostOf(url) {
    var m = /^https?:\/\/([^\/?#]+)/i.exec(String(url || ''));
    return m ? m[1] : '';
  }

  function newId(taken) {
    for (var tries = 0; tries < 50; tries++) {
      var s = '';
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        var a = new Uint8Array(8);
        crypto.getRandomValues(a);
        for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
      } else for (var j = 0; j < 16; j++) s += Math.floor(Math.random() * 16).toString(16);
      if (!taken || !taken[s]) return s;
    }
    throw new Error(Tr('無法產生不重複的 id'));
  }

  /* ───── 索引 ───── */
  function byId(arr) {
    var m = {};
    arr.forEach(function (n) {
      m[n.id] = n;
    });
    return m;
  }
  function childrenIndex(nodes) {
    var m = {};
    nodes.forEach(function (n) {
      var p = n['x-parent'];
      if (p) (m[p] = m[p] || []).push(n.id);
    });
    return m;
  }
  function descendants(nodes, id) {
    var ci = childrenIndex(nodes),
      out = [],
      seen = {},
      q = [id];
    seen[id] = 1;
    while (q.length) {
      var c = q.shift();
      (ci[c] || []).forEach(function (k) {
        if (!seen[k]) {
          seen[k] = 1;
          out.push(k);
          q.push(k);
        }
      });
    }
    return out;
  }
  function ancestors(map, n) {
    var out = [],
      seen = {},
      p = n['x-parent'];
    while (p && map[p] && !seen[p]) {
      seen[p] = 1;
      out.push(p);
      p = map[p]['x-parent'];
    }
    return out;
  }
  function center(n) {
    return { x: n.x + n.width / 2, y: n.y + n.height / 2 };
  }
  function vcenter(n) {
    return n.type === 'group' && n['x-collapsed'] === true
      ? { x: n.x + COLL.w / 2, y: n.y + COLL.h / 2 }
      : center(n);
  } // 收合的群組以小方塊的中心計
  function area(n) {
    return n.width * n.height;
  }
  function inRect(n, px, py) {
    return px >= n.x && px <= n.x + n.width && py >= n.y && py <= n.y + n.height;
  }
  function hit(a, r) {
    return a.x < r.x + r.w && a.x + a.width > r.x && a.y < r.y + r.h && a.y + a.height > r.y;
  }
  function visibleNodes(nodes, r) {
    var out = [];
    nodes.forEach(function (n) {
      if (hit(n, r)) out.push(n.id);
    });
    return out;
  }

  /** 畫圖順序：群組在最底（大的先畫），其餘照陣列順序。 */
  function drawOrder(nodes) {
    var g = nodes
      .filter(function (n) {
        return n.type === 'group';
      })
      .sort(function (a, b) {
        return area(b) - area(a);
      });
    return g.concat(
      nodes.filter(function (n) {
        return n.type !== 'group';
      })
    );
  }
  function bounds(nodes) {
    if (!nodes.length) return null;
    var x1 = Infinity,
      y1 = Infinity,
      x2 = -Infinity,
      y2 = -Infinity;
    nodes.forEach(function (n) {
      x1 = Math.min(x1, n.x);
      y1 = Math.min(y1, n.y);
      x2 = Math.max(x2, n.x + n.width);
      y2 = Math.max(y2, n.y + n.height);
    });
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  /* ───── 檢視座標 ───── */
  var K_MIN = 0.1,
    K_MAX = 2.5;
  function clampK(k) {
    return Math.max(K_MIN, Math.min(K_MAX, k));
  }
  function zoomAt(v, sx, sy, factor) {
    var k = clampK(v.k * factor),
      wx = (sx - v.x) / v.k,
      wy = (sy - v.y) / v.k;
    return { x: sx - wx * k, y: sy - wy * k, k: k };
  }
  function fitView(nodes, vw, vh, pad) {
    var b = bounds(nodes);
    pad = pad == null ? 40 : pad;
    if (!b) return { x: vw / 2, y: vh / 2, k: 1 };
    var k = clampK(Math.min((vw - pad * 2) / Math.max(b.w, 1), (vh - pad * 2) / Math.max(b.h, 1), 1));
    return { x: (vw - b.w * k) / 2 - b.x * k, y: (vh - b.h * k) / 2 - b.y * k, k: k };
  }

  /* ───── 移動、縮放、群組歸屬 ───── */
  function moveNodes(nodes, ids, dx, dy) {
    var set = {};
    ids.forEach(function (id) {
      set[id] = 1;
      descendants(nodes, id).forEach(function (d) {
        set[d] = 1;
      });
    });
    return nodes.map(function (n) {
      return set[n.id] ? Object.assign({}, n, { x: n.x + dx, y: n.y + dy }) : n;
    });
  }
  /** 選取集合中「祖先沒有被一起選取」的節點；它們才需要重新判斷歸屬，其餘跟著群組走。 */
  function selectionRoots(nodes, ids) {
    var map = byId(nodes),
      sel = {};
    ids.forEach(function (i) {
      sel[i] = 1;
    });
    return ids.filter(function (id) {
      return (
        map[id] &&
        !ancestors(map, map[id]).some(function (a) {
          return sel[a];
        })
      );
    });
  }
  /** 中心點所在的最小群組。群組只能放進比自己大的群組，避免大框掉進小框。 */
  function smallestGroupAt(nodes, px, py, exclude, minArea) {
    var best = null;
    nodes.forEach(function (g) {
      if (g.type !== 'group' || g['x-collapsed'] === true || (exclude && exclude[g.id]) || !inRect(g, px, py))
        return; // 收合的群組不接收新成員
      if (minArea != null && area(g) <= minArea) return;
      if (!best || area(g) <= area(best)) best = g;
    });
    return best;
  }
  function withParent(n, pid) {
    if ((n['x-parent'] || null) === (pid || null)) return n;
    var m = Object.assign({}, n);
    if (pid) m['x-parent'] = pid;
    else delete m['x-parent'];
    return m;
  }
  /** 放開滑鼠時才判斷：每個根節點依中心點歸屬到最小的群組，不在任何群組內就脫離（規劃書 4.4）。 */
  function assignParents(nodes, rootIds) {
    var ex = {},
      map = byId(nodes),
      res = nodes;
    rootIds.forEach(function (id) {
      ex[id] = 1;
      descendants(nodes, id).forEach(function (d) {
        ex[d] = 1;
      });
    });
    var roots = {};
    rootIds.forEach(function (i) {
      roots[i] = 1;
    });
    return res.map(function (n) {
      if (!roots[n.id]) return n;
      var c = vcenter(n),
        g = smallestGroupAt(nodes, c.x, c.y, ex, n.type === 'group' ? area(n) : null);
      return withParent(n, g ? g.id : null);
    });
  }
  function resizeNode(nodes, id, w, h) {
    return nodes.map(function (n) {
      if (n.id !== id) return n;
      var min = n.type === 'group' ? [120, 80] : [80, 40];
      return Object.assign({}, n, { width: Math.max(min[0], w), height: Math.max(min[1], h) });
    });
  }
  /** 群組縮放後：中心點「進入」新範圍的節點加入、「離開」的節點改歸屬到下一個包含它的群組。 */
  function reassignAfterResize(nodes, gid, oldRect) {
    var map = byId(nodes),
      g = map[gid];
    if (!g) return nodes;
    var D = {};
    descendants(nodes, gid).forEach(function (d) {
      D[d] = 1;
    });
    var anc = {};
    ancestors(map, g).forEach(function (a) {
      anc[a] = 1;
    });
    return nodes.map(function (n) {
      if (n.id === gid || anc[n.id]) return n;
      if (n['x-parent'] && D[n['x-parent']]) return n; // 屬於內層子群組的成員，跟著子群組走
      var c = center(n),
        was = inRect(oldRect, c.x, c.y),
        now = inRect(g, c.x, c.y);
      if (was === now) return n;
      var excl = {};
      excl[n.id] = 1;
      descendants(nodes, n.id).forEach(function (d) {
        excl[d] = 1;
      });
      var t = smallestGroupAt(nodes, c.x, c.y, excl, n.type === 'group' ? area(n) : null);
      return withParent(n, t ? t.id : null);
    });
  }
  /** 刪除節點：連到它的線一併刪除；被刪群組的成員交給上一層（不連成員一起刪，避免誤刪）。 */
  function deleteNodes(board, ids) {
    var del = {};
    ids.forEach(function (i) {
      del[i] = 1;
    });
    var map = byId(board.nodes);
    var nodes = board.nodes
      .filter(function (n) {
        return !del[n.id];
      })
      .map(function (n) {
        var p = n['x-parent'];
        if (!p || !del[p]) return n;
        var up = map[p]['x-parent'];
        while (up && del[up]) up = map[up] ? map[up]['x-parent'] : null;
        return withParent(n, up || null);
      });
    var edges = board.edges.filter(function (e) {
      return !del[e.fromNode] && !del[e.toNode];
    });
    return Object.assign({}, board, { nodes: nodes, edges: edges });
  }

  /* ───── 群組收合（P3，規劃書 4.4）：收合＝畫成小方塊、隱藏子孫、連到子孫的線改接到該群組 ───── */
  function collapseInfo(nodes) {
    var map = byId(nodes),
      hidden = {},
      redirect = {},
      count = {};
    nodes.forEach(function (n) {
      var chain = ancestors(map, n).reverse(); // 由最外層往內
      for (var i = 0; i < chain.length; i++)
        if (map[chain[i]]['x-collapsed'] === true) {
          hidden[n.id] = true;
          redirect[n.id] = chain[i];
          count[chain[i]] = (count[chain[i]] || 0) + 1;
          break;
        }
    });
    return { hidden: hidden, redirect: redirect, count: count };
  }
  /** 實際畫出來的節點：被隱藏的拿掉，收合的群組縮成小方塊（檔案裡的座標與尺寸不變）。 */
  function effectiveNodes(nodes, info) {
    return nodes
      .filter(function (n) {
        return !info.hidden[n.id];
      })
      .map(function (n) {
        return n.type === 'group' && n['x-collapsed'] === true
          ? Object.assign({}, n, { width: COLL.w, height: COLL.h })
          : n;
      });
  }
  function toggleCollapsed(board, gid) {
    var cur = false;
    var nodes = board.nodes.map(function (n) {
      if (n.id !== gid || n.type !== 'group') return n;
      cur = n['x-collapsed'] === true;
      var m = Object.assign({}, n);
      if (cur) delete m['x-collapsed'];
      else m['x-collapsed'] = true;
      if (cur) m['x-collapsed'] = false; // 展開時明確寫 false，與規劃書範例一致
      return m;
    });
    return Object.assign({}, board, { nodes: nodes });
  }

  /* ───── 連線 ───── */
  function sidePoint(n, side) {
    switch (side) {
      case 'top':
        return { x: n.x + n.width / 2, y: n.y };
      case 'right':
        return { x: n.x + n.width, y: n.y + n.height / 2 };
      case 'bottom':
        return { x: n.x + n.width / 2, y: n.y + n.height };
      default:
        return { x: n.x, y: n.y + n.height / 2 };
    }
  }
  function autoSides(a, b) {
    var ac = center(a),
      bc = center(b),
      dx = bc.x - ac.x,
      dy = bc.y - ac.y;
    var nx = Math.abs(dx) / ((a.width + b.width) / 2),
      ny = Math.abs(dy) / ((a.height + b.height) / 2);
    if (nx >= ny) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
    return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
  }
  /** 貝茲曲線：起訖點取兩卡片最近的邊（或檔案內指定的 fromSide、toSide）。 */
  function edgeGeom(a, b, e) {
    var auto = autoSides(a, b);
    var fs = SIDES.indexOf(e.fromSide) >= 0 ? e.fromSide : auto[0],
      ts = SIDES.indexOf(e.toSide) >= 0 ? e.toSide : auto[1];
    var p1 = sidePoint(a, fs),
      p2 = sidePoint(b, ts);
    var d = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)),
      off = Math.max(40, Math.min(240, d * 0.4));
    var c1 = { x: p1.x + NORMAL[fs][0] * off, y: p1.y + NORMAL[fs][1] * off },
      c2 = { x: p2.x + NORMAL[ts][0] * off, y: p2.y + NORMAL[ts][1] * off };
    var mid = { x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8, y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8 };
    return {
      p1: p1,
      p2: p2,
      c1: c1,
      c2: c2,
      mid: mid,
      fs: fs,
      ts: ts,
      d:
        'M' +
        r1(p1.x) +
        ' ' +
        r1(p1.y) +
        'C' +
        r1(c1.x) +
        ' ' +
        r1(c1.y) +
        ' ' +
        r1(c2.x) +
        ' ' +
        r1(c2.y) +
        ' ' +
        r1(p2.x) +
        ' ' +
        r1(p2.y),
      box: {
        x: Math.min(p1.x, p2.x, c1.x, c2.x),
        y: Math.min(p1.y, p2.y, c1.y, c2.y),
        w: Math.max(p1.x, p2.x, c1.x, c2.x) - Math.min(p1.x, p2.x, c1.x, c2.x),
        h: Math.max(p1.y, p2.y, c1.y, c2.y) - Math.min(p1.y, p2.y, c1.y, c2.y)
      }
    };
  }
  /* ───── 連線文字：大小與位置（x-labelsize s/m/l、x-labelpos start/mid/end；其他值一律當預設） ───── */
  var LABEL_PX = { s: 11, m: 14, l: 20 },
    LABEL_T = { start: 0.2, mid: 0.5, end: 0.8 };
  function labelSizeOf(e) {
    var v = e && e['x-labelsize'];
    return LABEL_PX[v] ? v : 'm';
  }
  function labelPosOf(e) {
    var v = e && e['x-labelpos'];
    return LABEL_T[v] ? v : 'mid';
  }
  function bezierAt(g, t) {
    var u = 1 - t,
      a = u * u * u,
      b = 3 * u * u * t,
      c = 3 * u * t * t,
      d = t * t * t;
    return {
      x: a * g.p1.x + b * g.c1.x + c * g.c2.x + d * g.p2.x,
      y: a * g.p1.y + b * g.c1.y + c * g.c2.y + d * g.p2.y
    };
  }
  /** 文字中心點：置中就是曲線正中央（與舊版相同），靠起點／靠終點在 20%／80% 處。 */
  function labelPoint(g, e) {
    return bezierAt(g, LABEL_T[labelPosOf(e)]);
  }
  function r1(v) {
    return Math.round(v * 10) / 10;
  }
  /** 箭頭三角形：tip 是尖端，from 是曲線上靠近尖端的控制點。 */
  function arrowPoints(tip, from, size) {
    var dx = tip.x - from.x,
      dy = tip.y - from.y,
      l = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= l;
    dy /= l;
    var bx = tip.x - dx * size,
      by = tip.y - dy * size,
      px = -dy * size * 0.5,
      py = dx * size * 0.5;
    return (
      r1(tip.x) +
      ',' +
      r1(tip.y) +
      ' ' +
      r1(bx + px) +
      ',' +
      r1(by + py) +
      ' ' +
      r1(bx - px) +
      ',' +
      r1(by - py)
    );
  }
  function edgeEnds(e) {
    return { from: e.fromEnd === 'arrow' ? 'arrow' : 'none', to: e.toEnd === 'none' ? 'none' : 'arrow' };
  } // 標準：toEnd 預設箭頭、fromEnd 預設無

  /* ───── 存檔前整理、檢查 ───── */
  /** 座標與尺寸取整數（JSON Canvas 規定為整數）；其他欄位不動。 */
  function prepareForSave(board) {
    var out = Object.assign({}, board);
    out.nodes = board.nodes.map(function (n) {
      return Object.assign({}, n, {
        x: Math.round(n.x),
        y: Math.round(n.y),
        width: Math.round(n.width),
        height: Math.round(n.height)
      });
    });
    out.edges = dropDanglingEdges(board).board.edges.slice(); // 端點已不存在的連線不能存（後端會拒絕）
    return out;
  }
  /** 移除端點不存在的連線；回傳 { board, removed }。 */
  function dropDanglingEdges(board) {
    var ids = {};
    board.nodes.forEach(function (n) {
      ids[n.id] = true;
    });
    var keep = board.edges.filter(function (e) {
      return ids[e.fromNode] && ids[e.toNode];
    });
    return keep.length === board.edges.length
      ? { board: board, removed: 0 }
      : { board: Object.assign({}, board, { edges: keep }), removed: board.edges.length - keep.length };
  }
  /** 依 JSON Canvas 1.0 檢查，回傳問題清單（空陣列代表 Obsidian 讀得進去）。 */
  function validateCanvas(b) {
    var p = [],
      ids = {};
    if (!b || typeof b !== 'object' || Array.isArray(b)) return [Tr('不是 JSON 物件')];
    var color = function (c, where) {
      if (c !== undefined && !(typeof c === 'string' && (/^[1-6]$/.test(c) || /^#[0-9a-fA-F]{6}$/.test(c))))
        p.push(Tr('{1} 的 color 不合法：{2}', where, c));
    };
    (b.nodes || []).forEach(function (n, i) {
      var w = Tr('節點 {1}', n && n.id ? n.id : '#' + (i + 1));
      if (!n || typeof n.id !== 'string' || !n.id) {
        p.push(Tr('{1} 缺少 id', w));
        return;
      }
      if (ids[n.id]) p.push(Tr('{1} id 重複', w));
      ids[n.id] = 1;
      if (['text', 'file', 'link', 'group'].indexOf(n.type) < 0)
        p.push(Tr('{1} type 不合法：{2}', w, n.type));
      ['x', 'y', 'width', 'height'].forEach(function (k) {
        if (!Number.isInteger(n[k])) p.push(Tr('{1} 的 {2} 必須是整數', w, k));
      });
      if (n.type === 'text' && typeof n.text !== 'string') p.push(Tr('{1} 缺少 text', w));
      if (n.type === 'file' && typeof n.file !== 'string') p.push(Tr('{1} 缺少 file', w));
      if (n.type === 'link' && typeof n.url !== 'string') p.push(Tr('{1} 缺少 url', w));
      if (n.type === 'group' && n.label !== undefined && typeof n.label !== 'string')
        p.push(Tr('{1} 的 label 必須是字串', w));
      color(n.color, w);
    });
    var eids = {};
    (b.edges || []).forEach(function (e, i) {
      var w = Tr('連線 {1}', e && e.id ? e.id : '#' + (i + 1));
      if (!e || typeof e.id !== 'string' || !e.id) {
        p.push(Tr('{1} 缺少 id', w));
        return;
      }
      if (eids[e.id]) p.push(Tr('{1} id 重複', w));
      eids[e.id] = 1;
      if (!ids[e.fromNode]) p.push(Tr('{1} 的 fromNode 不存在：{2}', w, e.fromNode));
      if (!ids[e.toNode]) p.push(Tr('{1} 的 toNode 不存在：{2}', w, e.toNode));
      ['fromSide', 'toSide'].forEach(function (k) {
        if (e[k] !== undefined && SIDES.indexOf(e[k]) < 0) p.push(Tr('{1} 的 {2} 不合法', w, k));
      });
      ['fromEnd', 'toEnd'].forEach(function (k) {
        if (e[k] !== undefined && e[k] !== 'none' && e[k] !== 'arrow') p.push(Tr('{1} 的 {2} 不合法', w, k));
      });
      if (e.label !== undefined && typeof e.label !== 'string') p.push(Tr('{1} 的 label 必須是字串', w));
      color(e.color, w);
    });
    return p;
  }
  /** 結構一致性：x-parent 指向不存在、形成循環時回報（匯入或合併後用）。 */
  function parentProblems(nodes) {
    var map = byId(nodes),
      out = [];
    nodes.forEach(function (n) {
      var p = n['x-parent'];
      if (!p) return;
      if (!map[p]) out.push(Tr('{1} 的 x-parent 不存在：{2}', n.id, p));
      else if (map[p].type !== 'group') out.push(Tr('{1} 的 x-parent 不是群組', n.id));
      else {
        var seen = {},
          c = p;
        while (c && map[c] && !seen[c]) {
          if (c === n.id) {
            out.push(Tr('{1} 的 x-parent 形成循環', n.id));
            break;
          }
          seen[c] = 1;
          c = map[c]['x-parent'];
        }
      }
    });
    return out;
  }
  function fixParents(nodes) {
    var map = byId(nodes);
    return nodes.map(function (n) {
      var p = n['x-parent'];
      if (!p) return n;
      if (!map[p] || map[p].type !== 'group') return withParent(n, null);
      var seen = {},
        c = p;
      while (c && map[c] && !seen[c]) {
        if (c === n.id) return withParent(n, null);
        seen[c] = 1;
        c = map[c]['x-parent'];
      }
      return n;
    });
  }

  /* ───── 三方合併(衝突時) ───── */
  function mergeList(base, mine, theirs, stats) {
    var b = byId(base),
      m = byId(mine),
      t = byId(theirs),
      ids = [],
      seen = {};
    theirs.concat(mine, base).forEach(function (n) {
      if (!seen[n.id]) {
        seen[n.id] = 1;
        ids.push(n.id);
      }
    });
    var out = [];
    ids.forEach(function (id) {
      var vb = b[id],
        vm = m[id],
        vt = t[id],
        pick;
      if (same(vm, vt)) pick = vm;
      else if (same(vm, vb)) pick = vt;
      else if (same(vt, vb)) pick = vm;
      else {
        // 兩邊都動過
        stats.conflicts++;
        pick = vm === undefined ? vt : vt === undefined ? vm : vm; // 一邊刪、一邊改：留下被修改的；兩邊都改：用我的
      }
      if (pick !== undefined) out.push(pick);
    });
    return out;
  }
  /** base＝我開啟時的伺服器版、mine＝我現在的版本、theirs＝伺服器現在的版本。以 id 逐一比對。 */
  function mergeBoards(base, mine, theirs) {
    var stats = { conflicts: 0 };
    var out = Object.assign({}, theirs);
    Object.keys(mine).forEach(function (k) {
      if (k === 'nodes' || k === 'edges') return;
      if (!same(mine[k], base[k]) && same(theirs[k], base[k])) out[k] = mine[k];
    });
    out.nodes = fixParents(mergeList(base.nodes || [], mine.nodes || [], theirs.nodes || [], stats));
    var ids = byId(out.nodes);
    out.edges = mergeList(base.edges || [], mine.edges || [], theirs.edges || [], stats).filter(function (e) {
      return ids[e.fromNode] && ids[e.toNode];
    });
    return { board: out, conflicts: stats.conflicts };
  }

  /* ───── 復原、重做 ───── */
  function makeHistory(limit) {
    var past = [],
      future = [],
      max = limit || 100;
    return {
      push: function (snap) {
        past.push(snap);
        if (past.length > max) past.shift();
        future = [];
      },
      undo: function (cur) {
        if (!past.length) return null;
        future.push(cur);
        return past.pop();
      },
      redo: function (cur) {
        if (!future.length) return null;
        past.push(cur);
        return future.pop();
      },
      canUndo: function () {
        return past.length > 0;
      },
      canRedo: function () {
        return future.length > 0;
      },
      clear: function () {
        past = [];
        future = [];
      }
    };
  }

  /* ───── P6：連結預覽資料與自動排版 ───── */
  var IMG_EXT = /\.(?:png|jpe?g|gif|webp|avif)$/i;
  /** 直接指向圖片檔的 https 網址（只看副檔名，不連線）。 */
  function isImageUrl(u) {
    u = safeUrl(u);
    return !!u && /^https:\/\//i.test(u) && IMG_EXT.test(u.split(/[?#]/)[0]);
  }
  function ytThumb(id) {
    return /^[A-Za-z0-9_-]{11}$/.test(String(id || ''))
      ? 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'
      : '';
  }
  /** x-preview 可能來自匯入的畫布檔，一律重新檢查型別、長度與網址；封面圖只收 https。 */
  function safePreview(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    var cl = function (v, n) {
      return typeof v === 'string'
        ? v
            .replace(/[\u0000-\u001f\u007f]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, n)
        : '';
    };
    var img =
      typeof p.image === 'string' && p.image.length <= 500 && /^https:\/\/[^\s"'<>]+$/i.test(p.image)
        ? p.image
        : '';
    var o = {
      title: cl(p.title, 120),
      description: cl(p.description, 240),
      image: img,
      site: cl(p.site, 60)
    };
    return o.title || o.description || o.image ? o : null;
  }

  /** Notion 頁面不提供公開預覽（要登入或靠 JS 才有內容），抓到的多半是通用的「Notion」。改由網址最後一段的標題推出名稱。非 Notion 網址回傳 null。 */
  function notionInfo(url) {
    var m =
      /^https:\/\/(?:[A-Za-z0-9-]+\.)*(?:notion\.so|notion\.site|notion\.com)(?=[\/?#]|$)(\/[^?#]*)?/i.exec(
        String(url || '')
      );
    if (!m) return null;
    var seg =
        String(m[1] || '')
          .split('/')
          .filter(Boolean)
          .pop() || '',
      t = seg;
    try {
      t = decodeURIComponent(seg);
    } catch (e) {
      /* 保持原樣 */
    }
    t = t
      .replace(/-?[0-9a-f]{32}$/i, '')
      .replace(/^[0-9a-f]{32}$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    return { title: t, site: 'Notion' };
  }
  /** 實際用來顯示的預覽：Notion 抓到通用標題（或沒抓到）時改用網址推出的標題。 */
  function effPreview(url, p) {
    var pv = safePreview(p),
      nt = notionInfo(url);
    if (!nt) return pv;
    if (pv && pv.title && !/^notion(\b|$)/i.test(pv.title)) return pv;
    return nt.title ? { title: nt.title, description: '', image: '', site: 'Notion' } : null;
  }

  /**
   * 自動排版：只重排「筆記／圖片卡（type: file）」，其他卡片原地不動。
   * opts：{ mode: 'grid'|'tags'|'timeline', ids: {節點id:1}（省略＝全部 file 卡）, add: ['notes/x.md',…]（要新增的卡片）,
   *         info: function(node) → {title, date, tags}, labels: {none, nodate, image} }
   * 排好的卡片放在原本那群卡片的左上角位置（沒有舊卡片就放在畫布右側）；舊群組若因此變空會一併移除。
   */
  function autoLayout(board, opts) {
    opts = opts || {};
    var GAP = 40,
      PAD = 32,
      HEAD = 56,
      mode = opts.mode || 'grid',
      labels = opts.labels || {};
    var info =
      opts.info ||
      function () {
        return {};
      };
    var nodes = board.nodes.map(function (n) {
      return Object.assign({}, n);
    });
    var sel = opts.ids || null;
    var targets = nodes.filter(function (n) {
      return n.type === 'file' && (!sel || sel[n.id]);
    });
    var oldCount = targets.length;
    var originB = oldCount
      ? bounds(targets)
      : nodes.length
        ? (function () {
            var b = bounds(nodes);
            return { x: b.x + b.w + GAP * 2, y: b.y };
          })()
        : { x: 0, y: 0 };
    var taken = {};
    nodes.forEach(function (n) {
      taken[n.id] = 1;
    });
    (opts.add || []).forEach(function (f) {
      var id = newId(taken);
      taken[id] = 1;
      var n = { id: id, type: 'file', file: f, x: 0, y: 0, width: DEF.file[0], height: DEF.file[1] };
      nodes.push(n);
      targets.push(n);
    });
    if (!targets.length) return { board: board, moved: 0, groups: 0, added: 0 };

    var hadParent = {};
    targets.forEach(function (t) {
      if (t['x-parent']) hadParent[t['x-parent']] = true;
      delete t['x-parent'];
    });
    var ox = Math.round(originB.x),
      oy = Math.round(originB.y);
    var cw = 200,
      ch = 120;
    targets.forEach(function (t) {
      cw = Math.max(cw, t.width);
      ch = Math.max(ch, t.height);
    });
    var meta = function (t) {
      var m = info(t) || {};
      return {
        title: String(m.title || t.file || ''),
        date: String(m.date || ''),
        tags: Array.isArray(m.tags) ? m.tags : []
      };
    };
    var cmp = function (a, b) {
      var x = meta(a),
        y = meta(b);
      if (!x.date !== !y.date) return x.date ? -1 : 1; // 沒有日期的排最後
      return x.date.localeCompare(y.date) || x.title.localeCompare(y.title);
    };
    var made = 0;

    if (mode === 'grid') {
      var list = targets.slice().sort(cmp),
        cols = Math.max(1, Math.round(Math.sqrt(list.length * 1.5)));
      list.forEach(function (t, i) {
        t.x = ox + (i % cols) * (cw + GAP);
        t.y = oy + Math.floor(i / cols) * (ch + GAP);
      });
    } else {
      var buckets = {},
        order = [];
      var put = function (key, label, t) {
        if (!buckets[key]) {
          buckets[key] = { key: key, label: label, items: [] };
          order.push(key);
        }
        buckets[key].items.push(t);
      };
      targets
        .slice()
        .sort(cmp)
        .forEach(function (t) {
          var m = meta(t),
            isSvg = /^assets\//.test(t.file || '');
          if (mode === 'tags') {
            var tag = isSvg ? '' : String(m.tags[0] || '');
            if (isSvg) put('\u0001img', labels.image || 'Images', t);
            else if (tag) put('t:' + tag, tag, t);
            else put('\u0002none', labels.none || 'Uncategorized', t);
          } else {
            var mo = /^\d{4}-\d{2}/.test(m.date) ? m.date.slice(0, 7) : '';
            if (mo) put('m:' + mo, mo, t);
            else put('\u0002nodate', labels.nodate || 'No date', t);
          }
        });
      var last = function (k) {
        return k.charAt(0) === '\u0001' || k.charAt(0) === '\u0002';
      };
      order.sort(function (a, b) {
        if (last(a) !== last(b)) return last(a) ? 1 : -1;
        if (mode === 'timeline') return a.localeCompare(b);
        return (
          buckets[b].items.length - buckets[a].items.length ||
          buckets[a].label.localeCompare(buckets[b].label)
        );
      });
      var maxW = 2600,
        cx = 0,
        cy = 0,
        rowH = 0;
      order.forEach(function (k, idx) {
        var bk = buckets[k],
          cnt = bk.items.length;
        var cols2 = mode === 'timeline' ? 1 : Math.max(1, Math.min(4, Math.ceil(Math.sqrt(cnt)))),
          rows = Math.ceil(cnt / cols2);
        var fw = cols2 * cw + (cols2 - 1) * GAP + PAD * 2,
          fh = rows * ch + (rows - 1) * GAP + HEAD + PAD;
        if (mode !== 'timeline' && cx > 0 && cx + fw > maxW) {
          cx = 0;
          cy += rowH + GAP * 2;
          rowH = 0;
        }
        var gid = newId(taken);
        taken[gid] = 1;
        var g = { id: gid, type: 'group', label: bk.label, x: ox + cx, y: oy + cy, width: fw, height: fh };
        nodes.push(g);
        made++;
        bk.items.forEach(function (t, i) {
          t.x = g.x + PAD + (i % cols2) * (cw + GAP);
          t.y = g.y + HEAD + Math.floor(i / cols2) * (ch + GAP);
          t['x-parent'] = gid;
        });
        cx += fw + GAP * 2;
        rowH = Math.max(rowH, fh);
      });
    }
    // 因排版而變空的舊群組一併移除（反覆做，連同變空的上層群組）
    var changed = true;
    while (changed) {
      changed = false;
      var has = {};
      nodes.forEach(function (n) {
        if (n['x-parent']) has[n['x-parent']] = true;
      });
      nodes = nodes.filter(function (n) {
        if (n.type === 'group' && hadParent[n.id] && !has[n.id]) {
          changed = true;
          if (n['x-parent']) hadParent[n['x-parent']] = true;
          return false;
        }
        return true;
      });
    }
    var res = dropDanglingEdges({ nodes: nodes, edges: board.edges }); // 被移除的舊群組若有連線，連線一併移除
    return {
      board: Object.assign({}, board, { nodes: nodes, edges: res.board.edges }),
      moved: targets.length - (opts.add || []).length,
      groups: made,
      added: (opts.add || []).length,
      droppedEdges: res.removed
    };
  }

  /* ───── 嵌入（P15）：HTML 檔卡片與「嵌入網頁」連結卡片 ───── */
  function htmlIdOf(file) {
    var m = /^assets\/(\d{8}-[a-z0-9]{2,8})\.html$/.exec(String(file || ''));
    return m ? m[1] : null;
  }
  function pdfIdOf(file) {
    var m = /^assets\/(\d{8}-[a-z0-9]{2,8})\.pdf$/.exec(String(file || ''));
    return m ? m[1] : null;
  }
  /** PDF 資料網址 → base64 內容；不是 PDF 就回傳 null（檔頭 %PDF- 的 base64 開頭是 JVBERi0）。 */
  function pdfBase64(dataUrl) {
    var m = /^data:application\/pdf;base64,([A-Za-z0-9+\/]+={0,2})$/.exec(String(dataUrl || ''));
    return m && m[1].indexOf('JVBERi0') === 0 ? m[1] : null;
  }
  /**
   * 常見網址自動換成「可嵌入」的網址（原本的連結不改，只有嵌入時用）：
   *  - Google 簡報「發布到網路」的 /pub → /embed；分享用的 /edit、/view → /embed（檔案需開成「知道連結的人可檢視」）
   *  - Google 雲端硬碟檔案（PDF、影片等）/view → /preview
   */
  function normalizeEmbed(u) {
    var m;
    if (
      (m =
        /^(https:\/\/docs\.google\.com\/presentation\/d\/e\/[A-Za-z0-9_-]+)\/(?:pub|pubhtml)(\?[^#]*)?(?:#.*)?$/.exec(
          u
        ))
    )
      return m[1] + '/embed' + (m[2] || '');
    if (
      (m =
        /^(https:\/\/docs\.google\.com\/presentation\/d\/(?!e\/)[A-Za-z0-9_-]+)\/(?:edit|view|present|preview)(?:[?#].*)?$/.exec(
          u
        ))
    )
      return m[1] + '/embed?start=false&loop=false&delayms=3000';
    if ((m = /^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)\/(?:view|edit)(?:[?#].*)?$/.exec(u)))
      return 'https://drive.google.com/file/d/' + m[1] + '/preview';
    if ((m = /^https:\/\/drive\.google\.com\/open\?(?:[^#]*&)?id=([A-Za-z0-9_-]+)/.exec(u)))
      return 'https://drive.google.com/file/d/' + m[1] + '/preview';
    return u;
  }
  /** 使用者貼上整段 <iframe …> 嵌入碼時，取出裡面的 src 網址；沒有就回傳原文。 */
  function extractEmbedSrc(text) {
    var m = /<iframe\b[^>]*?\ssrc\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(String(text || ''));
    if (!m) return String(text || '');
    return (m[1] || m[2]).replace(/&amp;/g, '&').trim();
  }
  /** 只有 https 網址可嵌入（http 在 https 頁面內會被瀏覽器擋掉）；會順便套用 normalizeEmbed。 */
  function embedUrl(u) {
    u = safeUrl(u);
    return u && /^https:\/\//i.test(u) ? normalizeEmbed(u) : null;
  }
  /** 把 HTML 檔包上 CSP（不能連線到任意站台；腳本只有擁有者開啟時才允許），回傳給 iframe srcdoc 用的完整文件。 */
  function embedDoc(html, scripts) {
    var csp =
      "default-src 'none'; img-src data: https:; media-src data: https:; font-src data: https:; style-src 'unsafe-inline' https:" +
      (scripts ? "; script-src 'unsafe-inline' https:; connect-src https:" : '');
    var meta = '<meta http-equiv="Content-Security-Policy" content="' + csp + '">',
      h = String(html);
    var head = /<head(?:\s[^>]*)?>/i.exec(h);
    if (head) return h.slice(0, head.index + head[0].length) + meta + h.slice(head.index + head[0].length);
    var dt = /^\s*<!doctype[^>]*>/i.exec(h);
    return dt ? dt[0] + meta + h.slice(dt[0].length) : '<!doctype html>' + meta + h;
  }

  /** HTML 卡片的 iframe sandbox 值（卡片內與新分頁共用）。腳本開啟時才允許下載與 alert／confirm；永遠不給 allow-same-origin。 */
  function embedSandbox(scripts) {
    return (
      'allow-popups allow-popups-to-escape-sandbox' +
      (scripts ? ' allow-scripts allow-downloads allow-modals' : '')
    );
  }
  /** 「在新分頁開啟」用的外殼頁：一個佔滿視窗的沙箱 iframe（與卡片內的沙箱規則相同），HTML 以 srcdoc 放進去。 */
  function openerDoc(html, name, scripts) {
    var esc = function (x) {
      return String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    };
    return (
      '<!doctype html><meta charset="utf-8"><title>' +
      esc(name || 'HTML') +
      '</title><style>html,body{margin:0;height:100%;background:#fff}iframe{border:0;width:100%;height:100%;display:block}</style>' +
      '<iframe sandbox="' +
      embedSandbox(scripts) +
      '" referrerpolicy="no-referrer" srcdoc="' +
      esc(embedDoc(html, scripts)) +
      '"></iframe>'
    );
  }

  return {
    openerDoc: openerDoc,
    embedSandbox: embedSandbox,
    htmlIdOf: htmlIdOf,
    pdfIdOf: pdfIdOf,
    pdfBase64: pdfBase64,
    normalizeEmbed: normalizeEmbed,
    extractEmbedSrc: extractEmbedSrc,
    embedUrl: embedUrl,
    embedDoc: embedDoc,
    dropDanglingEdges: dropDanglingEdges,
    isImageUrl: isImageUrl,
    ytThumb: ytThumb,
    safePreview: safePreview,
    notionInfo: notionInfo,
    effPreview: effPreview,
    autoLayout: autoLayout,
    PRESET: PRESET,
    DEF: DEF,
    SIDES: SIDES,
    K_MIN: K_MIN,
    K_MAX: K_MAX,
    clone: clone,
    stable: stable,
    same: same,
    parse: parse,
    normalize: normalize,
    colorOf: colorOf,
    safeUrl: safeUrl,
    youtubeId: youtubeId,
    hostOf: hostOf,
    newId: newId,
    byId: byId,
    childrenIndex: childrenIndex,
    descendants: descendants,
    ancestors: ancestors,
    center: center,
    area: area,
    inRect: inRect,
    hit: hit,
    visibleNodes: visibleNodes,
    drawOrder: drawOrder,
    bounds: bounds,
    clampK: clampK,
    zoomAt: zoomAt,
    fitView: fitView,
    moveNodes: moveNodes,
    selectionRoots: selectionRoots,
    smallestGroupAt: smallestGroupAt,
    assignParents: assignParents,
    resizeNode: resizeNode,
    reassignAfterResize: reassignAfterResize,
    deleteNodes: deleteNodes,
    COLL: COLL,
    collapseInfo: collapseInfo,
    effectiveNodes: effectiveNodes,
    toggleCollapsed: toggleCollapsed,
    edgeGeom: edgeGeom,
    labelSizeOf: labelSizeOf,
    labelPosOf: labelPosOf,
    labelPoint: labelPoint,
    bezierAt: bezierAt,
    LABEL_PX: LABEL_PX,
    arrowPoints: arrowPoints,
    edgeEnds: edgeEnds,
    prepareForSave: prepareForSave,
    validateCanvas: validateCanvas,
    parentProblems: parentProblems,
    fixParents: fixParents,
    mergeBoards: mergeBoards,
    makeHistory: makeHistory
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CanvasLogic;
