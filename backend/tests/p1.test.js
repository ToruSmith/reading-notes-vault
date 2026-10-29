// P1 後端離線測試：以假儲存層驗證 Core.gs / Svg.gs 的行為。真實 Drive、Sheets 行為需部署後手動驗收。
const vm = require('vm'),
  fs = require('fs'),
  assert = require('assert'),
  path = require('path');
const makeStore = require('./fake_store');
const ctx = vm.createContext({ console, Logger: { log() {} } });
(process.env.BUNDLE
  ? ['Vault_all.gs']
  : ['Yaml.gs', 'Svg.gs', 'Core.gs', 'Sync.gs', 'Code.gs', 'Store.gs']
).forEach(f => vm.runInContext(fs.readFileSync(require('./paths').gsPath(f), 'utf8'), ctx, { filename: f }));
const g = n => vm.runInContext(n, ctx);
const ROUTE = (p, b) => g('routeJson_')(p, b);
const H = (a, p, c, m, s) => JSON.parse(JSON.stringify(g('handle_')(a, p, c, m, s))); // 轉成本地物件，避免跨環境比較問題
const OWNER = { isOwner: true, active: 'me@gmail.com' };
const VISITOR = { isOwner: false, active: '' };
const OTHER = { isOwner: false, active: 'x@gmail.com' };

let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('通過  ' + name);
};

function seed() {
  const s = makeStore();
  s.saveTopic({ id: 'db-design', title: '資料庫設計', defaultPublic: false });
  s.saveTopic({ id: 'journal', title: '日記', defaultPublic: true });
  const fm = (id, title, topic, pub, body) =>
    '---\nid: ' +
    id +
    '\ntitle: ' +
    title +
    '\ntopic: ' +
    topic +
    '\ndate: 2026-10-22\n' +
    (pub === undefined ? '' : 'public: ' + pub + '\n') +
    '---\n' +
    body;
  const save = (id, ...a) => {
    const r = H('saveNote', { id, text: fm(id, ...a) }, OWNER, 'RUN', s);
    assert.strictEqual(r.ok, true, JSON.stringify(r));
  };
  save(
    '20261022-p001',
    '私人筆記標題',
    'db-design',
    undefined,
    'SECRET-BODY-1 ![](assets/20261022-v002.svg)'
  );
  save(
    '20261022-p002',
    '公開但在私人主題',
    'db-design',
    true,
    'PUBLIC-BODY-1 [[20261022-p001]] [[20261022-j001]] [[某個標題]] ![圖](assets/20261022-v001.svg)'
  );
  ['20261022-v001', '20261022-v002'].forEach(id =>
    assert.ok(H('uploadSvg', { id, text: '<svg><rect/></svg>' }, OWNER, 'RUN', s).ok)
  );
  save('20261022-j001', '日記公開', 'journal', undefined, 'PUBLIC-BODY-2');
  save('20261022-j002', '日記私人', 'journal', false, 'SECRET-BODY-2');
  return s;
}
const SECRETS = [
  '私人筆記標題',
  'SECRET-BODY',
  '日記私人',
  '20261022-p001',
  '20261022-j002',
  '20261022-v002',
  'driveFileId',
  '資料庫設計',
  'db-design',
  '.md'
];

/* ───── 公開過濾（規劃書 4.5、6.6） ───── */
t('listIndex：訪客只看到公開筆記（含「私人主題內的公開筆記」與「公開主題的預設公開」）', () => {
  const r = H('listIndex', {}, VISITOR, 'GET', seed());
  assert.strictEqual(
    JSON.stringify(r.items.map(i => i.id).sort()),
    JSON.stringify(['20261022-j001', '20261022-p002'])
  );
});
t('listIndex：私人主題名稱對訪客隱藏（D18）', () => {
  const r = H('listIndex', {}, VISITOR, 'GET', seed());
  assert.strictEqual(r.items.find(i => i.id === '20261022-p002').topic, '');
  assert.strictEqual(r.items.find(i => i.id === '20261022-j001').topic, 'journal');
});
t('listIndex：訪客的 links 只留公開目標，且不含 driveFileId', () => {
  const r = H('listIndex', {}, VISITOR, 'GET', seed());
  const p2 = r.items.find(i => i.id === '20261022-p002');
  assert.strictEqual(JSON.stringify(p2.links), JSON.stringify(['20261022-j001']));
  assert.ok(!('driveFileId' in p2));
});
t('listIndex：擁有者看到全部 4 則', () =>
  assert.strictEqual(H('listIndex', {}, OWNER, 'RUN', seed()).items.length, 4)
);
t('REST GET 一律以訪客處理，即使登入者是擁有者', () =>
  assert.strictEqual(H('listIndex', {}, OWNER, 'GET', seed()).items.length, 2)
);
t('getNote：訪客讀私人與不存在，回應完全相同', () => {
  const s = seed();
  const a = H('getNote', { id: '20261022-p001' }, VISITOR, 'GET', s),
    b = H('getNote', { id: '20261022-zzzz' }, VISITOR, 'GET', s);
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
  assert.strictEqual(a.error, '找不到');
});
t('getNote：公開筆記內指向私人筆記的連結轉成純文字，指向公開的保留', () => {
  const r = H('getNote', { id: '20261022-p002' }, VISITOR, 'GET', seed());
  assert.ok(r.body.includes('（未公開的筆記）'));
  assert.ok(r.body.includes('[[20261022-j001]]'));
  assert.ok(!r.body.includes('20261022-p001'));
});
t('getNote：公開筆記本身可讀，且 meta 不含 source 與私人主題名稱', () => {
  const r = H('getNote', { id: '20261022-p002' }, VISITOR, 'GET', seed());
  assert.ok(r.body.includes('PUBLIC-BODY-1'));
  assert.strictEqual(r.meta.topic, '');
  assert.ok(!('source' in r));
});
t('getNote：擁有者讀得到私人筆記', () =>
  assert.ok(H('getNote', { id: '20261022-p001' }, OWNER, 'RUN', seed()).body.includes('SECRET-BODY-1'))
);
t('非擁有者的 Google 帳號等同訪客', () =>
  assert.strictEqual(H('getNote', { id: '20261022-p001' }, OTHER, 'RUN', seed()).error, '找不到')
);

/* ───── 驗收：以訪客遍歷所有讀取端點，不得出現任何私人內容 ───── */
t('訪客遍歷所有讀取端點與所有 id，回應不含任何私人標題、內文、id、檔名、主題名', () => {
  const s = seed();
  const out = [H('listIndex', {}, VISITOR, 'GET', s), H('whoami', {}, VISITOR, 'GET', s)];
  ['20261022-p001', '20261022-p002', '20261022-j001', '20261022-j002', 'bad', '20261022-zzzz'].forEach(id =>
    out.push(H('getNote', { id }, VISITOR, 'GET', s))
  );
  ['db-design', 'journal', 'nope', '../x'].forEach(topic =>
    out.push(H('getBoard', { topic }, VISITOR, 'GET', s))
  );
  ['20261022-v001', '20261022-v002', '20261022-zzzz', 'bad'].forEach(id =>
    out.push(H('getSvg', { id }, VISITOR, 'GET', s))
  );
  const all = JSON.stringify(out);
  SECRETS.forEach(w => assert.ok(!all.includes(w), '洩漏：' + w));
});

/* ───── source（供重複匯入比對）───── */
t('source：擁有者的索引列有 source，訪客沒有；清空索引後重建仍保留', () => {
  const s = seed();
  H(
    'saveNote',
    { id: '20261030-s001', text: '---\ntitle: 匯入的\ntopic: journal\nsource: 我的筆記.md\n---\nx' },
    OWNER,
    'RUN',
    s
  );
  assert.strictEqual(
    H('listIndex', {}, OWNER, 'RUN', s).items.find(i => i.id === '20261030-s001').source,
    '我的筆記.md'
  );
  assert.ok(!('source' in H('listIndex', {}, VISITOR, 'GET', s).items.find(i => i.id === '20261030-s001')));
  s._clearIndex();
  let c = null;
  do {
    const r = H('rebuildIndex', { cursor: c }, OWNER, 'RUN', s);
    c = r.done ? null : r.cursor;
  } while (c);
  assert.strictEqual(
    H('listIndex', {}, OWNER, 'RUN', s).items.find(i => i.id === '20261030-s001').source,
    '我的筆記.md'
  );
});

/* ───── 匯出（exportBatch、exportAssets）───── */
t('exportBatch／exportAssets：訪客、非擁有者、REST GET 一律被拒', () => {
  const s = seed();
  ['exportBatch', 'exportAssets'].forEach(a =>
    [
      [VISITOR, 'POST'],
      [OTHER, 'RUN'],
      [OWNER, 'GET']
    ].forEach(([c, m]) =>
      assert.strictEqual(JSON.stringify(H(a, {}, c, m, s)), JSON.stringify({ ok: false, error: '無法完成' }))
    )
  );
});
t('exportBatch：分批以最後 id 為游標，剛好讀完全部且不重複；全文與版本號隨附', () => {
  const s = seed();
  const got = [];
  let cursor,
    rounds = 0;
  do {
    const r = H('exportBatch', { cursor, limit: 3 }, OWNER, 'RUN', s);
    assert.ok(r.ok);
    r.notes.forEach(n => {
      got.push(n.id);
      assert.ok(n.text.startsWith('---\nid: ' + n.id) && n.updatedAt);
    });
    cursor = r.cursor;
    rounds++;
  } while (cursor);
  assert.strictEqual(
    JSON.stringify(got),
    JSON.stringify(
      s
        .getIndexRows()
        .map(r => r.id)
        .sort()
    )
  );
  assert.strictEqual(rounds, 2);
});
t('exportBatch：匯出途中新增筆記，不漏讀已讀範圍之後的新筆記；檔案讀不到時列入 missing 而不中斷', () => {
  const s = seed();
  const first = H('exportBatch', { limit: 2 }, OWNER, 'RUN', s);
  H('saveNote', { id: '20271231-zz01', text: '---\ntitle: 之後新增\n---\nx' }, OWNER, 'RUN', s);
  const rest = H('exportBatch', { cursor: first.cursor, limit: 50 }, OWNER, 'RUN', s);
  assert.ok(rest.notes.some(n => n.id === '20271231-zz01'));
  const row = s.getIndexRows().find(r => r.id === '20261022-j002');
  s.files[row.driveFileId].text = undefined;
  delete s.files[row.driveFileId];
  const again = H('exportBatch', { limit: 100 }, OWNER, 'RUN', s);
  assert.deepStrictEqual(Array.from(again.missing), ['20261022-j002']);
});
t('exportAssets：回傳全部 SVG，包含沒被任何筆記引用的孤兒檔', () => {
  const s = seed();
  H('uploadSvg', { id: '20261022-o001', text: '<svg><rect/></svg>' }, OWNER, 'RUN', s);
  const r = H('exportAssets', {}, OWNER, 'RUN', s);
  assert.deepStrictEqual(r.assets.map(a => a.id).sort(), ['20261022-o001', '20261022-v001', '20261022-v002']);
  assert.ok(r.assets.every(a => a.svg.startsWith('<svg')) && r.cursor === null);
});

/* ───── 效能量測（devPerf）───── */
t('runPerf_：量測後完全清除測試資料，索引與原本一致，檔案移至垃圾桶', () => {
  const s = seed();
  const before = JSON.stringify(s.getIndexRows());
  const base = s.getIndexRows().length;
  const real = 20,
    steps = [60, 120];
  const r = JSON.parse(JSON.stringify(g('runPerf_')(() => s, { real, steps })));
  assert.ok(r.ok, r.lines.join('\n'));
  assert.strictEqual(JSON.stringify(s.getIndexRows()), before);
  assert.ok(r.lines.some(l => l.includes('訪客 listIndex @ ' + (base + real) + ' 列')));
  steps.forEach(target =>
    assert.ok(
      r.lines.some(l => l.includes('擁有者 listIndex @ ' + (base + target) + ' 列')),
      r.lines.join('\n')
    )
  );
  assert.ok(r.lines.some(l => l.includes('exportBatch')));
  const perf = Object.keys(s.files).filter(k => s.files[k].name.startsWith('29990101-'));
  assert.strictEqual(perf.length, real);
  assert.ok(perf.every(k => s.files[k].trashed));
});
t('runPerf_：時間不足時略過後面的量測並仍然清除', () => {
  const s = seed();
  const r = JSON.parse(JSON.stringify(g('runPerf_')(() => s, { real: 5, steps: [50], guardMs: -50000 })));
  assert.ok(r.lines.some(l => l.includes('略過 50 列')) && s.getIndexRows().length === 4);
});

/* ───── 主題清單（listIndex）───── */
t('listIndex：訪客只拿到公開主題清單；擁有者拿到全部並含 defaultPublic', () => {
  const s = seed();
  const v = H('listIndex', {}, VISITOR, 'GET', s),
    o = H('listIndex', {}, OWNER, 'RUN', s);
  assert.strictEqual(JSON.stringify(v.topics.map(x => x.id)), JSON.stringify(['journal']));
  assert.ok(!('defaultPublic' in v.topics[0]) && !('driveFileId' in v.topics[0]));
  assert.strictEqual(o.topics.length, 2);
  assert.strictEqual(o.topics.find(x => x.id === 'db-design').defaultPublic, false);
});

/* ───── SVG 讀取（getSvg）───── */
t('getSvg：被公開筆記內文引用的 SVG，訪客讀得到', () =>
  assert.ok(H('getSvg', { id: '20261022-v001' }, VISITOR, 'GET', seed()).svg.startsWith('<svg'))
);
t('getSvg：只被私人筆記引用的 SVG，訪客讀不到，且與不存在的回應相同', () => {
  const s = seed();
  const a = H('getSvg', { id: '20261022-v002' }, VISITOR, 'GET', s),
    b = H('getSvg', { id: '20261022-zzzz' }, VISITOR, 'GET', s);
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
  assert.strictEqual(a.error, '找不到');
});
t('getSvg：擁有者讀得到私人 SVG', () =>
  assert.ok(H('getSvg', { id: '20261022-v002' }, OWNER, 'RUN', seed()).ok)
);
t('getSvg：被公開主題的畫布引用，即視為公開', () => {
  const s = seed();
  H('uploadSvg', { id: '20261022-v003', text: '<svg><rect/></svg>' }, OWNER, 'RUN', s);
  assert.strictEqual(H('getSvg', { id: '20261022-v003' }, VISITOR, 'GET', s).ok, false);
  H(
    'saveBoard',
    {
      topic: 'journal',
      board: {
        nodes: [{ id: 'a', type: 'file', file: 'assets/20261022-v003.svg', x: 0, y: 0, width: 9, height: 9 }],
        edges: []
      }
    },
    OWNER,
    'RUN',
    s
  );
  assert.strictEqual(H('getSvg', { id: '20261022-v003' }, VISITOR, 'GET', s).ok, true);
});
t('getSvg：被私人主題的畫布引用則不公開', () => {
  const s = seed();
  H('uploadSvg', { id: '20261022-v004', text: '<svg><rect/></svg>' }, OWNER, 'RUN', s);
  H(
    'saveBoard',
    {
      topic: 'db-design',
      board: {
        nodes: [{ id: 'a', type: 'file', file: 'assets/20261022-v004.svg', x: 0, y: 0, width: 9, height: 9 }],
        edges: []
      }
    },
    OWNER,
    'RUN',
    s
  );
  assert.strictEqual(H('getSvg', { id: '20261022-v004' }, VISITOR, 'GET', s).ok, false);
});
t('getSvg：封面引用公開筆記的 SVG 即公開；筆記改為私人後立即不公開', () => {
  const s = seed();
  H('uploadSvg', { id: '20261022-v005', text: '<svg><rect/></svg>' }, OWNER, 'RUN', s);
  const row = s.getIndexRows().find(r => r.id === '20261022-j001');
  H(
    'saveNote',
    {
      id: '20261022-j001',
      baseUpdatedAt: row.updatedAt,
      text: '---\ntitle: 日記公開\ntopic: journal\ncover: 20261022-v005\n---\nx'
    },
    OWNER,
    'RUN',
    s
  );
  assert.strictEqual(H('getSvg', { id: '20261022-v005' }, VISITOR, 'GET', s).ok, true);
  const row2 = s.getIndexRows().find(r => r.id === '20261022-j001');
  H(
    'saveNote',
    {
      id: '20261022-j001',
      baseUpdatedAt: row2.updatedAt,
      text: '---\ntitle: 日記公開\ntopic: journal\ncover: 20261022-v005\npublic: false\n---\nx'
    },
    OWNER,
    'RUN',
    s
  );
  assert.strictEqual(H('getSvg', { id: '20261022-v005' }, VISITOR, 'GET', s).ok, false);
});
t('getSvg：清空索引後重建，公開判斷維持一致（svgs 可由內文重建）', () => {
  const s = seed();
  s._clearIndex();
  let c = null;
  do {
    const r = H('rebuildIndex', { cursor: c }, OWNER, 'RUN', s);
    c = r.done ? null : r.cursor;
  } while (c);
  assert.strictEqual(H('getSvg', { id: '20261022-v001' }, VISITOR, 'GET', s).ok, true);
  assert.strictEqual(H('getSvg', { id: '20261022-v002' }, VISITOR, 'GET', s).ok, false);
});

/* ───── 主題寫入（saveTopic）───── */
t('saveTopic：訪客、非擁有者、REST GET 一律被拒', () => {
  const s = seed();
  [
    [VISITOR, 'POST'],
    [OTHER, 'RUN'],
    [OWNER, 'GET']
  ].forEach(([c, m]) =>
    assert.strictEqual(
      JSON.stringify(H('saveTopic', { id: 'x', title: 'X' }, c, m, s)),
      JSON.stringify({ ok: false, error: '無法完成' })
    )
  );
});
t('saveTopic：新增私人主題；欄位不合法被拒並說明', () => {
  const s = seed();
  assert.ok(
    H(
      'saveTopic',
      { id: 'new-topic', title: '新主題', category: '資料庫', status: 'reading' },
      OWNER,
      'RUN',
      s
    ).created
  );
  assert.strictEqual(
    H('listIndex', {}, VISITOR, 'GET', s).topics.some(x => x.id === 'new-topic'),
    false
  );
  assert.ok(H('saveTopic', { id: 'Bad Id', title: '' }, OWNER, 'RUN', s).reasons.length >= 2);
});
t('saveTopic：私人改公開且有「未明確設定」的筆記時，需 confirmPublic 才執行', () => {
  const s = seed();
  const ask = H('saveTopic', { id: 'db-design', title: '資料庫設計', defaultPublic: true }, OWNER, 'RUN', s);
  assert.strictEqual(ask.error, '需要確認');
  assert.strictEqual(ask.affectedNotes, 1);
  assert.strictEqual(H('getNote', { id: '20261022-p001' }, VISITOR, 'GET', s).ok, false); // 沒確認就沒有任何改變
  assert.ok(
    H(
      'saveTopic',
      { id: 'db-design', title: '資料庫設計', defaultPublic: true, confirmPublic: true },
      OWNER,
      'RUN',
      s
    ).ok
  );
  assert.strictEqual(H('getNote', { id: '20261022-p001' }, VISITOR, 'GET', s).ok, true);
});
t('saveTopic：新建公開主題（尚無筆記）與公開改私人都不需確認', () => {
  const s = seed();
  assert.ok(H('saveTopic', { id: 'open-topic', title: '公開', defaultPublic: true }, OWNER, 'RUN', s).ok);
  assert.ok(H('saveTopic', { id: 'journal', title: '日記', defaultPublic: false }, OWNER, 'RUN', s).ok);
  assert.strictEqual(
    H('listIndex', {}, VISITOR, 'GET', s).items.some(i => i.id === '20261022-j001'),
    false
  );
});

/* ───── 畫布 ───── */
function seedBoard(s) {
  const board = {
    nodes: [
      { id: 'g1', type: 'group', label: '私人群組', x: 0, y: 0, width: 400, height: 300 },
      { id: 'g0', type: 'group', label: '原本就空的群組', x: 900, y: 0, width: 100, height: 100 },
      {
        id: 'n1',
        type: 'file',
        file: 'notes/20261022-j001.md',
        x: 500,
        y: 0,
        width: 260,
        height: 140,
        'x-custom': 'keep-me'
      },
      {
        id: 'n2',
        type: 'file',
        file: 'notes/20261022-j002.md',
        x: 20,
        y: 30,
        width: 260,
        height: 140,
        'x-parent': 'g1'
      },
      { id: 'n3', type: 'text', text: '便利貼', x: 500, y: 300, width: 200, height: 100 },
      { id: 'n4', type: 'file', file: 'assets/20261022-v001.svg', x: 0, y: 500, width: 100, height: 100 },
      { id: 'n5', type: 'file', file: '../secret.txt', x: 0, y: 600, width: 100, height: 100 }
    ],
    edges: [
      { id: 'e1', fromNode: 'n1', toNode: 'n2' },
      { id: 'e2', fromNode: 'n1', toNode: 'n3', 'x-style': 'dashed' }
    ],
    'x-unknown-top': { keep: true }
  };
  const r = H('saveBoard', { topic: 'journal', board }, OWNER, 'RUN', s);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  return r.updatedAt;
}
t('getBoard：訪客版移除私人卡片、其連線、因此變空的群組，並保留 x- 欄位與未知欄位', () => {
  const s = seed();
  seedBoard(s);
  const b = H('getBoard', { topic: 'journal' }, VISITOR, 'GET', s).board;
  const ids = b.nodes.map(x => x.id).sort();
  assert.strictEqual(JSON.stringify(ids), JSON.stringify(['g0', 'n1', 'n3', 'n4'])); // g1、n2、n5 被移除；原本就空的 g0 保留
  assert.strictEqual(JSON.stringify(b.edges.map(e => e.id)), JSON.stringify(['e2']));
  assert.strictEqual(b.nodes.find(x => x.id === 'n1')['x-custom'], 'keep-me');
  assert.strictEqual(b.edges[0]['x-style'], 'dashed');
  assert.strictEqual(b['x-unknown-top'].keep, true);
  assert.ok(!JSON.stringify(b).includes('j002') && !JSON.stringify(b).includes('私人群組'));
});
t('getBoard：私人主題的畫布，訪客取不到；擁有者拿到完整畫布', () => {
  const s = seed();
  assert.strictEqual(H('getBoard', { topic: 'db-design' }, VISITOR, 'GET', s).error, '找不到');
  seedBoard(s);
  assert.strictEqual(H('getBoard', { topic: 'journal' }, OWNER, 'RUN', s).board.nodes.length, 7);
});
t('saveBoard：衝突回 409 與伺服器版本，不靜默覆蓋；版本正確則成功', () => {
  const s = seed();
  const v1 = seedBoard(s);
  const bad = H(
    'saveBoard',
    { topic: 'journal', baseUpdatedAt: 'old', board: { nodes: [], edges: [] } },
    OWNER,
    'RUN',
    s
  );
  assert.strictEqual(bad.code, 409);
  assert.strictEqual(bad.server.board.nodes.length, 7);
  assert.strictEqual(
    H('saveBoard', { topic: 'journal', baseUpdatedAt: v1, board: { nodes: [], edges: [] } }, OWNER, 'RUN', s)
      .ok,
    true
  );
});
t('saveBoard：未知欄位原樣寫回；連線指向不存在的節點被拒', () => {
  const s = seed();
  seedBoard(s);
  const f = s.findFileByName('boards', 'journal.canvas.json');
  assert.strictEqual(JSON.parse(s.readText(f.fileId))['x-unknown-top'].keep, true);
  const r = H(
    'saveBoard',
    {
      topic: 'journal',
      baseUpdatedAt: f.updatedAt,
      board: { nodes: [], edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }] }
    },
    OWNER,
    'RUN',
    s
  );
  assert.strictEqual(r.ok, false);
});

/* ───── 寫入、衝突、去重、提醒 ───── */
t('寫入類動作：訪客、非擁有者、REST GET 一律被拒，且不動到儲存層', () => {
  const s = seed();
  const before = s.calls.createText + s.calls.updateText;
  ['saveNote', 'saveBoard', 'uploadSvg', 'deleteNote', 'rebuildIndex'].forEach(a => {
    [
      [VISITOR, 'POST'],
      [OTHER, 'RUN'],
      [OWNER, 'GET']
    ].forEach(([c, m]) =>
      assert.strictEqual(
        JSON.stringify(H(a, { text: '---\ntitle: x\n---\n', id: '20261022-p001' }, c, m, s)),
        JSON.stringify({ ok: false, error: '無法完成' })
      )
    );
  });
  assert.strictEqual(s.calls.createText + s.calls.updateText, before);
});
t('saveNote：未給 id 由伺服器產生「日期-短碼」，並建立 notes/<id>.md', () => {
  const s = seed();
  const r = H(
    'saveNote',
    { text: '---\ntitle: 新筆記\ndate: 2026-11-02\n---\n內容 [[20261022-j001]]' },
    OWNER,
    'RUN',
    s
  );
  assert.ok(r.ok && /^20261102-[a-z0-9]{2,8}$/.test(r.id), JSON.stringify(r));
  const f = s.findFileByName('notes', r.id + '.md');
  assert.ok(f);
  assert.ok(s.readText(f.fileId).startsWith('---\nid: ' + r.id + '\ntitle: 新筆記'));
  assert.strictEqual(
    JSON.stringify(H('listIndex', {}, OWNER, 'RUN', s).items.find(i => i.id === r.id).links),
    JSON.stringify(['20261022-j001'])
  );
});
t('saveNote：更新覆寫同一個檔案（檔案 ID 不變）', () => {
  const s = seed();
  const row = s.getIndexRows().find(r => r.id === '20261022-j001');
  const r = H(
    'saveNote',
    {
      id: '20261022-j001',
      baseUpdatedAt: row.updatedAt,
      text: '---\ntitle: 日記公開（改）\ntopic: journal\n---\n新內容'
    },
    OWNER,
    'RUN',
    s
  );
  assert.ok(r.ok && !r.created);
  assert.strictEqual(s.getIndexRows().find(x => x.id === '20261022-j001').driveFileId, row.driveFileId);
});
t('saveNote：版本不符回 409 並附伺服器版本，不覆蓋', () => {
  const s = seed();
  const r = H(
    'saveNote',
    { id: '20261022-j001', baseUpdatedAt: 'stale', text: '---\ntitle: 想覆蓋\ntopic: journal\n---\nX' },
    OWNER,
    'RUN',
    s
  );
  assert.strictEqual(r.code, 409);
  assert.ok(r.server.text.includes('PUBLIC-BODY-2'));
});
t('saveNote：行動網路重送（同 id、同內容、無 baseUpdatedAt）視為成功且不重複建立', () => {
  const s = seed();
  const text = '---\ntitle: 手機筆記\ntopic: journal\ndate: 2026-10-23\n---\n內容';
  const a = H('saveNote', { id: '20261023-m001', text }, OWNER, 'RUN', s);
  const files = Object.keys(s.files).length;
  const b = H('saveNote', { id: '20261023-m001', text }, OWNER, 'RUN', s);
  assert.ok(a.created && b.ok && b.deduped);
  assert.strictEqual(Object.keys(s.files).length, files);
  assert.strictEqual(s.getIndexRows().filter(r => r.id === '20261023-m001').length, 1);
});
t('saveNote：未知主題、壞 YAML、壞日期、壞 public 都被拒並說明原因', () => {
  const s = seed();
  const bad = txt => H('saveNote', { text: txt }, OWNER, 'RUN', s);
  assert.ok(bad('---\ntitle: a\ntopic: nope\n---\n').reasons[0].includes('找不到主題'));
  assert.ok(bad('---\ntitle: [a\n---\n').reasons[0].includes('YAML'));
  assert.ok(bad('---\ntitle: a\ndate: 2026-13-45\n---\n').reasons[0].includes('date'));
  assert.ok(bad('---\ntitle: a\npublic: maybe\n---\n').reasons[0].includes('public'));
  assert.ok(bad('沒有標題').reasons[0].includes('title'));
});
t('saveNote：front matter 的日期保持字串，未知欄位原樣保留', () => {
  const s = seed();
  const r = H(
    'saveNote',
    { text: '---\ntitle: T\ndate: 2026-10-22\nx-mood: 開心\nrating: 5\n---\nb' },
    OWNER,
    'RUN',
    s
  );
  const out = s.readText(s.findFileByName('notes', r.id + '.md').fileId);
  assert.ok(
    out.includes('date: 2026-10-22') && out.includes('x-mood: 開心') && out.includes('rating: 5'),
    out
  );
});
t('大小只提醒不擋存：超過 100 KB 仍存檔並回 warnings', () => {
  const s = seed();
  const r = H('saveNote', { text: '---\ntitle: 大\n---\n' + '字'.repeat(40000) }, OWNER, 'RUN', s); // 約 120 KB
  assert.ok(r.ok && r.warnings.length === 1 && r.warnings[0].includes('建議'));
});
t('超過 5 MB 的技術上限才拒絕', () => {
  const r = H(
    'saveNote',
    { text: '---\ntitle: 巨大\n---\n' + 'a'.repeat(5 * 1024 * 1024 + 10) },
    OWNER,
    'RUN',
    seed()
  );
  assert.strictEqual(r.ok, false);
});
t('deleteNote：移到垃圾桶並移出索引，不永久刪除', () => {
  const s = seed();
  const row = s.getIndexRows().find(r => r.id === '20261022-j002');
  assert.ok(H('deleteNote', { id: '20261022-j002' }, OWNER, 'RUN', s).ok);
  assert.strictEqual(s.files[row.driveFileId].trashed, true);
  assert.ok(!s.getIndexRows().some(r => r.id === '20261022-j002'));
});

t('deleteTopic：主題內有筆記就拒絕；空主題移到垃圾桶（含畫布）；訪客不能刪', () => {
  const s = seed();
  const used = H('deleteTopic', { id: 'db-design' }, OWNER, 'RUN', s);
  assert.strictEqual(used.ok, false);
  assert.ok(used.noteCount > 0);
  assert.ok(s.getTopics().some(x => x.id === 'db-design'));
  assert.ok(H('saveTopic', { id: 'empty1', title: '空的' }, OWNER, 'RUN', s).ok);
  assert.ok(H('saveBoard', { topic: 'empty1', board: { nodes: [], edges: [] } }, OWNER, 'RUN', s).ok);
  assert.strictEqual(H('deleteTopic', { id: 'empty1' }, VISITOR, 'RUN', s).ok, false);
  assert.ok(s.getTopics().some(x => x.id === 'empty1'));
  assert.ok(H('deleteTopic', { id: 'empty1' }, OWNER, 'RUN', s).ok);
  assert.ok(!s.getTopics().some(x => x.id === 'empty1'));
  assert.strictEqual(s.findFileByName('topics', 'empty1.json'), null);
  assert.strictEqual(s.findFileByName('boards', 'empty1.canvas.json'), null);
  assert.strictEqual(H('deleteTopic', { id: 'nope' }, OWNER, 'RUN', s).ok, false);
  assert.strictEqual(H('deleteTopic', { id: 'x' }, { isOwner: true }, 'GET', s).ok, false);
});

t('updateNotes：批次改主題與公開；內文與未知欄位原樣保留；索引與檔案一致（重建後相同）', () => {
  const s = seed();
  assert.ok(
    H(
      'saveNote',
      {
        id: '20261022-x001',
        text: '---\nid: 20261022-x001\ntitle: 多欄位\ntopic: db-design\ndate: 2026-10-22\ntags: [a, b]\nmood: 開心\n---\n# 內文\n保持不變 [[20261022-p001]]\n'
      },
      OWNER,
      'RUN',
      s
    ).ok
  );
  const row = () => s.getIndexRows().find(r => r.id === '20261022-x001');
  const r = H(
    'updateNotes',
    { ids: ['20261022-x001', '20261022-p001'], topic: '', public: false },
    OWNER,
    'RUN',
    s
  );
  assert.ok(r.ok, JSON.stringify(r));
  assert.deepStrictEqual(r.updated.sort(), ['20261022-p001', '20261022-x001']);
  assert.strictEqual(row().topic, '');
  assert.strictEqual(row().public, false);
  const text = s.readText(row().driveFileId);
  assert.ok(
    text.includes('mood: 開心') &&
      text.includes('tags:') &&
      text.includes('保持不變 [[20261022-p001]]') &&
      text.includes('public: false') &&
      !/topic:/.test(text),
    text
  );
  const before = JSON.stringify(
    H('listIndex', {}, OWNER, 'RUN', s).items.sort((a, b) => a.id.localeCompare(b.id))
  );
  s._clearIndex();
  H('rebuildIndex', {}, OWNER, 'RUN', s);
  assert.strictEqual(
    JSON.stringify(H('listIndex', {}, OWNER, 'RUN', s).items.sort((a, b) => a.id.localeCompare(b.id))),
    before
  );
  const r2 = H('updateNotes', { ids: ['20261022-x001'], public: null }, OWNER, 'RUN', s);
  assert.ok(r2.ok);
  assert.strictEqual(row().public, null);
  assert.ok(!/public:/.test(s.readText(row().driveFileId)));
});
t('updateNotes：會讓任何一則變成公開時，沒確認就整批拒絕且完全不改；確認後才執行（含移到公開主題）', () => {
  const s = seed();
  const snap = () => JSON.stringify(s.getIndexRows());
  const b = snap();
  const r = H('updateNotes', { ids: ['20261022-p001'], public: true }, OWNER, 'RUN', s);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, '需要確認');
  assert.strictEqual(r.affectedNotes, 1);
  assert.strictEqual(snap(), b);
  const r1 = H('updateNotes', { ids: ['20261022-p001', '20261022-p002'], topic: 'journal' }, OWNER, 'RUN', s); // journal 預設公開；p002 本來就公開
  assert.strictEqual(r1.error, '需要確認');
  assert.strictEqual(r1.affectedNotes, 1);
  assert.strictEqual(snap(), b);
  const ok = H(
    'updateNotes',
    { ids: ['20261022-p001', '20261022-p002'], topic: 'journal', confirmPublic: true },
    OWNER,
    'RUN',
    s
  );
  assert.ok(ok.ok);
  assert.strictEqual(s.getIndexRows().find(x => x.id === '20261022-p001').topic, 'journal');
  assert.strictEqual(H('getNote', { id: '20261022-p001' }, VISITOR, 'RUN', s).ok, true); // 現在訪客讀得到
  const priv = H('updateNotes', { ids: ['20261022-p001'], public: false }, OWNER, 'RUN', s); // 改成私人不需確認
  assert.ok(priv.ok);
  assert.strictEqual(H('getNote', { id: '20261022-p001' }, VISITOR, 'RUN', s).ok, false);
});
t('updateNotes：沒變就算 unchanged；找不到的 id 列入 failed 不影響其他；參數檢查；訪客與 GET 拒絕', () => {
  const s = seed();
  const r = H(
    'updateNotes',
    { ids: ['20261022-p001', '29990101-zz', '20261022-p001'], public: null },
    OWNER,
    'RUN',
    s
  );
  assert.ok(r.ok);
  assert.deepStrictEqual(r.unchanged, ['20261022-p001']);
  assert.strictEqual(r.failed.length, 1);
  assert.strictEqual(r.failed[0].id, '29990101-zz');
  const bad = [
    {},
    { ids: [], public: true },
    { ids: ['20261022-p001'] },
    { ids: ['壞'], public: true },
    { ids: ['20261022-p001'], topic: 'nope' },
    { ids: ['20261022-p001'], public: 'maybe' },
    { ids: Array.from({ length: 31 }, (_, i) => '20261022-a' + (10 + i)), public: false }
  ];
  bad.forEach(p =>
    assert.strictEqual(H('updateNotes', p, OWNER, 'RUN', s).ok, false, JSON.stringify(p).slice(0, 60))
  );
  assert.strictEqual(
    H('updateNotes', { ids: ['20261022-p001'], public: true, confirmPublic: true }, VISITOR, 'RUN', s).ok,
    false
  );
  assert.strictEqual(
    H(
      'updateNotes',
      { ids: ['20261022-p001'], public: true, confirmPublic: true },
      { isOwner: true },
      'GET',
      s
    ).ok,
    false
  );
  assert.strictEqual(s.getIndexRows().find(x => x.id === '20261022-p001').public, null);
});

t('translation_of：存入索引與檔案；格式與自我指向被拒；指向私人筆記的關聯訪客看不到；重建索引後一致', () => {
  const s = seed();
  const mk = (id, extra, topic, pub) =>
    H(
      'saveNote',
      {
        id,
        text:
          '---\nid: ' +
          id +
          '\ntitle: 英文版 ' +
          id +
          '\ntopic: ' +
          topic +
          '\ndate: 2026-10-22\nlang: en\n' +
          (pub === undefined ? '' : 'public: ' + pub + '\n') +
          extra +
          '---\n內文\n'
      },
      OWNER,
      'RUN',
      s
    );
  assert.ok(mk('20261022-e001', 'translation_of: 20261022-j001\n', 'journal').ok); // j001：公開日記（seed）
  assert.ok(mk('20261022-e002', 'translation_of: 20261022-p001\n', 'journal').ok); // p001：私人
  assert.strictEqual(mk('20261022-e003', 'translation_of: 壞的\n', 'journal').ok, false);
  assert.strictEqual(mk('20261022-e003', 'translation_of: 20261022-e003\n', 'journal').ok, false);
  const own = H('listIndex', {}, OWNER, 'RUN', s).items,
    vis = H('listIndex', {}, VISITOR, 'RUN', s).items;
  assert.strictEqual(own.find(x => x.id === '20261022-e002').translationOf, '20261022-p001');
  assert.strictEqual(vis.find(x => x.id === '20261022-e001').translationOf, '20261022-j001');
  assert.strictEqual(vis.find(x => x.id === '20261022-e002').translationOf, '', '指向私人筆記的關聯不可外洩');
  assert.ok(!JSON.stringify(vis).includes('20261022-p001') || vis.some(x => x.id === '20261022-p001'));
  assert.ok(
    s
      .readText(s.getIndexRows().find(x => x.id === '20261022-e001').driveFileId)
      .includes('translation_of: 20261022-j001')
  );
  const before = JSON.stringify(own.sort((a, b) => a.id.localeCompare(b.id)));
  s._clearIndex();
  H('rebuildIndex', {}, OWNER, 'RUN', s);
  assert.strictEqual(
    JSON.stringify(H('listIndex', {}, OWNER, 'RUN', s).items.sort((a, b) => a.id.localeCompare(b.id))),
    before
  );
});
t(
  'previewPublic／previewNote：擁有者看到的「訪客視角」與真正的訪客逐字相同；訪客與 REST GET 不能呼叫',
  () => {
    const s = seed();
    const strip = o => JSON.stringify(Object.assign({}, o, { generatedAt: 0 }));
    assert.strictEqual(
      strip(H('previewPublic', {}, OWNER, 'RUN', s)),
      strip(H('listIndex', {}, VISITOR, 'RUN', s))
    );
    ['20261022-p001', '20261022-p002', '20261022-j001', '29990101-zz'].forEach(id =>
      assert.strictEqual(
        JSON.stringify(H('previewNote', { id }, OWNER, 'RUN', s)),
        JSON.stringify(H('getNote', { id }, VISITOR, 'RUN', s)),
        id
      )
    );
    ['20261022-v001', '20261022-v002', '29990101-zz'].forEach(id =>
      assert.strictEqual(
        JSON.stringify(H('previewSvg', { id }, OWNER, 'RUN', s)),
        JSON.stringify(H('getSvg', { id }, VISITOR, 'RUN', s)),
        id
      )
    );
    assert.strictEqual(H('previewSvg', { id: '20261022-v001' }, VISITOR, 'RUN', s).ok, false);
    assert.strictEqual(H('previewNote', { id: '20261022-p002' }, OWNER, 'RUN', s).ok, true);
    assert.ok(!H('previewNote', { id: '20261022-p002' }, OWNER, 'RUN', s).body.includes('SECRET'));
    ['previewPublic', 'previewNote'].forEach(a => {
      assert.strictEqual(H(a, { id: '20261022-p002' }, VISITOR, 'RUN', s).ok, false);
      assert.strictEqual(H(a, { id: '20261022-p002' }, OWNER, 'GET', s).ok, false);
    });
  }
);
t('routeJson_：只接受格式正確的筆記 id、主題 id、語言；輸出可安全放進 <script>', () => {
  const R = JSON.parse;
  assert.deepStrictEqual(
    R(
      ROUTE(
        { note: '20261024-a1', topic: 'db-design', lang: 'en', extra: 'x' },
        'https://script.google.com/macros/s/AKfy-1/exec'
      )
    ),
    {
      base: 'https://script.google.com/macros/s/AKfy-1/exec',
      note: '20261024-a1',
      topic: 'db-design',
      lang: 'en'
    }
  );
  assert.deepStrictEqual(R(ROUTE({ note: '"><script>', topic: 'A B', lang: 'fr' }, 'javascript:alert(1)')), {
    base: ''
  });
  assert.deepStrictEqual(R(ROUTE(undefined, undefined)), { base: '' });
  assert.ok(!/[<>&]/.test(ROUTE({ note: '20261024-a1' }, 'https://script.google.com/macros/s/a/exec?x=<')));
});

t('deleteNotes：批次移到垃圾桶並移出索引；找不到的列入 failed；超量、空清單、訪客、GET 都拒絕', () => {
  const s = seed();
  const rows = s.getIndexRows();
  const f = rows.find(r => r.id === '20261022-j002').driveFileId;
  const r = H(
    'deleteNotes',
    { ids: ['20261022-j002', '20261022-p001', '29990101-zz', '20261022-j002'] },
    OWNER,
    'RUN',
    s
  );
  assert.ok(r.ok);
  assert.deepStrictEqual(r.deleted.sort(), ['20261022-j002', '20261022-p001']);
  assert.strictEqual(r.failed.length, 1);
  assert.strictEqual(s.files[f].trashed, true);
  assert.ok(!s.getIndexRows().some(x => x.id === '20261022-p001'));
  assert.strictEqual(H('deleteNotes', { ids: [] }, OWNER, 'RUN', s).ok, false);
  assert.strictEqual(
    H('deleteNotes', { ids: Array.from({ length: 31 }, (_, i) => '20261022-a' + (10 + i)) }, OWNER, 'RUN', s)
      .ok,
    false
  );
  const before = s.getIndexRows().length;
  assert.strictEqual(H('deleteNotes', { ids: ['20261022-p002'] }, VISITOR, 'RUN', s).ok, false);
  assert.strictEqual(H('deleteNotes', { ids: ['20261022-p002'] }, OWNER, 'GET', s).ok, false);
  assert.strictEqual(s.getIndexRows().length, before);
});

/* ───── 重建索引（規劃書 4.3） ───── */
t('rebuildIndex：清空索引後可由檔案還原，內容一致；分批可續傳', () => {
  const s = seed();
  const before = JSON.stringify(
    H('listIndex', {}, OWNER, 'RUN', s).items.sort((a, b) => a.id.localeCompare(b.id))
  );
  s._clearIndex();
  let cursor = null,
    rounds = 0;
  do {
    const r = H('rebuildIndex', { cursor }, OWNER, 'RUN', s);
    assert.ok(r.ok);
    cursor = r.done ? null : r.cursor;
    rounds++;
  } while (cursor);
  const after = JSON.stringify(
    H('listIndex', {}, OWNER, 'RUN', s).items.sort((a, b) => a.id.localeCompare(b.id))
  );
  assert.strictEqual(after, before);
});
t('rebuildIndex：缺 id、壞 YAML、id 重複的檔案列入問題清單，不中斷', () => {
  const s = seed();
  s.createText('notes', 'noid.md', '---\ntitle: 沒有 id\n---\nx');
  s.createText('notes', 'broken.md', '---\ntitle: [x\n---\n');
  s.createText('notes', 'dup.md', '---\nid: 20261022-j001\ntitle: 重複\n---\nx');
  s._clearIndex();
  const r = H('rebuildIndex', {}, OWNER, 'RUN', s);
  assert.ok(r.ok && r.done);
  const probs = r.problems.map(p => p.file + ':' + p.problem).join('|');
  assert.ok(probs.includes('noid.md') && probs.includes('broken.md') && probs.includes('重複'), probs);
});

/* ───── SVG 清除（規劃書風險表）───── */
const san = x => JSON.parse(JSON.stringify(g('sanitizeSvg_')(x)));
t('SVG：移除 script、事件屬性、foreignObject（含子孫），保留正常圖形', () => {
  const r = san(
    '<?xml version="1.0"?><svg viewBox="0 0 10 10"><script>alert(1)</script><foreignObject><div onclick="x()">hi<script>y</script></div></foreignObject><rect width="5" onload="evil()" height="5"/><g><circle r="2" ONCLICK="x"/></g></svg>'
  );
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(!/script|foreignobject|onclick|onload|alert/i.test(r.svg), r.svg);
  assert.ok(r.svg.includes('<rect width="5" height="5"/>') && r.svg.includes('<circle r="2"/>'));
});
t('SVG：大小寫、前綴、換行、引號內的 > 都擋得住', () => {
  const r = san(
    '<svg><SCRIPT\n>a</SCRIPT><svg:script>b</svg:script><rect title="a>b" OnMouseOver = "x()" /></svg>'
  );
  assert.ok(r.ok && !/script|OnMouseOver/i.test(r.svg), JSON.stringify(r));
  assert.ok(r.svg.includes('title="a>b"'));
});
t(
  'SVG：javascript: 連結（含實體與空白編碼）與外部網址連結被移除（P4 起外部參照一律不留，避免追蹤與外洩）；內部錨點保留',
  () => {
    const r = san(
      '<svg><a href="javascript:alert(1)"><a xlink:href=" jav&#x61;script:alert(1)"><a href="&#106;avascript&colon;x"><a href="https://example.com/"/></a></a></a><a href="#x"/></svg>'
    );
    assert.ok(
      r.ok && !/javascript/i.test(r.svg) && !r.svg.includes('example.com') && r.svg.includes('href="#x"'),
      JSON.stringify(r)
    );
  }
);
t('SVG：自動補上 xmlns；DOCTYPE、註解、處理指令被移除', () => {
  const r = san('<?xml version="1.0"?><!DOCTYPE svg><!-- c --><svg><rect/></svg>');
  assert.ok(r.ok && r.svg === '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>', r.svg);
});
t('SVG：實體宣告、標籤未配對、非 svg 根、根元素外有文字、多個根都被拒絕', () => {
  [
    '<!DOCTYPE svg [<!ENTITY a "b">]><svg/>',
    '<svg><g></svg>',
    '<html><body/></html>',
    'hi<svg/>',
    '<svg/><svg/>',
    '',
    '<svg><rect'
  ].forEach(x => assert.strictEqual(san(x).ok, false, x));
});
t('SVG：內嵌點陣圖（base64 png、jpeg）被拒絕，內嵌的 svg 資料網址不算', () => {
  assert.strictEqual(san('<svg><image href="data:image/png;base64,AAAA"/></svg>').ok, false);
  assert.strictEqual(san('<svg><image xlink:href=" DATA:image/jpeg;base64,/9j/"/></svg>').ok, false);
  assert.strictEqual(san('<svg><image href="data&#58;image/gif;base64,R0lG"/></svg>').ok, false);
  assert.strictEqual(san('<svg><image href="data:image/svg+xml;utf8,%3Csvg/%3E"/></svg>').ok, true);
});
t('uploadSvg：寫入 assets/<id>.svg，回報清除項目；同 id 再傳覆寫同檔', () => {
  const s = seed();
  const a = H(
    'uploadSvg',
    { id: '20261022-v009', text: '<svg><script>1</script><rect/></svg>' },
    OWNER,
    'RUN',
    s
  );
  assert.ok(a.ok && a.created && a.removed.length === 1);
  const f = s.findFileByName('assets', '20261022-v009.svg');
  assert.ok(!/script/.test(s.readText(f.fileId)));
  const b = H('uploadSvg', { id: '20261022-v009', text: '<svg><circle/></svg>' }, OWNER, 'RUN', s);
  assert.ok(b.ok && !b.created && s.findFileByName('assets', '20261022-v009.svg').fileId === f.fileId);
});

t('getSvg：公開主題畫布的「文字卡片」引用的 SVG 也算公開；私人主題的不算', () => {
  const s = seed();
  s.saveTopic({ id: 'pubtopic', title: '公開主題', defaultPublic: true });
  H('uploadSvg', { id: '20261022-w001', text: '<svg><rect/></svg>' }, OWNER, 'RUN', s);
  H('uploadSvg', { id: '20261022-w002', text: '<svg><rect/></svg>' }, OWNER, 'RUN', s);
  assert.strictEqual(
    H('getSvg', { id: '20261022-w001' }, VISITOR, 'GET', s).ok,
    false,
    '尚未被任何公開畫布引用'
  );
  const board = {
    nodes: [
      {
        id: 't1',
        type: 'text',
        text: '看圖 ![](assets/20261022-w001.svg)',
        x: 0,
        y: 0,
        width: 200,
        height: 100
      }
    ],
    edges: []
  };
  assert.ok(H('saveBoard', { topic: 'pubtopic', board }, OWNER, 'RUN', s).ok);
  assert.strictEqual(H('getSvg', { id: '20261022-w001' }, VISITOR, 'GET', s).ok, true);
  assert.strictEqual(H('getSvg', { id: '20261022-w002' }, VISITOR, 'GET', s).ok, false);
  const board2 = {
    nodes: [
      { id: 't1', type: 'text', text: '![](assets/20261022-w002.svg)', x: 0, y: 0, width: 200, height: 100 }
    ],
    edges: []
  };
  assert.ok(H('saveBoard', { topic: 'db-design', board: board2 }, OWNER, 'RUN', s).ok);
  assert.strictEqual(
    H('getSvg', { id: '20261022-w002' }, VISITOR, 'GET', s).ok,
    false,
    '私人主題的畫布不會讓 SVG 公開'
  );
});

t('devSelfCheck 的檢查邏輯：在假儲存層上全部通過', () => {
  const r = JSON.parse(JSON.stringify(g('runSelfCheck_')(makeStore())));
  assert.strictEqual(r.fail, 0, r.lines.filter(l => l.startsWith('失敗')).join(' | '));
  assert.ok(r.pass >= 25);
});

console.log('\n共 ' + n + ' 項全部通過');
