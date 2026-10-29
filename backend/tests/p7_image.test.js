// P7b-2 後端離線測試：圖片卡（上傳驗證、權限、公開規則、匯出、備份）
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
const J = o => JSON.parse(JSON.stringify(o));
const H = (a, p, c, m, s) => J(g('handle_')(a, p, c, m || 'RUN', s));
const OWNER = { isOwner: true, active: 'me@gmail.com' },
  VISITOR = { isOwner: false, active: '' };
let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('通過  ' + name);
};

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)]);
const webp = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([40, 0, 0, 0]),
  Buffer.from('WEBP'),
  Buffer.alloc(40)
]);
const url = (mime, b) => 'data:' + mime + ';base64,' + b.toString('base64');
function seed() {
  const s = makeStore();
  s.saveTopic({ id: 'priv', title: '私人', defaultPublic: false });
  s.saveTopic({ id: 'pub', title: '公開', defaultPublic: true });
  return s;
}

t('三種格式都收；格式與內容不符、SVG、HTML、非 data URL 都拒絕', () => {
  const s = seed();
  assert.ok(H('uploadImage', { data: url('image/png', png) }, OWNER, 'RUN', s).ok);
  assert.ok(H('uploadImage', { data: url('image/jpeg', jpg) }, OWNER, 'RUN', s).ok);
  assert.ok(H('uploadImage', { data: url('image/webp', webp) }, OWNER, 'RUN', s).ok);
  [
    url('image/png', jpg),
    url('image/jpeg', png),
    url('image/webp', png),
    url('image/svg+xml', Buffer.from('<svg/>')),
    url('text/html', Buffer.from('<script>')),
    'https://evil.com/x.png',
    'data:image/png;base64,@@@@',
    5,
    null
  ].forEach(d =>
    assert.strictEqual(H('uploadImage', { data: d }, OWNER, 'RUN', s).ok, false, String(d).slice(0, 30))
  );
});
t('大檔只提醒不擋；超過 5 MB 技術上限才拒絕', () => {
  const s = seed();
  const big = Buffer.concat([png, Buffer.alloc(1.5 * 1024 * 1024)]);
  const r = H('uploadImage', { data: url('image/png', big) }, OWNER, 'RUN', s);
  assert.ok(r.ok && r.warnings.length === 1 && /建議/.test(r.warnings[0]));
  const huge = Buffer.concat([png, Buffer.alloc(5.2 * 1024 * 1024)]);
  assert.strictEqual(H('uploadImage', { data: url('image/png', huge) }, OWNER, 'RUN', s).ok, false);
});
t('只有擁有者能上傳／匯出；訪客與 REST GET 一律拒絕', () => {
  const s = seed();
  ['uploadImage', 'exportImages'].forEach(a => {
    assert.strictEqual(H(a, { data: url('image/png', png) }, VISITOR, 'RUN', s).ok, false);
    assert.strictEqual(H(a, { data: url('image/png', png) }, OWNER, 'GET', s).ok, false);
  });
});
t('公開規則：只有公開主題的畫布引用才算公開；私人主題引用與孤兒圖片訪客讀不到', () => {
  const s = seed();
  const a = H('uploadImage', { data: url('image/png', png) }, OWNER, 'RUN', s).id;
  const b = H('uploadImage', { data: url('image/jpeg', jpg) }, OWNER, 'RUN', s).id;
  const c = H('uploadImage', { data: url('image/webp', webp) }, OWNER, 'RUN', s).id;
  const board = id => ({
    nodes: [{ id: 'n1', type: 'file', file: 'assets/' + id + '.img', x: 0, y: 0, width: 200, height: 150 }],
    edges: []
  });
  assert.ok(H('saveBoard', { topic: 'pub', board: board(a) }, OWNER, 'RUN', s).ok);
  assert.ok(H('saveBoard', { topic: 'priv', board: board(b) }, OWNER, 'RUN', s).ok);
  assert.ok(H('getImage', { id: a }, VISITOR, 'GET', s).ok);
  assert.strictEqual(H('getImage', { id: b }, VISITOR, 'GET', s).ok, false);
  assert.strictEqual(H('getImage', { id: c }, VISITOR, 'GET', s).ok, false);
  assert.ok(H('getImage', { id: b }, OWNER, 'RUN', s).ok);
  assert.strictEqual(H('getImage', { id: '../x' }, OWNER, 'RUN', s).ok, false);
  const vb = H('getBoard', { topic: 'pub' }, VISITOR, 'GET', s);
  assert.ok(vb.ok && vb.board.nodes.length === 1);
});
t('訪客版畫布：圖片路徑保留，奇怪副檔名的卡片被移除', () => {
  const s = seed();
  const nodes = [
    { id: 'n1', type: 'file', file: 'assets/20261022-abc.img', x: 0, y: 0, width: 9, height: 9 },
    { id: 'n2', type: 'file', file: 'assets/20261022-abc.png', x: 0, y: 0, width: 9, height: 9 }
  ];
  assert.ok(H('saveBoard', { topic: 'pub', board: { nodes, edges: [] } }, OWNER, 'RUN', s).ok);
  const vb = H('getBoard', { topic: 'pub' }, VISITOR, 'GET', s);
  assert.deepStrictEqual(
    vb.board.nodes.map(x => x.id),
    ['n1']
  );
});
t('匯出分頁取回全部圖片；備份清單含圖片', () => {
  const s = seed();
  for (let i = 0; i < 10; i++) H('uploadImage', { data: url('image/png', png) }, OWNER, 'RUN', s);
  let cur = null,
    got = 0;
  do {
    const r = H('exportImages', { cursor: cur }, OWNER, 'RUN', s);
    got += r.images.length;
    cur = r.cursor;
  } while (cur);
  assert.strictEqual(got, 10);
  const items = J(g('backupFileList_')(s));
  assert.strictEqual(items.filter(i => /^assets\/.*\.img$/.test(i.path)).length, 10);
});
console.log('\n圖片後端：' + n + ' 項通過');
