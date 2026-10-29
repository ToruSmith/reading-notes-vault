// P6 純邏輯：預覽資料檢查、圖片網址判斷、自動排版
const CL = require('../canvaslogic.js'),
  assert = require('assert');
let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('通過  ' + name);
};
const J = o => JSON.parse(JSON.stringify(o));

t('isImageUrl／ytThumb：只認 https 的圖片副檔名（忽略查詢字串）；縮圖網址只接受 11 碼 id', () => {
  assert.ok(CL.isImageUrl('https://a.com/x.PNG'));
  assert.ok(CL.isImageUrl('https://a.com/x.webp?size=2#t'));
  [
    'http://a.com/x.png',
    'https://a.com/x.svg',
    'https://a.com/x.png.html',
    'javascript:alert(1)',
    '',
    'https://a.com/png'
  ].forEach(u => assert.ok(!CL.isImageUrl(u), u));
  assert.strictEqual(CL.ytThumb('dQw4w9WgXcQ'), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  ['', 'abc', 'x"onerror=1', null].forEach(v => assert.strictEqual(CL.ytThumb(v), ''));
});

t('safePreview：型別、長度、控制字元；封面只收 https；全空回 null；陣列與非物件回 null', () => {
  assert.strictEqual(CL.safePreview(null), null);
  assert.strictEqual(CL.safePreview([]), null);
  assert.strictEqual(CL.safePreview('x'), null);
  assert.strictEqual(CL.safePreview({ title: 5 }), null);
  const p = CL.safePreview({
    title: 'a\u0000b\nc',
    description: 'd'.repeat(999),
    image: 'http://x.com/a.png',
    site: 's'.repeat(99)
  });
  assert.strictEqual(p.title, 'a b c');
  assert.strictEqual(p.description.length, 240);
  assert.strictEqual(p.image, '');
  assert.strictEqual(p.site.length, 60);
  assert.strictEqual(
    CL.safePreview({ title: 'T', image: 'https://cdn.x.com/a.png' }).image,
    'https://cdn.x.com/a.png'
  );
  assert.strictEqual(CL.safePreview({ title: 'T', image: 'https://x.com/a" onerror="x' }).image, '');
  assert.strictEqual(CL.safePreview({ image: 'javascript:alert(1)' }), null);
});

const note = (id, x, y, parent) =>
  Object.assign(
    { id: 'n' + id, type: 'file', file: 'notes/2026100' + id + '-a.md', x, y, width: 260, height: 170 },
    parent ? { 'x-parent': parent } : {}
  );
const META = {
  n1: { title: 'B 書', date: '2026-10-02', tags: ['程式'] },
  n2: { title: 'A 書', date: '2026-10-01', tags: ['程式', '資料庫'] },
  n3: { title: 'C 書', date: '2026-11-05', tags: [] },
  n4: { title: 'D 圖', date: '', tags: [] }
};
const board = () => ({
  'x-keep': 1,
  nodes: [
    { id: 'g', type: 'group', label: '舊群組', x: 0, y: 0, width: 900, height: 400 },
    note(1, 10, 10, 'g'),
    note(2, 300, 10, 'g'),
    note(3, 2000, 50),
    { id: 'tx', type: 'text', text: '便利貼', x: 5000, y: 0, width: 100, height: 60 },
    { id: 'n4', type: 'file', file: 'assets/20261001-v1.svg', x: 100, y: 800, width: 200, height: 200 }
  ],
  edges: [{ id: 'e', fromNode: 'n1', toNode: 'n2' }]
});
const info = nd => META[nd.id] || { title: nd.file };
const overlap = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

t('排版：網格——不重疊、依日期排、其他卡片與連線不動、舊群組變空後移除、沒有日期的排最後', () => {
  const r = CL.autoLayout(board(), { mode: 'grid', info });
  const files = r.board.nodes.filter(x => x.type === 'file');
  for (let i = 0; i < files.length; i++)
    for (let j = i + 1; j < files.length; j++) assert.ok(!overlap(files[i], files[j]));
  assert.ok(files.every(f => !f['x-parent']));
  assert.ok(!r.board.nodes.some(x => x.id === 'g'), '舊群組變空後應移除');
  const tx = r.board.nodes.find(x => x.id === 'tx');
  assert.strictEqual(tx.x, 5000);
  assert.strictEqual(r.board['x-keep'], 1);
  assert.strictEqual(r.board.edges.length, 1);
  const order = files
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(f => f.id);
  assert.deepStrictEqual(order, ['n2', 'n1', 'n3', 'n4']);
  assert.strictEqual(CL.validateCanvas(r.board).length, 0);
});

t('排版：依標籤——每個標籤一個群組，卡片落在群組內；無標籤歸「未分類」；圖片卡歸「圖片」且排最後', () => {
  const r = CL.autoLayout(board(), { mode: 'tags', info, labels: { none: '未分類', image: '圖片' } });
  const g = r.board.nodes.filter(x => x.type === 'group'),
    by = {};
  g.forEach(x => (by[x.label] = x));
  assert.deepStrictEqual(g.map(x => x.label).sort(), ['圖片', '未分類', '程式'].sort());
  r.board.nodes
    .filter(x => x.type === 'file')
    .forEach(f => {
      const p = g.find(x => x.id === f['x-parent']);
      assert.ok(p, f.id);
      assert.ok(
        f.x >= p.x && f.y >= p.y && f.x + f.width <= p.x + p.width && f.y + f.height <= p.y + p.height,
        f.id + ' 應在群組內'
      );
    });
  assert.strictEqual(r.board.nodes.find(x => x.id === 'n1')['x-parent'], by['程式'].id);
  assert.strictEqual(r.board.nodes.find(x => x.id === 'n4')['x-parent'], by['圖片'].id);
  assert.strictEqual(CL.parentProblems(r.board.nodes).length, 0);
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) assert.ok(!overlap(g[i], g[j]));
});

t('排版：時間軸——依月份由左到右，沒有日期的在最右；只整理選取的卡片時，其他卡片不動', () => {
  const r = CL.autoLayout(board(), { mode: 'timeline', info, labels: { nodate: '未標日期' } });
  const g = r.board.nodes.filter(x => x.type === 'group').sort((a, b) => a.x - b.x);
  assert.deepStrictEqual(
    g.map(x => x.label),
    ['2026-10', '2026-11', '未標日期']
  );
  const only = CL.autoLayout(board(), { mode: 'grid', info, ids: { n3: 1 } });
  assert.strictEqual(only.moved, 1);
  ['n1', 'n2', 'n4'].forEach(id =>
    assert.deepStrictEqual(
      J(only.board.nodes.find(x => x.id === id)),
      J(board().nodes.find(x => x.id === id))
    )
  );
  assert.ok(
    only.board.nodes.some(x => x.id === 'g'),
    '仍有成員的群組要保留'
  );
});

t('排版：加入尚未上畫布的筆記；空畫布也能排；沒有任何卡片時原樣回傳；不改動輸入物件；id 不重複', () => {
  const b0 = board(),
    snapshot = JSON.stringify(b0);
  const r = CL.autoLayout(b0, { mode: 'grid', info, add: ['notes/20261009-z.md', 'notes/20261010-y.md'] });
  assert.strictEqual(JSON.stringify(b0), snapshot);
  assert.strictEqual(r.added, 2);
  assert.strictEqual(r.board.nodes.filter(x => x.type === 'file').length, 6);
  const ids = r.board.nodes.map(x => x.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  const e = CL.autoLayout({ nodes: [], edges: [] }, { mode: 'tags', info, add: ['notes/20261009-z.md'] });
  assert.strictEqual(e.board.nodes.length, 2);
  const none = {
    nodes: [{ id: 'tx', type: 'text', text: 'x', x: 0, y: 0, width: 10, height: 10 }],
    edges: []
  };
  assert.strictEqual(CL.autoLayout(none, { mode: 'grid', info }).board, none);
});

t('排版：200 張卡片的效能與不重疊', () => {
  const nodes = [];
  for (let i = 0; i < 200; i++)
    nodes.push({
      id: 'k' + i,
      type: 'file',
      file: 'notes/20261001-' + i.toString(36).padStart(2, 'a') + '.md',
      x: 0,
      y: 0,
      width: 260,
      height: 170
    });
  const t0 = Date.now(),
    r = CL.autoLayout(
      { nodes, edges: [] },
      {
        mode: 'tags',
        info: nd => ({
          title: nd.id,
          date: '2026-10-0' + (1 + (+nd.id.slice(1) % 9)),
          tags: ['t' + (+nd.id.slice(1) % 7)]
        })
      }
    );
  assert.ok(Date.now() - t0 < 500);
  const files = r.board.nodes.filter(x => x.type === 'file');
  for (let i = 0; i < files.length; i += 7)
    for (let j = i + 1; j < files.length; j++) assert.ok(!overlap(files[i], files[j]));
});
t(
  '排版：連到被移除的舊群組的連線一併移除，不留端點不存在的連線（修正：存檔時曾出現「連線指向不存在的節點」）',
  () => {
    const b = board();
    b.edges.push(
      { id: 'eg', fromNode: 'g', toNode: 'tx', label: '指向群組' },
      { id: 'eg2', fromNode: 'tx', toNode: 'g' }
    );
    const r = CL.autoLayout(b, { mode: 'tags', info, labels: { none: '未分類', image: '圖片' } });
    const ids = new Set(r.board.nodes.map(x => x.id));
    assert.ok(
      r.board.edges.every(e => ids.has(e.fromNode) && ids.has(e.toNode)),
      '不得有失效連線'
    );
    assert.strictEqual(r.droppedEdges, 2);
    assert.ok(
      r.board.edges.some(e => e.id === 'e'),
      '其他連線保留'
    );
    assert.strictEqual(CL.validateCanvas(r.board).length, 0);
  }
);

t('dropDanglingEdges／prepareForSave：移除端點不存在的連線；沒有失效連線時原物件不變', () => {
  const ok = { nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 1, height: 1 }], edges: [] };
  assert.strictEqual(CL.dropDanglingEdges(ok).board, ok);
  const bad = {
    nodes: [
      { id: 'a', type: 'text', x: 0, y: 0, width: 1, height: 1 },
      { id: 'b', type: 'text', x: 0, y: 0, width: 1, height: 1 }
    ],
    edges: [
      { id: '1', fromNode: 'a', toNode: 'b' },
      { id: '2', fromNode: 'a', toNode: 'zz' },
      { id: '3', fromNode: 'q', toNode: 'b' }
    ]
  };
  const r = CL.dropDanglingEdges(bad);
  assert.strictEqual(r.removed, 2);
  assert.deepStrictEqual(
    r.board.edges.map(e => e.id),
    ['1']
  );
  assert.deepStrictEqual(
    CL.prepareForSave(bad).edges.map(e => e.id),
    ['1']
  );
  assert.strictEqual(bad.edges.length, 3, '不改動輸入');
});
t(
  'notionInfo／effPreview：Notion 網址由路徑推出標題；通用的「Notion」標題被取代；非 Notion 不受影響；惡意網址不通過',
  () => {
    const id = '0123456789abcdef0123456789abcdef';
    assert.strictEqual(
      CL.notionInfo('https://www.notion.so/myws/Reading-Plan-2026-' + id).title,
      'Reading Plan 2026'
    );
    assert.strictEqual(CL.notionInfo('https://foo.notion.site/' + id).title, '');
    assert.strictEqual(CL.notionInfo('https://www.notion.so/%E8%AE%80%E6%9B%B8-' + id).title, '讀書');
    [
      'https://example.com/notion.so/x',
      'https://notion.so.evil.com/x',
      'http://notion.so/x',
      'javascript:alert(1)',
      ''
    ].forEach(u => assert.strictEqual(CL.notionInfo(u), null, u));
    const u = 'https://www.notion.so/Plan-' + id;
    assert.strictEqual(
      CL.effPreview(u, {
        title: 'Notion – The all-in-one workspace',
        description: 'x',
        image: 'https://a.com/i.png'
      }).title,
      'Plan'
    );
    assert.strictEqual(CL.effPreview(u, null).site, 'Notion');
    assert.strictEqual(CL.effPreview(u, { title: '我的頁面' }).title, '我的頁面');
    assert.strictEqual(CL.effPreview('https://example.com/a', { title: 'Notion' }).title, 'Notion');
    assert.strictEqual(CL.effPreview('https://example.com/a', null), null);
  }
);
console.log('\nP6 純邏輯：' + n + ' 項全部通過');
