// 端對端測試共用：真實 Chromium ＋ build 後的 index.html ＋ 真實後端邏輯（Core.gs 跑在假儲存層）
const { chromium } = require('playwright');
const vm = require('vm'),
  fs = require('fs'),
  path = require('path'),
  assert = require('assert');
const makeStore = require('../../backend/tests/fake_store');
const BE = path.join(__dirname, '..', '..', 'backend');
const ctx = vm.createContext({ console, Logger: { log() {} } });
['Yaml.gs', 'Svg.gs', 'Core.gs', 'Sync.gs', 'Code.gs', 'Store.gs'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(BE, f), 'utf8'), ctx, { filename: f })
);
const handle = vm.runInContext('handle_', ctx);
const OWNER = { isOwner: true, active: 'me@gmail.com' },
  VISITOR = { isOwner: false, active: '' };
const J = o => JSON.parse(JSON.stringify(o));
const fm = (id, title, topic, pub, body, extra) =>
  '---\nid: ' +
  id +
  '\ntitle: ' +
  title +
  '\ntopic: ' +
  topic +
  '\ndate: ' +
  ((extra && extra.date) || '2026-10-22') +
  '\n' +
  (pub === undefined ? '' : 'public: ' + pub + '\n') +
  (extra && extra.cover ? 'cover: ' + extra.cover + '\n' : '') +
  (extra && extra.lang ? 'lang: ' + extra.lang + '\n' : '') +
  (extra && extra.translation_of ? 'translation_of: ' + extra.translation_of + '\n' : '') +
  (extra && extra.tags ? 'tags: [' + extra.tags.join(', ') + ']\n' : '') +
  '---\n' +
  body;
function makeEnv() {
  const store = makeStore();
  const saveNote = (id, ...a) => {
    const r = J(handle('saveNote', { id, text: fm(id, ...a) }, OWNER, 'RUN', store));
    assert.ok(r.ok, JSON.stringify(r));
    return r;
  };
  const updateNote = (id, ...a) => {
    const cur = J(handle('getNote', { id }, OWNER, 'RUN', store));
    const r = J(
      handle('saveNote', { id, text: fm(id, ...a), baseUpdatedAt: cur.updatedAt }, OWNER, 'RUN', store)
    );
    assert.ok(r.ok, JSON.stringify(r));
    return r;
  };
  return { store, saveNote, updateNote, call: (a, p, who) => J(handle(a, p, who || OWNER, 'RUN', store)) };
}
const settle = page =>
  page.evaluate(
    () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))))
  );
/** 在 browserContext 內開新頁；who 可以是物件或回傳物件的函式；calls 會累計每個 API 動作的呼叫次數 */
async function newPage(browserCtx, env, who, opts) {
  const page = await browserCtx.newPage();
  const errors = [];
  page.calls = {};
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.route(/^https?:\/\/(?!localhost|127\.)/, r => r.abort());
  await page.exposeFunction('__api', (a, p) => {
    page.calls[a] = (page.calls[a] || 0) + 1;
    return JSON.stringify(
      handle(a, JSON.parse(p), typeof who === 'function' ? who() : who, 'RUN', env.store)
    );
  });
  if (!(opts && opts.reading))
    await page.addInitScript(() => {
      try {
        localStorage.setItem('vault-editmode', '1');
      } catch (e) {}
    });
  if (!(opts && opts.mini))
    await page.addInitScript(() => {
      try {
        localStorage.setItem('vault-shelfmini', '0');
      } catch (e) {}
    }); // 既有測試用「書櫃固定展開」；收成側邊另有測試   // 既有測試都在「編輯模式」下跑；閱讀模式另有測試
  await page.addInitScript(() => {
    const make = (ok, ng) => ({
      withSuccessHandler: f => make(f, ng),
      withFailureHandler: f => make(ok, f),
      api: (a, p) => {
        window
          .__api(a, JSON.stringify(p || {}))
          .then(r => ok && ok(JSON.parse(r)))
          .catch(e => ng && ng(e));
      }
    });
    window.google = { script: { run: make(null, null) } };
    if (window.__lang)
      try {
        Object.defineProperty(navigator, 'language', { get: () => window.__lang });
        Object.defineProperty(navigator, 'languages', { get: () => [window.__lang] });
      } catch (e) {
        /* 略 */
      }
  });
  if (opts && opts.lang)
    await page.addInitScript(l => {
      window.__lang = l;
      Object.defineProperty(navigator, 'language', { get: () => l });
      Object.defineProperty(navigator, 'languages', { get: () => [l] });
    }, opts.lang);
  let file = path.join(__dirname, '..', '..', 'dist', 'index.html');
  if (opts && opts.route) {
    // 模擬後端 doGet 注入的 ?note=&topic=&lang=（Code.gs 以同樣方式取代佔位）
    file = path.join(require('os').tmpdir(), 'vault-route-' + process.pid + '-' + Date.now() + '.html');
    fs.writeFileSync(
      file,
      fs
        .readFileSync(path.join(__dirname, '..', '..', 'dist', 'index.html'), 'utf8')
        .replace('/*__ROUTE__*/null', JSON.stringify(opts.route))
    );
  }
  await page.goto('file://' + file);
  await page.waitForFunction(
    () =>
      document.getElementById('who') &&
      document.getElementById('who').textContent !== '載入中…' &&
      document.getElementById('who').textContent !== 'Loading…'
  );
  page.errors = errors;
  return page;
}
let n = 0;
const t = async (name, fn) => {
  await fn();
  n++;
  console.log('通過  ' + name);
};
module.exports = {
  chromium,
  assert,
  path,
  fs,
  handle,
  OWNER,
  VISITOR,
  J,
  fm,
  makeEnv,
  newPage,
  settle,
  t,
  count: () => n
};
