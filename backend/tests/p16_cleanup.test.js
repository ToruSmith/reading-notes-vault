// P16 後端離線測試：清理未使用檔案（跨畫布判斷、7 天寬限、權限、只移垃圾桶、過期清單不誤刪）
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
const IMG = 'data:image/png;base64,iVBORw0KGgo=';
function seed() {
  const s = makeStore();
  s.saveTopic({ id: 'a', title: '甲', defaultPublic: true });
  s.saveTopic({ id: 'b', title: '乙', defaultPublic: false });
  return s;
}
const up = (s, kind) =>
  kind === 'img'
    ? H('uploadImage', { data: IMG }, OWNER, 'RUN', s)
    : H('uploadHtml', { text: '<h1>x</h1>' }, OWNER, 'RUN', s);
const put = (s, topic, files) =>
  assert.ok(
    H(
      'saveBoard',
      {
        topic,
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
    ).ok
  );
const old = s => (s.nowIso = '2026-11-30T00:00:00.000Z'); // 檔案建立於 10/22，之後就超過 7 天

t('只有擁有者能掃描與移除；GET 一律拒絕', () => {
  const s = seed();
  assert.strictEqual(H('scanAssets', {}, VISITOR, 'RUN', s).ok, false);
  assert.strictEqual(H('trashAssets', { names: ['x'] }, VISITOR, 'RUN', s).ok, false);
  assert.strictEqual(H('scanAssets', {}, OWNER, 'GET', s).ok, false);
});
t('跨畫布：被任何一張畫布（含私人）使用的不算未使用；沒人用的才列出', () => {
  const s = seed();
  const i1 = up(s, 'img').id,
    i2 = up(s, 'img').id,
    h1 = up(s, 'html').id,
    h2 = up(s, 'html').id;
  put(s, 'a', ['assets/' + i1 + '.img']);
  put(s, 'b', ['assets/' + h1 + '.html']); // 私人畫布也算使用
  old(s);
  const r = H('scanAssets', {}, OWNER, 'RUN', s);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.items.map(x => x.name).sort(), [i2 + '.img', h2 + '.html'].sort());
});
t('7 天內建立的不列出，只計入 recent', () => {
  const s = seed();
  up(s, 'img');
  const r = H('scanAssets', {}, OWNER, 'RUN', s);
  assert.strictEqual(r.items.length, 0);
  assert.strictEqual(r.recent, 1);
});
t('移除：只移到垃圾桶；被使用的、不存在的、格式怪的一律略過', () => {
  const s = seed();
  const used = up(s, 'img').id,
    free = up(s, 'img').id;
  put(s, 'a', ['assets/' + used + '.img']);
  old(s);
  const r = H(
    'trashAssets',
    { names: [free + '.img', used + '.img', '../x', 5, 'nope.html'] },
    OWNER,
    'RUN',
    s
  );
  assert.ok(r.ok);
  assert.strictEqual(r.trashed, 1);
  assert.strictEqual(r.skipped, 4);
  assert.strictEqual(s.findFileByName('assets', free + '.img'), null);
  assert.ok(s.findFileByName('assets', used + '.img'));
});
t('過期清單不誤刪：掃描後某畫布又用了它，再移除就會略過', () => {
  const s = seed();
  const id = up(s, 'html').id;
  old(s);
  assert.strictEqual(H('scanAssets', {}, OWNER, 'RUN', s).items.length, 1);
  put(s, 'b', ['assets/' + id + '.html']);
  const r = H('trashAssets', { names: [id + '.html'] }, OWNER, 'RUN', s);
  assert.strictEqual(r.trashed, 0);
  assert.ok(s.findFileByName('assets', id + '.html'));
});
t('任何一張畫布讀不了：整個中止，什麼都不移', () => {
  const s = seed();
  const id = up(s, 'img').id;
  put(s, 'a', []);
  old(s);
  const f = s.findFileByName('boards', 'a.canvas.json');
  s.failRead[f.fileId] = true;
  assert.strictEqual(H('scanAssets', {}, OWNER, 'RUN', s).ok, false);
  assert.strictEqual(H('trashAssets', { names: [id + '.img'] }, OWNER, 'RUN', s).ok, false);
  assert.ok(s.findFileByName('assets', id + '.img'));
});
t('清單格式錯誤、過長會被拒絕', () => {
  const s = seed();
  assert.strictEqual(H('trashAssets', {}, OWNER, 'RUN', s).ok, false);
  assert.strictEqual(H('trashAssets', { names: [] }, OWNER, 'RUN', s).ok, false);
  assert.strictEqual(H('trashAssets', { names: new Array(201).fill('a') }, OWNER, 'RUN', s).ok, false);
});
console.log('\n清理未使用檔案：' + n + ' 項全部通過');
