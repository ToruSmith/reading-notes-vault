#!/usr/bin/env node
// 一鍵跑全部測試：node tools/test_all.js [關鍵字…]
//   會先重建 dist/index.html 與 dist/Vault_all.gs，再平行跑後端、前端、靜態站的所有測試，最後列出總表。
//   帶關鍵字只跑檔名含該字的測試，例如：node tools/test_all.js canvas p7
//   環境變數 JOBS=4 可調整同時跑幾個（預設 3）。
const { spawn, execFileSync } = require('child_process'),
  fs = require('fs'),
  path = require('path');
const root = path.join(__dirname, '..');
const pick = process.argv.slice(2),
  JOBS = +process.env.JOBS || 3;
execFileSync('node', [path.join(root, 'frontend/build.js')], { stdio: 'inherit' });
execFileSync('node', [path.join(root, 'backend/build.js')], { stdio: 'inherit' });
const suites = [];
const add = (dir, env) =>
  fs
    .readdirSync(path.join(root, dir))
    .filter(f => /\.test\.js$/.test(f))
    .sort()
    .forEach(f =>
      suites.push({ name: dir + '/' + f + (env ? '（打包版）' : ''), file: path.join(root, dir, f), env })
    );
add('backend/tests');
add('backend/tests', { BUNDLE: '1' });
add('frontend/tests');
if (fs.existsSync(path.join(root, 'site/tests'))) add('site/tests');
const todo = suites.filter(s => !pick.length || pick.some(k => s.name.includes(k)));
// 含效能門檻的測試（繪製時間）在平行負載下會誤判，最後單獨跑
const SOLO = /canvas_e2e|p7_e2e/;
const par = todo.filter(s => !SOLO.test(s.name)),
  solo = todo.filter(s => SOLO.test(s.name));
const res = [];
let i = 0;
const t0 = Date.now();
function run(s) {
  return new Promise(done => {
    const st = Date.now(),
      p = spawn('node', [s.file], {
        cwd: path.dirname(s.file),
        env: Object.assign({}, process.env, s.env || {})
      });
    let out = '';
    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (out += d));
    const kill = setTimeout(() => p.kill('SIGKILL'), 10 * 60 * 1000);
    p.on('close', code => {
      clearTimeout(kill);
      res.push({ s, code, out, ms: Date.now() - st });
      console.log(
        (code === 0 ? '  通過  ' : '✗ 失敗  ') +
          s.name +
          '（' +
          ((Date.now() - st) / 1000).toFixed(1) +
          ' 秒）'
      );
      done();
    });
  });
}
async function worker() {
  while (i < par.length) await run(par[i++]);
}
Promise.all(Array.from({ length: Math.min(JOBS, par.length) || 0 }, worker))
  .then(() => solo.reduce((p, s) => p.then(() => run(s)), Promise.resolve()))
  .then(() => {
    const bad = res.filter(r => r.code !== 0);
    bad.forEach(r => {
      console.log('\n──── ' + r.s.name + ' 的最後輸出 ────');
      console.log(r.out.split('\n').slice(-25).join('\n'));
    });
    console.log(
      '\n共 ' +
        res.length +
        ' 組，通過 ' +
        (res.length - bad.length) +
        '，失敗 ' +
        bad.length +
        '（' +
        ((Date.now() - t0) / 1000).toFixed(0) +
        ' 秒）'
    );
    process.exit(bad.length ? 1 : 0);
  });
