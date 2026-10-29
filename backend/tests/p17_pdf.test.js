// P17 後端離線測試：PDF 卡片（上傳驗證、大小上限、去重、權限、公開規則、匯出、備份清單、清理）
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
const pdfOf = (extra, bytes) =>
  'data:application/pdf;base64,' +
  Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(extra || 'x'), Buffer.alloc(bytes || 0)]).toString(
    'base64'
  );
function seed() {
  const s = makeStore();
  s.saveTopic({ id: 'pub', title: '公開', defaultPublic: true });
  s.saveTopic({ id: 'priv', title: '私人', defaultPublic: false });
  return s;
}
const board = (s, topic, file) =>
  assert.ok(
    H(
      'saveBoard',
      {
        topic,
        board: { nodes: [{ id: 'n1', type: 'file', file, x: 0, y: 0, width: 300, height: 200 }], edges: [] }
      },
      OWNER,
      'RUN',
      s
    ).ok
  );

t('擁有者可上傳；原樣存放；訪客不能上傳；格式、檔頭、過大、壞 id 都拒絕', () => {
  const s = seed();
  const d = pdfOf('a');
  const r = H('uploadPdf', { data: d }, OWNER, 'RUN', s);
  assert.ok(r.ok && /^\d{8}-/.test(r.id));
  assert.strictEqual(H('getPdf', { id: r.id }, OWNER, 'RUN', s).data, d);
  assert.strictEqual(H('uploadPdf', { data: d }, VISITOR, 'RUN', s).ok, false);
  [
    { data: '' },
    { data: 5 },
    { data: 'data:application/pdf;base64,@@@' },
    { data: 'data:image/png;base64,iVBORw0KGgo=' },
    { data: 'data:application/pdf;base64,' + Buffer.from('<html>不是 PDF</html>').toString('base64') },
    { data: pdfOf('a', 5 * 1024 * 1024) },
    { data: d, id: 'bad id' }
  ].forEach(p =>
    assert.strictEqual(H('uploadPdf', p, OWNER, 'RUN', s).ok, false, JSON.stringify(p).slice(0, 40))
  );
  assert.ok(H('uploadPdf', { data: pdfOf('a', 5 * 1024 * 1024 - 100) }, OWNER, 'RUN', s).ok, '接近上限仍可');
});
t('內容完全相同只存一份；不同內容各存一份', () => {
  const s = seed();
  const a = H('uploadPdf', { data: pdfOf('a') }, OWNER, 'RUN', s),
    b = H('uploadPdf', { data: pdfOf('a') }, OWNER, 'RUN', s),
    c = H('uploadPdf', { data: pdfOf('c') }, OWNER, 'RUN', s);
  assert.strictEqual(a.id, b.id);
  assert.strictEqual(b.reused, true);
  assert.notStrictEqual(a.id, c.id);
});
t('訪客只拿得到「公開主題的畫布」引用的 PDF；私人畫布引用的、沒被引用的都是找不到', () => {
  const s = seed();
  const a = H('uploadPdf', { data: pdfOf('a') }, OWNER, 'RUN', s).id,
    b = H('uploadPdf', { data: pdfOf('b') }, OWNER, 'RUN', s).id,
    c = H('uploadPdf', { data: pdfOf('c') }, OWNER, 'RUN', s).id;
  board(s, 'pub', 'assets/' + a + '.pdf');
  board(s, 'priv', 'assets/' + b + '.pdf');
  assert.strictEqual(H('getPdf', { id: a }, VISITOR, 'RUN', s).ok, true);
  assert.strictEqual(H('getPdf', { id: b }, VISITOR, 'RUN', s).ok, false);
  assert.strictEqual(H('getPdf', { id: c }, VISITOR, 'RUN', s).ok, false);
  assert.strictEqual(H('getPdf', { id: '../x' }, VISITOR, 'RUN', s).ok, false);
});
t('訪客版畫布保留 pdf 卡片（路徑格式合法）', () => {
  const s = seed();
  const a = H('uploadPdf', { data: pdfOf('a') }, OWNER, 'RUN', s).id;
  board(s, 'pub', 'assets/' + a + '.pdf');
  assert.strictEqual(H('getBoard', { topic: 'pub' }, VISITOR, 'RUN', s).board.nodes.length, 1);
});
t('匯出：分頁取得全部 PDF（一頁 2 個）；訪客不能匯出；備份清單含 .pdf', () => {
  const s = seed();
  for (let i = 0; i < 5; i++) H('uploadPdf', { data: pdfOf('p' + i) }, OWNER, 'RUN', s);
  let cur = null,
    all = [],
    pages = 0;
  do {
    const r = H('exportPdf', { cursor: cur }, OWNER, 'RUN', s);
    all = all.concat(r.pdfs);
    cur = r.cursor;
    pages++;
  } while (cur);
  assert.strictEqual(all.length, 5);
  assert.strictEqual(pages, 3);
  assert.strictEqual(H('exportPdf', {}, VISITOR, 'RUN', s).ok, false);
  const items = J(g('backupFileList_')(s));
  assert.strictEqual(items.filter(i => /^assets\/.*\.pdf$/.test(i.path)).length, 5);
});
t('清理：沒被任何畫布使用的 PDF 會被列出；被使用的不會；刪卡片存檔時一併移到垃圾桶', () => {
  const s = seed();
  const keep = H('uploadPdf', { data: pdfOf('k') }, OWNER, 'RUN', s).id,
    drop = H('uploadPdf', { data: pdfOf('d') }, OWNER, 'RUN', s).id;
  const save = (files, base) =>
    H(
      'saveBoard',
      {
        topic: 'pub',
        baseUpdatedAt: base,
        board: {
          nodes: files.map((f, i) => ({
            id: 'n' + i,
            type: 'file',
            file: f,
            x: 0,
            y: 0,
            width: 200,
            height: 100
          })),
          edges: []
        }
      },
      OWNER,
      'RUN',
      s
    );
  const r1 = save(['assets/' + keep + '.pdf', 'assets/' + drop + '.pdf']);
  const r2 = save(['assets/' + keep + '.pdf'], r1.updatedAt);
  assert.strictEqual(r2.removedAssets, 1);
  assert.strictEqual(s.findFileByName('assets', drop + '.pdf'), null);
  assert.ok(s.findFileByName('assets', keep + '.pdf'));
  save([], r2.updatedAt);
  s.nowIso = '2026-11-30T00:00:00.000Z';
  assert.deepStrictEqual(
    H('scanAssets', {}, OWNER, 'RUN', s).items.map(x => x.name),
    []
  );
});
console.log('\nP17 PDF 後端：' + n + ' 項全部通過');
