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
let seq = 0; // 每次上傳內容都不同（相同內容會被去重）
const png = k =>
  'data:image/png;base64,' +
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from([k])]).toString(
    'base64'
  );
const up = (s, kind, same) =>
  kind === 'img'
    ? H('uploadImage', { data: png(same ? 1 : ++seq + 1) }, OWNER, 'RUN', s)
    : H('uploadHtml', { text: same ? '<h1>x</h1>' : '<h1>x' + ++seq + '</h1>' }, OWNER, 'RUN', s);
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
t('相同內容不重複存：HTML／圖片再上傳回傳舊 id，不新增檔案；不同內容才新增', () => {
  const s = seed();
  const a = up(s, 'html', true),
    b = up(s, 'html', true);
  assert.strictEqual(b.id, a.id);
  assert.strictEqual(b.reused, true);
  const c = H('uploadHtml', { text: '<h1>另一份</h1>' }, OWNER, 'RUN', s);
  assert.notStrictEqual(c.id, a.id);
  const i1 = up(s, 'img', true),
    i2 = up(s, 'img', true);
  assert.strictEqual(i2.id, i1.id);
  assert.strictEqual(s.listFolder('assets').length, 3);
});
t('指定 id（還原備份）不走去重', () => {
  const s = seed();
  const a = up(s, 'html', true);
  const r = H('uploadHtml', { text: '<h1>x</h1>', id: '20260101-zz01' }, OWNER, 'RUN', s);
  assert.strictEqual(r.id, '20260101-zz01');
  assert.notStrictEqual(r.id, a.id);
});
t('去重命中會更新舊檔時間（真實 Drive 上 7 天寬限因此重新計算）', () => {
  const s = seed();
  const a = up(s, 'html', true);
  old(s);
  assert.strictEqual(H('scanAssets', {}, OWNER, 'RUN', s).items.length, 1);
  s.nowIso = '2026-11-30T00:00:00.000Z';
  const again = up(s, 'html', true); // 命中舊檔 → 更新時間
  assert.strictEqual(again.id, a.id);
  assert.ok(s.calls.updateText >= 1, '命中時要更新檔案時間');
});
t('includeRecent：7 天內的也列出；移除時用同一個旗標', () => {
  const s = seed();
  const id = up(s, 'img').id;
  assert.strictEqual(H('scanAssets', {}, OWNER, 'RUN', s).items.length, 0);
  assert.strictEqual(H('scanAssets', { includeRecent: true }, OWNER, 'RUN', s).items.length, 1);
  assert.strictEqual(H('trashAssets', { names: [id + '.img'] }, OWNER, 'RUN', s).trashed, 0);
  assert.strictEqual(
    H('trashAssets', { names: [id + '.img'], includeRecent: true }, OWNER, 'RUN', s).trashed,
    1
  );
});

/* ───── 刪卡片＝存檔時一併移到垃圾桶 ───── */
const save = (s, topic, files, base) => {
  const r = H(
    'saveBoard',
    {
      topic,
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
  assert.ok(r.ok, JSON.stringify(r));
  return r;
};
t('畫布刪掉卡片並存檔：沒人用的圖片／HTML 立即移到垃圾桶；仍被保留的卡片不動', () => {
  const s = seed();
  const keep = up(s, 'img').id,
    drop = up(s, 'html').id;
  const r1 = save(s, 'a', ['assets/' + keep + '.img', 'assets/' + drop + '.html']);
  const r2 = save(s, 'a', ['assets/' + keep + '.img'], r1.updatedAt);
  assert.strictEqual(r2.removedAssets, 1);
  assert.strictEqual(s.findFileByName('assets', drop + '.html'), null);
  assert.ok(s.findFileByName('assets', keep + '.img'));
});
t('別張畫布（含私人）還在用的檔案，這張刪卡片時不會被移走', () => {
  const s = seed();
  const id = up(s, 'html').id;
  const r1 = save(s, 'a', ['assets/' + id + '.html']);
  save(s, 'b', ['assets/' + id + '.html']);
  const r2 = save(s, 'a', [], r1.updatedAt);
  assert.strictEqual(r2.removedAssets, 0);
  assert.ok(s.findFileByName('assets', id + '.html'));
});
t('刪卡片後存檔、再「復原」重存：垃圾桶裡的檔案自動救回', () => {
  const s = seed();
  const id = up(s, 'img').id;
  const r1 = save(s, 'a', ['assets/' + id + '.img']);
  const r2 = save(s, 'a', [], r1.updatedAt);
  assert.strictEqual(s.findFileByName('assets', id + '.img'), null);
  save(s, 'a', ['assets/' + id + '.img'], r2.updatedAt);
  assert.ok(s.findFileByName('assets', id + '.img'));
});
t('刪除整張畫布：只被它使用的檔案一併移走，別張在用的保留', () => {
  const s = seed();
  const only = up(s, 'img').id,
    shared = up(s, 'html').id;
  save(s, 'a', ['assets/' + only + '.img', 'assets/' + shared + '.html']);
  save(s, 'b', ['assets/' + shared + '.html']);
  const r = H('deleteBoard', { topic: 'a' }, OWNER, 'RUN', s);
  assert.strictEqual(r.removedAssets, 1);
  assert.strictEqual(s.findFileByName('assets', only + '.img'), null);
  assert.ok(s.findFileByName('assets', shared + '.html'));
});
t('其他畫布讀不了：不移走任何檔案（寧可留著）', () => {
  const s = seed();
  const id = up(s, 'img').id;
  const r1 = save(s, 'a', ['assets/' + id + '.img']);
  save(s, 'b', []);
  s.failRead[s.findFileByName('boards', 'b.canvas.json').fileId] = true;
  const r2 = save(s, 'a', [], r1.updatedAt);
  assert.strictEqual(r2.removedAssets, 0);
  assert.ok(s.findFileByName('assets', id + '.img'));
});
t('畫布裡刪掉「筆記」卡片或 SVG 卡片：只是移除卡片，筆記與 SVG 檔本身不會被刪', () => {
  const s = seed();
  assert.ok(
    H(
      'saveNote',
      { id: '20261020-aa01', text: '---\nid: 20261020-aa01\ntitle: 筆記\ntopic: a\n---\n內文' },
      OWNER,
      'RUN',
      s
    ).ok
  );
  const svg = H(
    'uploadSvg',
    {
      text: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'
    },
    OWNER,
    'RUN',
    s
  );
  const files = ['notes/20261020-aa01.md'].concat(svg.ok ? ['assets/' + svg.id + '.svg'] : []);
  const r1 = save(s, 'a', files);
  const r2 = save(s, 'a', [], r1.updatedAt);
  assert.strictEqual(r2.removedAssets, 0);
  assert.ok(s.findFileByName('notes', '20261020-aa01.md'));
  if (svg.ok) assert.ok(s.findFileByName('assets', svg.id + '.svg'));
  const d = H('deleteBoard', { topic: 'a' }, OWNER, 'RUN', s);
  assert.strictEqual(d.removedAssets, 0);
  assert.ok(s.findFileByName('notes', '20261020-aa01.md'));
});
console.log('\n清理未使用檔案：' + n + ' 項全部通過');
