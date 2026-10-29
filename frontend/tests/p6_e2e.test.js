// 主題公開標示與刪除畫布：真實 Chromium ＋ 真實 build 後 index.html ＋ 真實後端邏輯（假儲存層）。
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
const store = makeStore();
store.saveTopic({ id: 'pubt', title: '公開主題', category: '測試', defaultPublic: true });
store.saveTopic({ id: 'privt', title: '私人主題', category: '測試', defaultPublic: false });
const fm = (id, title, topic, pub) =>
  '---\nid: ' +
  id +
  '\ntitle: ' +
  title +
  '\ntopic: ' +
  topic +
  '\ndate: 2026-10-22\n' +
  (pub === undefined ? '' : 'public: ' + pub + '\n') +
  '---\n內容';
[
  ['20261022-a001', '公開主題的筆記', 'pubt'],
  ['20261022-a002', '私人主題的筆記', 'privt']
].forEach(([id, ti, tp]) =>
  assert.ok(J(handle('saveNote', { id, text: fm(id, ti, tp) }, OWNER, 'RUN', store)).ok)
);
const board = {
  nodes: [{ id: 'A', type: 'text', text: '卡片A', x: 0, y: 0, width: 200, height: 100 }],
  edges: []
};
assert.ok(J(handle('saveBoard', { topic: 'pubt', board }, OWNER, 'RUN', store)).ok);
assert.ok(J(handle('saveBoard', { topic: 'privt', board }, OWNER, 'RUN', store)).ok);
const hasBoard = t => !!store.findFileByName('boards', t + '.canvas.json');

const cvItem = async (p, menu, item) => {
  const b = p.locator('.cv-bar .cv-mbtn', { hasText: menu }).first();
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
  await p.locator('.cv-mlist:not([hidden]) .cv-mi', { hasText: item }).first().click();
}; // 工具列下拉選單：開選單再點項目
let n = 0;
const t = async (name, fn) => {
  await fn();
  n++;
  console.log('通過  ' + name);
};
async function newPage(browser, who) {
  const page = await (
    await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 900 } })
  ).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.route(/^https?:\/\/(?!localhost|127\.)/, r => r.abort());
  await page.exposeFunction('__api', (a, p) => JSON.stringify(handle(a, JSON.parse(p), who, 'RUN', store)));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('vault-editmode', '1');
      localStorage.setItem('vault-shelfmini', '0');
    } catch (e) {}
  }); // 這些測試在「編輯模式」下跑
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
  });
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'index.html'));
  await page.waitForFunction(
    () => document.getElementById('who') && document.getElementById('who').textContent !== '載入中…'
  );
  page.errors = errors;
  return page;
}

(async () => {
  const browser = await chromium.launch();
  try {
    await t(
      '後端：訪客與 REST 讀取不能刪畫布；不存在的主題與格式錯誤回找不到；沒有畫布檔也算成功',
      async () => {
        assert.strictEqual(J(handle('deleteBoard', { topic: 'pubt' }, VISITOR, 'RUN', store)).ok, false);
        assert.strictEqual(J(handle('deleteBoard', { topic: 'pubt' }, OWNER, 'GET', store)).ok, false);
        assert.ok(hasBoard('pubt'));
        assert.strictEqual(J(handle('deleteBoard', { topic: 'nope' }, OWNER, 'RUN', store)).ok, false);
        assert.strictEqual(J(handle('deleteBoard', { topic: '../x' }, OWNER, 'RUN', store)).ok, false);
        store.saveTopic({ id: 'empty', title: '空', category: '', defaultPublic: false });
        const r = J(handle('deleteBoard', { topic: 'empty' }, OWNER, 'RUN', store));
        assert.ok(r.ok && r.existed === false);
      }
    );

    await t('擁有者：書櫃每個主題都標示「公開／私人」，訪客看不到標籤', async () => {
      const p = await newPage(browser, OWNER);
      const txt = async name =>
        (await p.locator('#shelfBody button.pill', { hasText: name }).first().innerText()).replace(
          /\s+/g,
          ' '
        );
      assert.ok(/公開主題\s*公開/.test(await txt('公開主題')), await txt('公開主題'));
      assert.ok(/私人主題\s*私人/.test(await txt('私人主題')), await txt('私人主題'));
      await p.locator('#shelfBody button.pill', { hasText: '私人主題' }).first().click();
      assert.ok((await p.locator('#main .sub').first().innerText()).includes('主題預設：私人'));
      const v = await newPage(browser, VISITOR);
      assert.strictEqual(await v.locator('#shelfBody .tg').count(), 0);
      assert.strictEqual(p.errors.length + v.errors.length, 0, p.errors.concat(v.errors).join('|'));
      await p.close();
      await v.close();
    });

    await t(
      '擁有者：刪除畫布 → 先確認，取消不動；確定後畫布檔移到垃圾桶、畫面清空，主題與筆記都還在',
      async () => {
        const p = await newPage(browser, OWNER);
        await p.locator('#shelfBody button.pill', { hasText: '公開主題' }).first().click();
        await p.getByRole('button', { name: '開啟畫布' }).click();
        await p.waitForSelector('.cv-view');
        await p.waitForFunction(() => document.querySelectorAll('.cv-node').length > 0);
        await cvItem(p, '更多', '刪除畫布');
        await p.waitForSelector('[role=alertdialog]');
        await p.getByRole('button', { name: '取消' }).click();
        assert.ok(hasBoard('pubt'));
        await cvItem(p, '更多', '刪除畫布');
        await p.locator('#cv-del-ok').click();
        await p.waitForFunction(
          () =>
            document.querySelectorAll('.cv-node').length === 0 &&
            /畫布已刪除/.test(document.querySelector('.cv-status').textContent)
        );
        assert.ok(!hasBoard('pubt'));
        assert.ok(hasBoard('privt'), '別的主題的畫布不受影響');
        assert.ok(J(handle('getNote', { id: '20261022-a001' }, OWNER, 'RUN', store)).ok, '筆記還在');
        assert.ok(
          J(handle('listIndex', {}, OWNER, 'RUN', store)).topics.some(x => x.id === 'pubt'),
          '主題還在'
        );
        assert.strictEqual(await p.evaluate(() => VaultUI.canvasState().dirty), false);
        assert.strictEqual(p.errors.length, 0, p.errors.join('|'));
        await p.close();
      }
    );

    await t('訪客：畫布頁沒有「刪除畫布」按鈕', async () => {
      const v = await newPage(browser, VISITOR);
      await v.locator('#shelfBody button.pill', { hasText: '公開主題' }).first().click();
      await v.getByRole('button', { name: '開啟畫布' }).click();
      await v.waitForSelector('.cv-view');
      assert.strictEqual(await v.getByRole('button', { name: '刪除畫布' }).count(), 0);
      await v.close();
    });
    console.log('\n主題標示與刪除畫布：' + n + ' 項全部通過');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n失敗：', e.message);
  process.exit(1);
});
