// P15 後端離線測試：HTML 卡片（上傳驗證、權限、公開規則、匯出、備份清單）
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
const PAGE = '<!doctype html><title>測試</title><h1>你好</h1><script>alert(1)</script>';
function seed() {
  const s = makeStore();
  s.saveTopic({ id: 'pub', title: '公開', defaultPublic: true });
  s.saveTopic({ id: 'priv', title: '私人', defaultPublic: false });
  return s;
}
const board = (s, topic, file) => {
  const nodes = [{ id: 'n1', type: 'file', file, x: 0, y: 0, width: 300, height: 200 }];
  assert.ok(H('saveBoard', { topic, board: { nodes, edges: [] } }, OWNER, 'RUN', s).ok);
};

t('擁有者可上傳；原樣存放不改寫；訪客不能上傳；空內容、NUL、過大、壞 id 都拒絕', () => {
  const s = seed();
  const r = H('uploadHtml', { text: PAGE }, OWNER, 'RUN', s);
  assert.ok(r.ok && /^\d{8}-/.test(r.id));
  assert.strictEqual(H('getHtml', { id: r.id }, OWNER, 'RUN', s).text, PAGE);
  assert.strictEqual(H('uploadHtml', { text: PAGE }, VISITOR, 'RUN', s).ok, false);
  [
    { text: '' },
    { text: '   ' },
    { text: 5 },
    { text: 'a\u0000b' },
    { text: 'x'.repeat(500 * 1024 + 1) },
    { text: PAGE, id: 'bad id' }
  ].forEach(p =>
    assert.strictEqual(H('uploadHtml', p, OWNER, 'RUN', s).ok, false, JSON.stringify(p).slice(0, 30))
  );
  assert.ok(
    H('uploadHtml', { text: '中'.repeat(175000) }, OWNER, 'RUN', s).ok === false,
    '以位元組計算（中文 3 bytes）'
  );
});
t('訪客只拿得到「公開主題的畫布」引用的 HTML；私人畫布引用的、沒被引用的都是找不到', () => {
  const s = seed();
  const a = H('uploadHtml', { text: PAGE }, OWNER, 'RUN', s).id,
    b = H('uploadHtml', { text: PAGE + 'b' }, OWNER, 'RUN', s).id,
    c = H('uploadHtml', { text: PAGE + 'c' }, OWNER, 'RUN', s).id;
  board(s, 'pub', 'assets/' + a + '.html');
  board(s, 'priv', 'assets/' + b + '.html');
  assert.strictEqual(H('getHtml', { id: a }, VISITOR, 'RUN', s).ok, true);
  assert.strictEqual(H('getHtml', { id: b }, VISITOR, 'RUN', s).ok, false);
  assert.strictEqual(H('getHtml', { id: c }, VISITOR, 'RUN', s).ok, false);
  assert.strictEqual(H('getHtml', { id: '../x' }, VISITOR, 'RUN', s).ok, false);
});
t('訪客版畫布保留 html 卡片（路徑格式合法）；不合法的 file 路徑仍被移除', () => {
  const s = seed();
  const a = H('uploadHtml', { text: PAGE }, OWNER, 'RUN', s).id;
  board(s, 'pub', 'assets/' + a + '.html');
  const nodes = H('getBoard', { topic: 'pub' }, VISITOR, 'RUN', s).board.nodes;
  assert.strictEqual(nodes.length, 1);
});
t('匯出：分頁取得全部 HTML；只列 .html，不混入圖片', () => {
  const s = seed();
  for (let i = 0; i < 11; i++) H('uploadHtml', { text: PAGE + i }, OWNER, 'RUN', s);
  H(
    'uploadImage',
    {
      data:
        'data:image/png;base64,' +
        Buffer.concat([
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          Buffer.alloc(40)
        ]).toString('base64')
    },
    OWNER,
    'RUN',
    s
  );
  let cur = null,
    all = [];
  do {
    const r = H('exportHtml', { cursor: cur }, OWNER, 'RUN', s);
    all = all.concat(r.htmls);
    cur = r.cursor;
  } while (cur);
  assert.strictEqual(all.length, 11);
  assert.ok(all.every(x => x.text.startsWith('<!doctype')));
  assert.strictEqual(H('exportHtml', {}, VISITOR, 'RUN', s).ok, false);
});
console.log('\nP15 後端：' + n + ' 項全部通過');
