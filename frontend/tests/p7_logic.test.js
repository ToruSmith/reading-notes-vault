// P7 純邏輯：對齊吸附、對齊與等距、複製貼上、搜尋
const CL = require('../canvaslogic.js'),
  OP = require('../canvasops.js'),
  assert = require('assert');
let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('通過  ' + name);
};
const N = (id, x, y, w, h, ex) =>
  Object.assign({ id, type: 'text', text: id, x, y, width: w || 100, height: h || 50 }, ex || {});

t('snapMove：6 單位內吸附到最近的邊／中線，並回傳對齊線；超過不吸附；按位移計算不改輸入', () => {
  const lines = OP.snapLines([N('a', 0, 0, 100, 50)]);
  let r = OP.snapMove({ x: 300, y: 300, w: 80, h: 40 }, lines, -296, -100, 6); // 左邊到 4 → 吸到 0
  assert.strictEqual(r.dx, -300);
  assert.strictEqual(r.dy, -100);
  assert.ok(r.gx.some(g => g.x === 0 && g.y1 === 0 && g.y2 === 240));
  r = OP.snapMove({ x: 300, y: 300, w: 80, h: 40 }, lines, -150, -100, 6);
  assert.strictEqual(r.dx, -150);
  assert.strictEqual(r.gx.length, 0);
  r = OP.snapMove({ x: 0, y: 300, w: 100, h: 40 }, lines, 2, -277, 6); // 中線 x=52 → 50；上邊 23 → 25（中線）
  assert.strictEqual(r.dx, 0);
  assert.strictEqual(r.dy, -275);
  assert.ok(r.gy.some(g => g.y === 25));
});

t('snapResize：只吸附右邊與下邊', () => {
  const lines = OP.snapLines([N('a', 0, 0, 100, 50)]);
  const r = OP.snapResize({ x: 20, y: 100 }, lines, 83, 40, 6);
  assert.strictEqual(r.w, 80);
  assert.strictEqual(r.h, 40);
  assert.ok(r.gx.some(g => g.x === 100));
});

t('alignNodes：靠左／靠右／置中／靠上；群組帶著成員；不足 2 張原樣回傳；結果都是整數', () => {
  const nodes = [
    N('a', 10, 0),
    N('b', 50, 100, 200),
    N('g', 300, 300, 300, 200, { type: 'group', label: 'G' }),
    N('c', 320, 340, 100, 50, { 'x-parent': 'g' })
  ];
  let o = OP.alignNodes(nodes, ['a', 'b', 'g'], 'left');
  const m = CL.byId(o);
  assert.deepStrictEqual([m.a.x, m.b.x, m.g.x, m.c.x], [10, 10, 10, 30]);
  assert.strictEqual(m.c['x-parent'], 'g');
  o = CL.byId(OP.alignNodes(nodes, ['a', 'b'], 'right'));
  assert.strictEqual(o.a.x + o.a.width, 250);
  assert.strictEqual(o.b.x, 50);
  o = CL.byId(OP.alignNodes(nodes, ['a', 'b'], 'hcenter'));
  assert.strictEqual(o.a.x + 50, o.b.x + 100);
  o = CL.byId(OP.alignNodes(nodes, ['a', 'b'], 'top'));
  assert.strictEqual(o.b.y, 0);
  assert.strictEqual(OP.alignNodes(nodes, ['a'], 'left'), nodes);
  assert.strictEqual(OP.alignNodes(nodes, ['a', 'b'], 'hdist'), nodes);
  assert.strictEqual(OP.alignNodes(nodes, ['a', 'b'], 'evil'), nodes);
  o = OP.alignNodes([N('a', 0, 0, 33), N('b', 10, 7, 20)], ['a', 'b'], 'hcenter');
  o.forEach(x => assert.ok(Number.isInteger(x.x) && Number.isInteger(x.y)));
});

t('alignNodes 等距：兩端不動、中間卡片間距相等；選到群組成員與群組本身時只移動群組', () => {
  const o = CL.byId(
    OP.alignNodes([N('a', 0, 0, 100), N('b', 130, 0, 100), N('c', 500, 0, 100)], ['c', 'a', 'b'], 'hdist')
  );
  assert.deepStrictEqual([o.a.x, o.b.x, o.c.x], [0, 250, 500]);
  const v = CL.byId(
    OP.alignNodes(
      [N('a', 0, 0, 100, 50), N('b', 0, 60, 100, 100), N('c', 0, 400, 100, 50)],
      ['a', 'b', 'c'],
      'vdist'
    )
  );
  assert.strictEqual(v.b.y - (v.a.y + 50), v.c.y - (v.b.y + 100));
  const g = [
    N('g', 0, 0, 300, 200, { type: 'group' }),
    N('m', 20, 40, 100, 50, { 'x-parent': 'g' }),
    N('z', 500, 500)
  ];
  const r = CL.byId(OP.alignNodes(g, ['g', 'm', 'z'], 'top'));
  assert.strictEqual(r.z.y, 0);
  assert.strictEqual(r.m.y, 40);
});

t('alignNodes：卡片被對齊出群組範圍會脫離群組；對齊進群組會加入', () => {
  const nodes = [
    N('g', 0, 0, 300, 200, { type: 'group' }),
    N('a', 20, 40, 100, 50, { 'x-parent': 'g' }),
    N('b', 20, 900)
  ];
  const o = CL.byId(OP.alignNodes(nodes, ['a', 'b'], 'bottom'));
  assert.strictEqual(o.a['x-parent'], undefined);
  const p = CL.byId(OP.alignNodes(nodes, ['a', 'b'], 'top'));
  assert.strictEqual(p.b['x-parent'], 'g');
});

t('copyFragment：群組連同成員；只帶兩端都在內的連線；指向外部的 x-parent 拿掉；不改原畫布', () => {
  const b = {
    nodes: [
      N('g', 0, 0, 300, 200, { type: 'group' }),
      N('a', 10, 40, 100, 50, { 'x-parent': 'g' }),
      N('h', 0, 0, 900, 900, { type: 'group' }),
      N('b', 400, 0, 100, 50, { 'x-parent': 'h' }),
      N('c', 800, 800)
    ],
    edges: [
      { id: 'e1', fromNode: 'a', toNode: 'b' },
      { id: 'e2', fromNode: 'a', toNode: 'c' },
      { id: 'e3', fromNode: 'g', toNode: 'b' }
    ]
  };
  const before = JSON.stringify(b),
    f = OP.copyFragment(b, ['g', 'b']);
  assert.deepStrictEqual(
    f.nodes.map(x => x.id),
    ['g', 'a', 'b']
  );
  assert.deepStrictEqual(
    f.edges.map(e => e.id),
    ['e1', 'e3']
  );
  assert.strictEqual(f.nodes.find(x => x.id === 'b')['x-parent'], undefined);
  assert.strictEqual(f.nodes.find(x => x.id === 'a')['x-parent'], 'g');
  assert.strictEqual(JSON.stringify(b), before);
});

t(
  'pasteFragment：全部換新 id、連線跟著換、x-parent 只留片段內、移到指定位置；貼兩次互不衝突；進到畫布上的群組',
  () => {
    const board = { nodes: [N('host', 1000, 1000, 450, 400, { type: 'group' })], edges: [] };
    const frag = {
      nodes: [
        N('g', 0, 0, 300, 200, { type: 'group' }),
        N('a', 10, 40, 100, 50, { 'x-parent': 'g', 'x-custom': { k: 1 } }),
        N('b', 400, 0, 100, 50, { 'x-parent': 'zzz' })
      ],
      edges: [
        { id: 'e', fromNode: 'a', toNode: 'b', label: 'L' },
        { id: 'x', fromNode: 'a', toNode: 'nope' }
      ]
    };
    const r1 = OP.pasteFragment(board, frag, { x: 1050, y: 1050 }),
      m = CL.byId(r1.board.nodes);
    assert.strictEqual(r1.ids.length, 3);
    r1.ids.forEach(id => assert.ok(!['g', 'a', 'b'].includes(id)));
    const [g, a, b] = r1.ids.map(id => m[id]);
    assert.deepStrictEqual([g.x, g.y, a.x, a.y], [1050, 1050, 1060, 1090]);
    assert.strictEqual(a['x-parent'], g.id);
    assert.deepStrictEqual(a['x-custom'], { k: 1 });
    assert.strictEqual(g['x-parent'], 'host');
    assert.strictEqual(b['x-parent'], undefined, 'b 的中心在 host 外');
    assert.strictEqual(r1.board.edges.length, 1);
    assert.deepStrictEqual(
      [r1.board.edges[0].fromNode, r1.board.edges[0].toNode, r1.board.edges[0].label],
      [a.id, b.id, 'L']
    );
    const r2 = OP.pasteFragment(r1.board, frag, { x: 0, y: 0 });
    const ids = r2.board.nodes.map(x => x.id);
    assert.strictEqual(new Set(ids).size, ids.length);
    assert.strictEqual(new Set(r2.board.edges.map(e => e.id)).size, 2);
    assert.deepStrictEqual(CL.validateCanvas(r2.board), []);
    assert.strictEqual(board.nodes.length, 1, '不改輸入');
  }
);

t(
  'parseFragment：JSON Canvas 照用（上限 500 張、未知型別剔除）；網址→連結卡；文字→文字卡；空白、陣列、壞 JSON 安全處理',
  () => {
    const f = OP.parseFragment(
      JSON.stringify({ nodes: [N('a', 0, 0), { id: 'x', type: 'script', x: 0, y: 0 }], edges: [] })
    );
    assert.deepStrictEqual(
      f.nodes.map(x => x.id),
      ['a']
    );
    const big = OP.parseFragment(
      JSON.stringify({ nodes: Array.from({ length: 900 }, (_, i) => N('n' + i, i, 0)) })
    );
    assert.strictEqual(big.nodes.length, 500);
    assert.strictEqual(OP.parseFragment('https://example.com/a?b=1').nodes[0].type, 'link');
    assert.strictEqual(OP.parseFragment('javascript:alert(1)').nodes[0].type, 'text');
    assert.strictEqual(OP.parseFragment('see https://example.com').nodes[0].type, 'text');
    assert.strictEqual(OP.parseFragment('   '), null);
    assert.strictEqual(OP.parseFragment('{"nodes": [}').nodes[0].type, 'text');
    assert.strictEqual(OP.parseFragment('[1,2]').nodes[0].type, 'text');
    assert.strictEqual(OP.parseFragment('x'.repeat(30000)).nodes[0].text.length, 20000);
    assert.strictEqual(OP.parseFragment(JSON.stringify({ nodes: [] })), null);
  }
);

t(
  'parseFragment：不安全的卡片被剔除（javascript: 網址、非標準檔案路徑），x-preview 重新清洗，超長文字截斷',
  () => {
    const f = OP.parseFragment(
      JSON.stringify({
        nodes: [
          { id: 'a', type: 'link', url: 'javascript:alert(1)', x: 0, y: 0, width: 100, height: 100 },
          {
            id: 'b',
            type: 'link',
            url: ' https://ok.example/x ',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            'x-preview': { title: 'T', image: 'http://evil/i.gif', description: 5 }
          },
          { id: 'c', type: 'file', file: '../../etc/passwd', x: 0, y: 0, width: 100, height: 100 },
          { id: 'd', type: 'file', file: 'notes/20261024-n001.md', x: 0, y: 0, width: 100, height: 100 },
          { id: 'e', type: 'file', file: 'assets/20261024-ab.svg', x: 0, y: 0, width: 100, height: 100 },
          { id: 'f', type: 'text', text: 123, x: 0, y: 0, width: 1, height: 1 },
          { id: 'g', type: 'text', text: 'x'.repeat(30000), x: 0, y: 0, width: 100, height: 100 }
        ]
      })
    );
    assert.deepStrictEqual(
      f.nodes.map(x => x.id),
      ['b', 'd', 'e', 'g']
    );
    assert.strictEqual(f.nodes[0].url, 'https://ok.example/x');
    assert.deepStrictEqual(f.nodes[0]['x-preview'], { title: 'T', description: '', image: '', site: '' });
    assert.strictEqual(f.nodes[3].text.length, 20000);
    assert.strictEqual(
      OP.parseFragment(
        JSON.stringify({
          nodes: [{ id: 'a', type: 'link', url: 'javascript:1', x: 0, y: 0, width: 1, height: 1 }]
        })
      ),
      null
    );
  }
);

t('searchNodes：不分大小寫、多關鍵字都要符合、依閱讀順序', () => {
  const nodes = [
    N('a', 500, 0, 100, 50, { text: 'Database 設計' }),
    N('b', 0, 300, 100, 50, { text: 'database index' }),
    N('c', 0, 0, 100, 50, { text: 'DB' }),
    N('d', 0, 10, 100, 50, { text: 'database' })
  ];
  assert.deepStrictEqual(
    OP.searchNodes(nodes, 'DATABASE', x => x.text),
    ['d', 'a', 'b']
  );
  assert.deepStrictEqual(
    OP.searchNodes(nodes, 'database index', x => x.text),
    ['b']
  );
  assert.deepStrictEqual(
    OP.searchNodes(nodes, '  ', x => x.text),
    []
  );
});

t('adjacentPos／sideToward／oppositeSide：新卡片貼在指定邊外側並置中；放開點判斷方向；對邊', () => {
  const n0 = { x: 100, y: 100, width: 200, height: 100 };
  assert.deepStrictEqual(OP.adjacentPos(n0, 'right', [240, 120], 80), { x: 380, y: 90 });
  assert.deepStrictEqual(OP.adjacentPos(n0, 'left', [240, 120], 80), { x: -220, y: 90 });
  assert.deepStrictEqual(OP.adjacentPos(n0, 'top', [240, 120], 80), { x: 80, y: -100 });
  assert.deepStrictEqual(OP.adjacentPos(n0, 'bottom', [240, 120], 80), { x: 80, y: 280 });
  assert.strictEqual(OP.sideToward(n0, 900, 160), 'right');
  assert.strictEqual(OP.sideToward(n0, -500, 150), 'left');
  assert.strictEqual(OP.sideToward(n0, 200, 900), 'bottom');
  assert.strictEqual(OP.sideToward(n0, 210, -400), 'top');
  assert.deepStrictEqual(['top', 'right', 'bottom', 'left', 'x'].map(OP.oppositeSide), [
    'bottom',
    'left',
    'top',
    'right',
    'top'
  ]);
});

t('fontSizeOf／parseFragment：只認 s／m／l／xl，其他回到 m，貼上時無效值被拿掉', () => {
  assert.deepStrictEqual([{ 'x-fontsize': 'l' }, { 'x-fontsize': 'huge' }, {}, null].map(OP.fontSizeOf), [
    'l',
    'm',
    'm',
    'm'
  ]);
  const f = OP.parseFragment(
    JSON.stringify({
      nodes: [
        { id: 'a', type: 'text', text: 'x', 'x-fontsize': 'xl', x: 0, y: 0, width: 10, height: 10 },
        {
          id: 'b',
          type: 'text',
          text: 'y',
          'x-fontsize': '99px;color:red',
          x: 0,
          y: 0,
          width: 10,
          height: 10
        }
      ]
    })
  );
  assert.strictEqual(f.nodes[0]['x-fontsize'], 'xl');
  assert.strictEqual(f.nodes[1]['x-fontsize'], undefined);
});

t('thinPoints／strokePath：去掉太近的點但保留頭尾；單點、兩點、多點的路徑格式', () => {
  assert.deepStrictEqual(
    OP.thinPoints(
      [
        [0, 0],
        [0.5, 0],
        [1, 0],
        [5, 0],
        [5.2, 0]
      ],
      2
    ),
    [
      [0, 0],
      [5, 0],
      [5.2, 0]
    ]
  );
  assert.strictEqual(OP.strokePath([[1, 2]]), 'M1 2l0.01 0');
  assert.strictEqual(
    OP.strokePath([
      [1, 2],
      [3, 4]
    ]),
    'M1 2L3 4'
  );
  assert.strictEqual(
    OP.strokePath([
      [0, 0],
      [10, 0],
      [20, 10]
    ]),
    'M0 0Q10 0 15 5L20 10'
  );
  assert.strictEqual(OP.strokePath([]), '');
});

t(
  'buildDrawingSvg：裁到筆跡範圍加邊距、有 viewBox、白底可選；只收 #rrggbb 色與限制線寬；大小縮到 maxSide；沒筆跡回傳 null；輸出通過後端 SVG 檢查',
  () => {
    assert.strictEqual(OP.buildDrawingSvg([]), null);
    assert.strictEqual(OP.buildDrawingSvg([{ pts: [] }]), null);
    const r = OP.buildDrawingSvg(
      [
        {
          pts: [
            [100, 100],
            [160, 120],
            [220, 100]
          ],
          color: '#d64545',
          w: 4
        },
        {
          pts: [
            [100, 200],
            [300, 200]
          ],
          color: 'red;"onload="x',
          w: 999,
          op: 0.35
        }
      ],
      { bg: '#ffffff', maxSide: 200 }
    );
    assert.ok(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="\d+ \d+ \d+ \d+">/.test(r.svg));
    assert.ok(r.svg.includes('<rect'));
    assert.ok(r.svg.includes('stroke="#d64545"'));
    assert.ok(!/onload|red;/.test(r.svg));
    assert.ok(
      r.svg.includes('stroke="#1f1f1f"') &&
        r.svg.includes('stroke-width="40"') &&
        r.svg.includes('stroke-opacity="0.35"')
    );
    assert.ok(Math.max(r.width, r.height) <= 200 && r.width >= 120);
    assert.ok(!OP.buildDrawingSvg([{ pts: [[0, 0]], color: '#000000', w: 3 }]).svg.includes('<rect'));
    const vm = require('vm'),
      fs = require('fs'),
      path = require('path'),
      ctx = vm.createContext({ console });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'backend', 'Svg.gs'), 'utf8'), ctx);
    const chk = vm.runInContext('sanitizeSvg_', ctx)(r.svg);
    assert.strictEqual(chk.ok, true);
    assert.strictEqual(
      chk.svg.replace(/\s/g, ''),
      r.svg.replace(/\s/g, ''),
      '產出的 SVG 不需要被清除任何東西'
    );
  }
);

t('strokeAt：橡皮擦找最上面被碰到的一筆（含線段中間），沒碰到回傳 -1', () => {
  const ss = [
    {
      pts: [
        [0, 0],
        [100, 0]
      ],
      w: 4
    },
    {
      pts: [
        [50, -30],
        [50, 30]
      ],
      w: 4
    }
  ];
  assert.strictEqual(OP.strokeAt(ss, 50, 0, 3), 1);
  assert.strictEqual(OP.strokeAt(ss, 20, 2, 3), 0);
  assert.strictEqual(OP.strokeAt(ss, 20, 40, 3), -1);
});

t('連線文字：大小與位置的白名單；置中＝曲線中點（與舊版一致）、靠起點／終點在兩側；zipKind 認得圖片', () => {
  const g = CL.edgeGeom(N('a', 0, 0, 100, 50), N('b', 400, 200, 100, 50), {});
  assert.strictEqual(CL.labelSizeOf({}), 'm');
  assert.strictEqual(CL.labelSizeOf({ 'x-labelsize': 'l' }), 'l');
  assert.strictEqual(CL.labelSizeOf({ 'x-labelsize': '<b>' }), 'm');
  assert.strictEqual(CL.labelSizeOf({ 'x-labelsize': 'xl' }), 'm');
  assert.strictEqual(CL.labelPosOf({ 'x-labelpos': 'end' }), 'end');
  assert.strictEqual(CL.labelPosOf({ 'x-labelpos': 'x' }), 'mid');
  const m = CL.labelPoint(g, {}),
    s = CL.labelPoint(g, { 'x-labelpos': 'start' }),
    e = CL.labelPoint(g, { 'x-labelpos': 'end' });
  assert.ok(Math.abs(m.x - g.mid.x) < 1e-6 && Math.abs(m.y - g.mid.y) < 1e-6);
  assert.ok(s.x < m.x && m.x < e.x);
  const L = require('../logic.js');
  assert.deepStrictEqual(L.zipKind('assets/20261022-abc.jpg'), {
    kind: 'image',
    id: '20261022-abc',
    ext: 'jpg'
  });
  assert.strictEqual(L.zipKind('assets/20261022-abc.gif').kind, null);
});
t('貼上片段：接受圖片卡路徑，拒絕其他副檔名', () => {
  const frag = OP.parseFragment(
    JSON.stringify({
      nodes: [
        { id: 'a', type: 'file', file: 'assets/20261022-abc.img', x: 0, y: 0, width: 9, height: 9 },
        { id: 'b', type: 'file', file: 'assets/20261022-abc.png', x: 0, y: 0, width: 9, height: 9 }
      ],
      edges: []
    })
  );
  assert.deepStrictEqual(
    frag.nodes.map(x => x.id),
    ['a']
  );
});

t('簡報順序：有群組一個群組一頁（上到下、左到右），沒群組逐張卡片；巢狀群組不單獨成頁', () => {
  const g = (id, x, y) => ({ id, type: 'group', label: id, x, y, width: 300, height: 200 });
  const o = OP.slideOrder([
    g('B', 400, 0),
    g('A', 0, 0),
    g('C', 0, 300),
    N('t1', 10, 10, 50, 50, { 'x-parent': 'A' }),
    g('In', 20, 20, {}),
    N('free', 900, 900)
  ]);
  assert.deepStrictEqual(
    o.map(x => x.id),
    ['A', 'B', 'In', 'C']
  ); // In 沒有 x-parent，視為最外層（y=20 排在 B 之後）
  assert.deepStrictEqual(
    OP.slideOrder([N('b', 100, 0), N('a', 0, 0), N('c', 0, 100)]).map(x => x.id),
    ['a', 'b', 'c']
  );
  assert.deepStrictEqual(OP.slideOrder([]), []);
});
t('群組轉大綱：依位置排序、子群組縮排、空內容略過、標題單行', () => {
  const nodes = [
    { id: 'G', type: 'group', label: '第一章\n  概念', x: 0, y: 0, width: 800, height: 800 },
    N('b', 300, 10, 50, 50, { 'x-parent': 'G', text: 'B' }),
    N('a', 10, 10, 50, 50, { 'x-parent': 'G', text: 'A' }),
    { id: 'H', type: 'group', label: '子', x: 10, y: 300, width: 300, height: 300, 'x-parent': 'G' },
    N('c', 20, 320, 50, 50, { 'x-parent': 'H' }),
    N('e', 400, 400, 50, 50, { 'x-parent': 'G' })
  ];
  const md = OP.groupOutline(nodes, 'G', n => (n.id === 'e' ? '' : n.id.toUpperCase() + '\n第二行'));
  assert.strictEqual(md, '# 第一章 概念\n- A\n  第二行\n- B\n  第二行\n- **子**\n  - C\n    第二行\n');
  assert.strictEqual(
    OP.groupOutline(nodes, 'nope', () => ''),
    ''
  );
});
t('畫布轉 SVG：只含安全元素；文字與標籤被跳脫；圖片只收 data: 圖；折行與省略；空畫布回 null', () => {
  const nodes = [
    N('a', 0, 0, 200, 100, { text: '<script>alert(1)</script>' }),
    N('b', 400, 0, 200, 100, { type: 'file', file: 'assets/20261022-abc.img' }),
    { id: 'g', type: 'group', label: '"><img src=x>', x: -50, y: -50, width: 800, height: 300 }
  ];
  const edges = [{ id: 'e', fromNode: 'a', toNode: 'b', label: '<b>&', 'x-labelsize': 'l' }];
  const info = n =>
    n.id === 'a' ? { title: '<t>', body: n.text } : { img: 'data:image/png;base64,iVBORw0KGgo=' };
  const r = OP.buildBoardSvg(nodes, edges, info);
  assert.ok(r && r.width > 600 && /^<svg /.test(r.svg));
  assert.ok(!/<script|<img|javascript:|onload|<foreignObject|http:\/\/(?!www\.w3\.org)/i.test(r.svg), r.svg);
  assert.ok(
    r.svg.includes('&lt;b&gt;&amp;') && r.svg.includes('font-size="20"') && r.svg.includes('<image ')
  );
  const bad = OP.buildBoardSvg([nodes[1]], [], () => ({ img: 'https://evil.com/x.png' }));
  assert.ok(!/<image /.test(bad.svg) && !/evil/.test(bad.svg));
  const w = OP.wrapText('一二三四五六七八九十', 40, 10, 2);
  assert.strictEqual(w.length, 2);
  assert.ok(/…$/.test(w[1]));
  assert.strictEqual(
    OP.buildBoardSvg([], [], () => ({})),
    null
  );
  assert.strictEqual(OP.plainText('# 標題\n- [連結](http://x.com) ![圖](a.png) **粗**'), '標題\n• 連結  粗');
});

console.log('\nP7 純邏輯：' + n + ' 項全部通過');
