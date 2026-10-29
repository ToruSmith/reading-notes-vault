// 畫布純邏輯測試（node）。介面行為由 canvas_e2e.test.js 在真實瀏覽器驗證。
const assert = require('assert');
const CL = require('../canvaslogic.js');
let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('通過  ' + name);
};
const N = (id, type, x, y, w, h, extra) =>
  Object.assign({ id, type, x, y, width: w, height: h }, type === 'text' ? { text: id } : {}, extra || {});
const board = (nodes, edges) => ({ nodes, edges: edges || [] });
const parentOf = (nodes, id) => nodes.find(x => x.id === id)['x-parent'];

t('parse：補齊 nodes/edges，不認得的頂層欄位與節點欄位原樣保留', () => {
  const b = CL.parse(
    JSON.stringify({
      'x-meta': { a: 1 },
      unknownTop: [1],
      nodes: [
        {
          id: 'a',
          type: 'text',
          text: 'hi',
          x: 1,
          y: 2,
          width: 100,
          height: 50,
          'x-foo': 'bar',
          weird: { z: 1 }
        }
      ]
    })
  );
  assert.deepStrictEqual(b.edges, []);
  assert.strictEqual(b['x-meta'].a, 1);
  assert.deepStrictEqual(b.unknownTop, [1]);
  assert.strictEqual(b.nodes[0]['x-foo'], 'bar');
  assert.deepStrictEqual(b.nodes[0].weird, { z: 1 });
});
t('parse：缺少座標的節點補預設值，沒有 id 的節點丟棄', () => {
  const b = CL.parse(JSON.stringify({ nodes: [{ id: 'a', type: 'text', text: 'x' }, { type: 'text' }] }));
  assert.strictEqual(b.nodes.length, 1);
  assert.ok(b.nodes[0].width > 0 && b.nodes[0].height > 0);
});
t('不可變更新：搬動只改座標，其他欄位（含 x- 與未知欄位）原樣帶著走', () => {
  const nodes = [N('a', 'text', 0, 0, 100, 50, { 'x-foo': 1, color: '3', weird: { k: [1] } })];
  const out = CL.moveNodes(nodes, ['a'], 10, 20);
  assert.strictEqual(out[0].x, 10);
  assert.strictEqual(out[0].y, 20);
  assert.strictEqual(out[0]['x-foo'], 1);
  assert.deepStrictEqual(out[0].weird, { k: [1] });
  assert.strictEqual(nodes[0].x, 0, '原陣列不可被改動');
});
t('群組：搬動群組，所有子孫（含巢狀）一起移動', () => {
  const nodes = [
    N('g1', 'group', 0, 0, 800, 600),
    N('g2', 'group', 50, 50, 400, 300, { 'x-parent': 'g1' }),
    N('c', 'text', 60, 60, 100, 50, { 'x-parent': 'g2' }),
    N('o', 'text', 900, 0, 100, 50)
  ];
  const out = CL.moveNodes(nodes, ['g1'], 100, 10),
    by = CL.byId(out);
  assert.deepStrictEqual([by.g1.x, by.g2.x, by.c.x, by.o.x], [100, 150, 160, 900]);
  assert.deepStrictEqual([by.g1.y, by.g2.y, by.c.y, by.o.y], [10, 60, 70, 0]);
});
t('歸屬：卡片中心落在最小的群組內才成為成員（巢狀取最內層）', () => {
  const nodes = [
    N('g1', 'group', 0, 0, 800, 600),
    N('g2', 'group', 50, 50, 300, 200, { 'x-parent': 'g1' }),
    N('c', 'text', 100, 100, 100, 50)
  ];
  assert.strictEqual(parentOf(CL.assignParents(nodes, ['c']), 'c'), 'g2');
  const out = CL.assignParents(CL.moveNodes(nodes, ['c'], 400, 0), ['c']); // 中心 (550,125)：在 g1 內、g2 外
  assert.strictEqual(parentOf(out, 'c'), 'g1');
  const out2 = CL.assignParents(CL.moveNodes(nodes, ['c'], 2000, 0), ['c']);
  assert.strictEqual(parentOf(out2, 'c'), undefined);
  assert.ok(!('x-parent' in out2.find(x => x.id === 'c')), '脫離後不留 x-parent 欄位');
});
t('歸屬：放開時才判斷（搬動途中不改 x-parent）', () => {
  const nodes = [N('g1', 'group', 0, 0, 300, 300), N('c', 'text', 1000, 1000, 100, 50)];
  const moving = CL.moveNodes(nodes, ['c'], -900, -900);
  assert.strictEqual(parentOf(moving, 'c'), undefined);
  assert.strictEqual(parentOf(CL.assignParents(moving, ['c']), 'c'), 'g1');
});
t('歸屬：群組不能掉進自己的子孫，也不能放進比自己小的群組', () => {
  const nodes = [
    N('big', 'group', 0, 0, 900, 700),
    N('small', 'group', 100, 100, 200, 150, { 'x-parent': 'big' })
  ];
  const m = CL.moveNodes(nodes, ['big'], 0, 0);
  assert.strictEqual(parentOf(CL.assignParents(m, ['big']), 'big'), undefined);
  const big2 = [N('big', 'group', 0, 0, 900, 700), N('small', 'group', 3000, 3000, 200, 150)];
  const moved = CL.moveNodes(big2, ['big'], 2900, 2900); // big 的中心 (3350,3250) 落在 small 內
  assert.strictEqual(parentOf(CL.assignParents(moved, ['big']), 'big'), undefined, '大框不可掉進小框');
});
t('歸屬：同時選取群組與其成員，成員跟著群組走、不重新判斷', () => {
  const nodes = [N('g', 'group', 0, 0, 400, 300), N('c', 'text', 10, 10, 100, 50, { 'x-parent': 'g' })];
  assert.deepStrictEqual(CL.selectionRoots(nodes, ['g', 'c']), ['g']);
});
t('縮放群組：新包含的卡片加入、被排除的卡片脫離', () => {
  let nodes = [
    N('g', 'group', 0, 0, 200, 200),
    N('in', 'text', 20, 20, 100, 50, { 'x-parent': 'g' }),
    N('out', 'text', 300, 20, 100, 50)
  ];
  const old = { x: 0, y: 0, width: 200, height: 200 };
  nodes = CL.resizeNode(nodes, 'g', 500, 200);
  nodes = CL.reassignAfterResize(nodes, 'g', old);
  assert.strictEqual(parentOf(nodes, 'out'), 'g');
  assert.strictEqual(parentOf(nodes, 'in'), 'g');
  const old2 = { x: 0, y: 0, width: 500, height: 200 };
  nodes = CL.reassignAfterResize(CL.resizeNode(nodes, 'g', 100, 200), 'g', old2);
  assert.strictEqual(parentOf(nodes, 'out'), undefined);
});
t('縮放有最小尺寸', () => {
  const o = CL.resizeNode([N('c', 'text', 0, 0, 100, 50), N('g', 'group', 0, 0, 300, 300)], 'c', 1, 1);
  assert.deepStrictEqual([o[0].width, o[0].height], [80, 40]);
  assert.deepStrictEqual(
    [CL.resizeNode(o, 'g', 5, 5)[1].width, CL.resizeNode(o, 'g', 5, 5)[1].height],
    [120, 80]
  );
});
t('刪除：連到它的連線一併刪除；刪群組時成員交給上一層而不是一起消失', () => {
  const b = board(
    [
      N('g1', 'group', 0, 0, 900, 700),
      N('g2', 'group', 10, 10, 400, 300, { 'x-parent': 'g1' }),
      N('c', 'text', 20, 20, 100, 50, { 'x-parent': 'g2' }),
      N('d', 'text', 600, 600, 100, 50)
    ],
    [
      { id: 'e1', fromNode: 'c', toNode: 'd' },
      { id: 'e2', fromNode: 'd', toNode: 'd2' }
    ]
  );
  const o = CL.deleteNodes(b, ['g2']);
  assert.strictEqual(o.nodes.length, 3);
  assert.strictEqual(parentOf(o.nodes, 'c'), 'g1');
  const o2 = CL.deleteNodes(b, ['c']);
  assert.deepStrictEqual(
    o2.edges.map(e => e.id),
    ['e2']
  );
  const o3 = CL.deleteNodes(b, ['g1', 'g2']);
  assert.strictEqual(parentOf(o3.nodes, 'c'), undefined);
});
t('連線：自動選最近的邊；指定 fromSide/toSide 時照指定', () => {
  const a = N('a', 'text', 0, 0, 100, 100),
    b = N('b', 'text', 400, 0, 100, 100),
    c = N('c', 'text', 0, 400, 100, 100);
  assert.deepStrictEqual([CL.edgeGeom(a, b, {}).fs, CL.edgeGeom(a, b, {}).ts], ['right', 'left']);
  assert.deepStrictEqual([CL.edgeGeom(a, c, {}).fs, CL.edgeGeom(a, c, {}).ts], ['bottom', 'top']);
  assert.deepStrictEqual([CL.edgeGeom(b, a, {}).fs, CL.edgeGeom(b, a, {}).ts], ['left', 'right']);
  const g = CL.edgeGeom(a, b, { fromSide: 'top', toSide: 'top' });
  assert.deepStrictEqual([g.fs, g.ts], ['top', 'top']);
  assert.deepStrictEqual(g.p1, { x: 50, y: 0 });
  assert.ok(/^M[\d. -]+C[\d. -]+$/.test(g.d));
});
t('連線方向：toEnd 預設箭頭、fromEnd 預設無；可設雙向與無箭頭', () => {
  assert.deepStrictEqual(CL.edgeEnds({}), { from: 'none', to: 'arrow' });
  assert.deepStrictEqual(CL.edgeEnds({ fromEnd: 'arrow', toEnd: 'arrow' }), { from: 'arrow', to: 'arrow' });
  assert.deepStrictEqual(CL.edgeEnds({ toEnd: 'none' }), { from: 'none', to: 'none' });
});
t('可見範圍：只回傳與視窗相交的節點', () => {
  const nodes = [
    N('a', 'text', 0, 0, 100, 100),
    N('b', 'text', 5000, 5000, 100, 100),
    N('g', 'group', -100, -100, 10000, 10000)
  ];
  assert.deepStrictEqual(CL.visibleNodes(nodes, { x: 0, y: 0, w: 800, h: 600 }).sort(), ['a', 'g']);
});
t('縮放：以游標為中心，縮放前後游標下的世界座標不變；倍率限制在範圍內', () => {
  const v = { x: 100, y: 50, k: 1 },
    w0 = { x: (300 - v.x) / v.k, y: (200 - v.y) / v.k };
  const o = CL.zoomAt(v, 300, 200, 1.5);
  assert.ok(Math.abs((300 - o.x) / o.k - w0.x) < 1e-9 && Math.abs((200 - o.y) / o.k - w0.y) < 1e-9);
  assert.strictEqual(CL.zoomAt({ x: 0, y: 0, k: 2.4 }, 0, 0, 10).k, CL.K_MAX);
  assert.strictEqual(CL.zoomAt({ x: 0, y: 0, k: 0.11 }, 0, 0, 0.01).k, CL.K_MIN);
});
t('符合視窗：所有節點都落在視窗內', () => {
  const nodes = [N('a', 'text', -1000, -500, 200, 100), N('b', 'text', 3000, 2000, 200, 100)];
  const v = CL.fitView(nodes, 800, 600, 40);
  nodes.forEach(n => {
    const x = n.x * v.k + v.x,
      y = n.y * v.k + v.y;
    assert.ok(x >= 0 && y >= 0 && x + n.width * v.k <= 800 && y + n.height * v.k <= 600);
  });
  assert.deepStrictEqual(CL.fitView([], 800, 600), { x: 400, y: 300, k: 1 });
});
t('復原／重做：多步來回、新操作會清掉重做、上限 100', () => {
  const h = CL.makeHistory();
  let cur = 'A';
  h.push(cur);
  cur = 'B';
  h.push(cur);
  cur = 'C';
  cur = h.undo(cur);
  assert.strictEqual(cur, 'B');
  cur = h.undo(cur);
  assert.strictEqual(cur, 'A');
  assert.strictEqual(h.undo(cur), null);
  cur = h.redo(cur);
  assert.strictEqual(cur, 'B');
  h.push(cur);
  cur = 'D';
  assert.strictEqual(h.redo(cur), null, '新操作後不能重做');
  const h2 = CL.makeHistory(100);
  for (let i = 0; i < 150; i++) h2.push('s' + i);
  let c = 'x',
    cnt = 0;
  while ((c = h2.undo(c)) !== null) cnt++;
  assert.strictEqual(cnt, 100);
});
t('存檔前整理：座標與尺寸取整數，其餘欄位不動', () => {
  const b = {
    'x-top': 1,
    nodes: [N('a', 'text', 1.4, 2.6, 100.5, 50.49, { 'x-k': 'v' })],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'a', 'x-style': 'dashed', mystery: 1 }]
  };
  const o = CL.prepareForSave(b);
  assert.deepStrictEqual([o.nodes[0].x, o.nodes[0].y, o.nodes[0].width, o.nodes[0].height], [1, 3, 101, 50]);
  assert.strictEqual(o['x-top'], 1);
  assert.strictEqual(o.nodes[0]['x-k'], 'v');
  assert.strictEqual(o.edges[0].mystery, 1);
  assert.strictEqual(o.edges[0]['x-style'], 'dashed');
  assert.deepStrictEqual(
    CL.validateCanvas(o).filter(p => /整數/.test(p)),
    []
  );
});
t('往返：parse → 編輯 → 存檔後，未知欄位與 x- 欄位逐字相同（Obsidian 往返保留）', () => {
  const src = {
    'x-board': { v: 2 },
    nodes: [
      {
        id: 'a',
        type: 'text',
        text: 'hi',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        color: '2',
        'x-note': 'keep',
        odd: [1, { z: null }]
      },
      { id: 'g', type: 'group', label: 'G', x: -50, y: -50, width: 400, height: 300, 'x-collapsed': false }
    ],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'g', label: '反例', 'x-style': 'dashed', future: true }],
    futureTop: 'z'
  };
  let b = CL.parse(JSON.stringify(src));
  b = Object.assign({}, b, { nodes: CL.assignParents(CL.moveNodes(b.nodes, ['a'], 10, 10), ['a']) });
  const out = JSON.parse(JSON.stringify(CL.prepareForSave(b)));
  const a = out.nodes.find(x => x.id === 'a');
  assert.strictEqual(a['x-note'], 'keep');
  assert.deepStrictEqual(a.odd, [1, { z: null }]);
  assert.strictEqual(a['x-parent'], 'g');
  assert.strictEqual(out.futureTop, 'z');
  assert.deepStrictEqual(out['x-board'], { v: 2 });
  assert.strictEqual(out.edges[0].future, true);
  assert.strictEqual(out.nodes.find(x => x.id === 'g')['x-collapsed'], false);
});
t('JSON Canvas 檢查：合法檔案無問題；錯誤的 type、非整數、連線指向不存在、重複 id 都會被抓到', () => {
  const ok = {
    nodes: [
      N('a', 'text', 0, 0, 10, 10),
      N('b', 'link', 0, 0, 10, 10, { url: 'https://x.y' }),
      N('f', 'file', 0, 0, 10, 10, { file: 'notes/20261001-a1.md' }),
      N('g', 'group', 0, 0, 10, 10, { label: 'g', color: '#aabbcc' })
    ],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'b', fromSide: 'left', toEnd: 'arrow', color: '4' }]
  };
  assert.deepStrictEqual(CL.validateCanvas(ok), []);
  const bad = {
    nodes: [
      N('a', 'text', 0.5, 0, 10, 10),
      N('a', 'bogus', 0, 0, 10, 10),
      { id: 'f', type: 'file', x: 0, y: 0, width: 1, height: 1 }
    ],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'zz', fromSide: 'middle', color: 'red' }]
  };
  const p = CL.validateCanvas(bad).join('|');
  [
    '必須是整數',
    'id 重複',
    'type 不合法',
    '缺少 file',
    'toNode 不存在',
    'fromSide 不合法',
    'color 不合法'
  ].forEach(k => assert.ok(p.includes(k), k + ' ← ' + p));
});
t('x-parent 檢查與修復：指向不存在、非群組、循環', () => {
  const nodes = [
    N('a', 'group', 0, 0, 10, 10, { 'x-parent': 'b' }),
    N('b', 'group', 0, 0, 10, 10, { 'x-parent': 'a' }),
    N('c', 'text', 0, 0, 10, 10, { 'x-parent': 'zz' }),
    N('d', 'text', 0, 0, 10, 10, { 'x-parent': 'c' })
  ];
  assert.ok(CL.parentProblems(nodes).length >= 3);
  assert.deepStrictEqual(CL.parentProblems(CL.fixParents(nodes)), []);
});
t('三方合併：兩邊改不同卡片都保留；只一邊動就採用該邊；新增、刪除正確', () => {
  const base = board([
    N('a', 'text', 0, 0, 100, 50),
    N('b', 'text', 200, 0, 100, 50),
    N('c', 'text', 400, 0, 100, 50)
  ]);
  const mine = board([
    Object.assign(N('a', 'text', 0, 0, 100, 50), { x: 10 }),
    N('b', 'text', 200, 0, 100, 50),
    N('c', 'text', 400, 0, 100, 50),
    N('mine', 'text', 0, 300, 100, 50)
  ]);
  const theirs = board([
    N('a', 'text', 0, 0, 100, 50),
    Object.assign(N('b', 'text', 200, 0, 100, 50), { y: 99 }),
    N('theirNew', 'text', 0, 500, 100, 50)
  ]); // 對方刪了 c
  const r = CL.mergeBoards(base, mine, theirs),
    by = CL.byId(r.board.nodes);
  assert.strictEqual(by.a.x, 10);
  assert.strictEqual(by.b.y, 99);
  assert.ok(by.mine && by.theirNew);
  assert.ok(!by.c);
  assert.strictEqual(r.conflicts, 0);
});
t('三方合併：兩邊改同一張卡片＝衝突，採用我的並計數；一邊刪、一邊改則保留被改的', () => {
  const base = board([N('a', 'text', 0, 0, 100, 50), N('b', 'text', 200, 0, 100, 50)]);
  const mine = board([Object.assign(N('a', 'text', 0, 0, 100, 50), { text: 'mine' })]); // 我刪了 b、改了 a
  const theirs = board([
    Object.assign(N('a', 'text', 0, 0, 100, 50), { text: 'theirs' }),
    Object.assign(N('b', 'text', 200, 0, 100, 50), { text: 'edited' })
  ]);
  const r = CL.mergeBoards(base, mine, theirs),
    by = CL.byId(r.board.nodes);
  assert.strictEqual(by.a.text, 'mine');
  assert.strictEqual(by.b.text, 'edited');
  assert.strictEqual(r.conflicts, 2);
});
t('三方合併：連到已刪卡片的線被清掉；未知頂層欄位與 x- 欄位保留', () => {
  const base = {
    'x-t': 1,
    nodes: [N('a', 'text', 0, 0, 10, 10), N('b', 'text', 50, 0, 10, 10)],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }]
  };
  const mine = Object.assign({}, base, { nodes: [base.nodes[0]], edges: [] });
  const theirs = Object.assign({}, base, {
    'x-t': 1,
    extra: 'keep',
    edges: [{ id: 'e', fromNode: 'a', toNode: 'b', label: 'x' }]
  });
  const r = CL.mergeBoards(base, mine, theirs);
  assert.strictEqual(r.board.extra, 'keep');
  assert.ok(r.board.edges.every(e => CL.byId(r.board.nodes)[e.fromNode] && CL.byId(r.board.nodes)[e.toNode]));
});
t('YouTube：各種網址取出 11 碼 id；其他網站與可疑網址不嵌入', () => {
  [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?t=3',
    'https://m.youtube.com/watch?feature=x&v=dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ?si=abc',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?si=x&v=dQw4w9WgXcQ&t=5',
    'https://youtu.be/dQw4w9WgXcQ/'
  ].forEach(u => assert.strictEqual(CL.youtubeId(u), 'dQw4w9WgXcQ', u));
  [
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)',
    'https://www.youtube.com/watch?v=short'
  ].forEach(u => assert.strictEqual(CL.youtubeId(u), null, u));
});
t('網址與顏色：只接受 http(s)；顏色只接受 1–6 或 #rrggbb', () => {
  assert.ok(CL.safeUrl('https://a.b/c'));
  ['javascript:alert(1)', 'data:text/html,x', 'ftp://x', ' ', '', 'https://a b'].forEach(u =>
    assert.strictEqual(CL.safeUrl(u), null, u)
  );
  assert.strictEqual(CL.colorOf('1'), CL.PRESET['1']);
  assert.strictEqual(CL.colorOf('#AABBCC'), '#AABBCC');
  ['7', 'red', 'url(x)', '#fff', 'expression(1)', 5, null].forEach(c =>
    assert.strictEqual(CL.colorOf(c), null, String(c))
  );
});
t('newId：16 碼十六進位、不與既有重複', () => {
  const taken = {};
  for (let i = 0; i < 500; i++) {
    const id = CL.newId(taken);
    assert.ok(/^[0-9a-f]{16}$/.test(id));
    assert.ok(!taken[id]);
    taken[id] = 1;
  }
});
t('300 張卡片：可見範圍篩選與連線幾何在 50 ms 內（純邏輯）', () => {
  const nodes = [];
  for (let i = 0; i < 300; i++)
    nodes.push(N('n' + i, 'text', (i % 20) * 300, Math.floor(i / 20) * 200, 260, 120));
  const edges = nodes.slice(1).map((x, i) => ({ id: 'e' + i, fromNode: 'n' + i, toNode: x.id }));
  const map = CL.byId(nodes),
    t0 = Date.now();
  for (let r = 0; r < 20; r++) {
    CL.visibleNodes(nodes, { x: r * 100, y: 0, w: 1600, h: 900 });
    edges.forEach(e => CL.edgeGeom(map[e.fromNode], map[e.toNode], e));
  }
  assert.ok(Date.now() - t0 < 500, '20 次完整計算花了 ' + (Date.now() - t0) + ' ms');
});
t('收合：子孫隱藏、群組縮成小方塊、計數正確（巢狀只由最外層收合者負責）', () => {
  const nodes = [
    N('g1', 'group', 0, 0, 800, 600, { 'x-collapsed': true }),
    N('g2', 'group', 50, 50, 300, 200, { 'x-parent': 'g1' }),
    N('c', 'text', 60, 60, 100, 50, { 'x-parent': 'g2' }),
    N('d', 'text', 400, 60, 100, 50, { 'x-parent': 'g1' }),
    N('o', 'text', 900, 0, 100, 50)
  ];
  const info = CL.collapseInfo(nodes);
  assert.deepStrictEqual(Object.keys(info.hidden).sort(), ['c', 'd', 'g2']);
  assert.strictEqual(info.count.g1, 3);
  assert.strictEqual(info.redirect.c, 'g1');
  const eff = CL.effectiveNodes(nodes, info),
    g = eff.find(x => x.id === 'g1');
  assert.deepStrictEqual([g.width, g.height], [CL.COLL.w, CL.COLL.h]);
  assert.deepStrictEqual(eff.map(x => x.id).sort(), ['g1', 'o']);
  assert.strictEqual(nodes[0].width, 800, '檔案裡的尺寸不變');
});
t('收合：內層群組單獨收合時，外層仍展開；展開後恢復', () => {
  const nodes = [
    N('g1', 'group', 0, 0, 800, 600),
    N('g2', 'group', 50, 50, 300, 200, { 'x-parent': 'g1', 'x-collapsed': true }),
    N('c', 'text', 60, 60, 100, 50, { 'x-parent': 'g2' }),
    N('d', 'text', 400, 60, 100, 50, { 'x-parent': 'g1' })
  ];
  const info = CL.collapseInfo(nodes);
  assert.deepStrictEqual(Object.keys(info.hidden), ['c']);
  assert.strictEqual(info.redirect.c, 'g2');
  const b = CL.toggleCollapsed({ nodes, edges: [] }, 'g2');
  assert.strictEqual(b.nodes[1]['x-collapsed'], false);
  assert.deepStrictEqual(Object.keys(CL.collapseInfo(b.nodes).hidden), []);
  const b2 = CL.toggleCollapsed(b, 'g1');
  assert.strictEqual(b2.nodes[0]['x-collapsed'], true);
  assert.strictEqual(CL.collapseInfo(b2.nodes).count.g1, 3);
});
t('收合：收合的群組不接收新成員；以小方塊中心判斷自己的歸屬；其餘欄位不動', () => {
  const nodes = [
    N('g', 'group', 0, 0, 600, 400, { 'x-collapsed': true, 'x-keep': 1 }),
    N('c', 'text', 300, 300, 100, 50)
  ];
  assert.strictEqual(
    parentOf(CL.assignParents(nodes, ['c']), 'c'),
    undefined,
    '落在收合群組的原範圍內也不加入'
  );
  assert.strictEqual(CL.toggleCollapsed({ nodes, edges: [] }, 'g').nodes[0]['x-keep'], 1);
  const o = [
    N('big', 'group', 0, 0, 2000, 1000),
    N('cg', 'group', 100, 100, 800, 600, { 'x-collapsed': true })
  ];
  assert.strictEqual(parentOf(CL.assignParents(o, ['cg']), 'cg'), 'big');
});
t('收合後的檔案仍符合 JSON Canvas（x-collapsed 是自訂欄位，Obsidian 忽略）', () => {
  const b = CL.prepareForSave(
    CL.toggleCollapsed({ nodes: [N('g', 'group', 0, 0, 100, 100)], edges: [] }, 'g')
  );
  assert.deepStrictEqual(CL.validateCanvas(b), []);
  assert.strictEqual(b.nodes[0]['x-collapsed'], true);
});

console.log('\n畫布邏輯：' + n + ' 項全部通過');
