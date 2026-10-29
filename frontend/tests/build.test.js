// 建置清單檢查：modules.json 與資料夾一致，避免「新增了檔案卻沒被內嵌／沒被翻譯檢查掃到」。
const assert = require('assert'),
  fs = require('fs'),
  path = require('path');
const root = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'modules.json'), 'utf8'));
let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('通過  ' + name);
};

t('modules.json 列的每個檔案都存在，且沒有重複', () => {
  const all = cfg.vendor.concat(cfg.modules);
  all.forEach(f => assert.ok(fs.existsSync(path.join(root, f)), '找不到 ' + f));
  assert.strictEqual(new Set(all).size, all.length, '清單有重複');
});
t('frontend/ 資料夾裡的 .js（除了 build.js）都必須列在 modules.json（否則不會進 index.html）', () => {
  const listed = new Set(cfg.modules);
  const loose = fs.readdirSync(root).filter(f => /\.js$/.test(f) && f !== 'build.js' && !listed.has(f));
  assert.deepStrictEqual(loose, [], '這些檔案沒列在 modules.json：' + loose.join(', '));
});
t('index.src.html 有建置需要的所有佔位，且沒有手寫的 <script> 區塊', () => {
  const html = fs.readFileSync(path.join(root, 'index.src.html'), 'utf8');
  ['<!--__VENDOR__-->', '<!--__MODULES__-->', '/*__CSS__*/', '/*__I18N__*/', '/*__ROUTE__*/'].forEach(k =>
    assert.ok(html.includes(k), k)
  );
  assert.strictEqual(
    (html.match(/<script/g) || []).length,
    2,
    '只應有 ROUTE 與 I18N 兩個內嵌設定，其餘由 modules.json 產生'
  );
});
t('site/lib/logic.js 與 frontend/logic.js 完全相同（靜態站用副本；改了 frontend/logic.js 請 cp 過去）', () => {
  const a = fs.readFileSync(path.join(root, 'logic.js'), 'utf8');
  const b = fs.readFileSync(path.join(root, '..', 'site', 'lib', 'logic.js'), 'utf8');
  assert.strictEqual(a, b, '請執行：cp frontend/logic.js site/lib/logic.js');
});
t('repo 內所有檔名都是 ASCII（GitHub 網頁上傳會略過中文檔名）', () => {
  const top = path.join(root, '..'),
    bad = [];
  (function walk(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
      if (['node_modules', 'release', 'shots'].includes(e.name)) return;
      const p = path.join(d, e.name);
      if (/[^\x00-\x7F]/.test(e.name)) bad.push(path.relative(top, p));
      if (e.isDirectory()) walk(p);
    });
  })(top);
  assert.deepStrictEqual(bad, [], '這些檔名含非 ASCII：' + bad.join(', '));
});
console.log('\n建置清單：' + n + ' 項全部通過');
