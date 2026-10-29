#!/usr/bin/env node
// 產生發布版 ZIP：node tools/make_release.js
//   先重建 dist/，再把「部署需要的檔案＋文件＋範例」打包成 release/讀書筆記Vault_發布版_v<版本>.zip。
//   版本號取自 package.json 的 version。發布前請先跑 node tools/test_all.js 確認全綠。
const fs = require('fs'),
  path = require('path'),
  { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
execFileSync('node', [path.join(root, 'frontend/build.js')], { stdio: 'inherit' });
execFileSync('node', [path.join(root, 'backend/build.js')], { stdio: 'inherit' });
const JSZip = require(path.join(root, 'frontend/vendor/jszip.min.js'));
const ver = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version.replace(/\.0$/, '');
const top = '讀書筆記Vault_發布版_v' + ver;
const zip = new JSZip();
const add = (from, to) => {
  const p = path.join(root, from);
  if (fs.statSync(p).isDirectory()) fs.readdirSync(p).forEach(f => add(path.join(from, f), path.join(to, f)));
  else zip.file(top + '/' + to.split(path.sep).join('/'), fs.readFileSync(p));
};
add('dist/Vault_all.gs', '後端/Vault_all.gs');
add('dist/index.html', '前端/index.html');
add('examples', '範例資料');
['使用說明書.md', 'AI協作提示詞.md', '安全自查報告.md'].forEach(f => add('docs/' + f, '文件/' + f));
['LICENSE', 'CHANGELOG.md'].forEach(f => add(f, '文件/' + f));
// 選配靜態站：不含測試
(function walk(rel) {
  fs.readdirSync(path.join(root, rel)).forEach(f => {
    const r = path.join(rel, f);
    if (f === 'tests' || f === 'node_modules') return;
    if (fs.statSync(path.join(root, r)).isDirectory()) walk(r);
    else add(r, path.join('選配_靜態站', path.relative('site', r)));
  });
})('site');
zip.file(
  top + '/先讀我.txt',
  '讀書筆記 Vault 發布版 v' + ver + '\n1. 後端/Vault_all.gs → 貼進 Apps Script（Code.gs 全選取代）\n' +
    '2. 前端/index.html → 貼進前端網頁\n3. 詳細步驟：文件/使用說明書.md\n4. 原始碼與維護：請見 GitHub repo（內有 CLAUDE.md）\n'
);
zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }).then(buf => {
  fs.mkdirSync(path.join(root, 'release'), { recursive: true });
  const out = path.join(root, 'release', top + '.zip');
  fs.writeFileSync(out, buf);
  console.log('已產生 ' + path.relative(root, out) + '（' + Math.round(buf.length / 1024) + ' KB）');
});
