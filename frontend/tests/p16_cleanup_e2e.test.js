// P16：設定頁「清理未使用檔案」（掃描、預設全選、取消勾選、移到垃圾桶；訪客看不到）
const H = require('./harness');
const { chromium, assert, OWNER, VISITOR, makeEnv, newPage, settle, t } = H;
const env = makeEnv();
env.store.saveTopic({ id: 'pub', title: '公開本', defaultPublic: true });
const IMG = 'data:image/png;base64,iVBORw0KGgo=';
const used = env.call('uploadImage', { data: IMG }).id;
const free1 = env.call('uploadImage', { data: IMG }).id;
const free2 = env.call('uploadHtml', { text: '<h1>x</h1>' }).id;
env.call('saveBoard', {
  topic: 'pub',
  board: {
    nodes: [{ id: 'n', type: 'file', file: 'assets/' + used + '.img', x: 0, y: 0, width: 200, height: 100 }],
    edges: []
  }
});
env.store.nowIso = '2026-11-30T00:00:00.000Z'; // 檔案都已超過 7 天
(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1400, height: 900 } });
    const open = async who => {
      const p = await newPage(ctx, env, who, { mini: true });
      await settle(p);
      await p.evaluate(() => {
        VaultUI.S.settings = true;
        VaultUI.render();
      });
      return p;
    };
    const o = await open(OWNER);
    await t('掃描：只列出沒被任何畫布使用的 2 個檔，預設全選', async () => {
      await o.click('#s-cscan');
      await o.waitForSelector('#s-clist .cleanrow');
      assert.strictEqual(await o.locator('#s-clist .cleanrow').count(), 2);
      const txt = await o.locator('#s-clist').innerText();
      assert.ok(txt.includes(free1) && txt.includes(free2) && !txt.includes(used));
      assert.strictEqual(await o.locator('#s-clist input:checked').count(), 2);
    });
    await t('取消勾選一個再移除：只移被勾選的；用中的檔案與取消的檔案都還在', async () => {
      await o.locator('#s-clist .cleanrow', { hasText: free2 }).locator('input').uncheck();
      await o.click('#s-cgo');
      await o.waitForFunction(() => /已移到垃圾桶 1/.test(document.getElementById('s-cinfo').textContent));
      assert.strictEqual(env.store.findFileByName('assets', free1 + '.img'), null);
      assert.ok(env.store.findFileByName('assets', free2 + '.html'));
      assert.ok(env.store.findFileByName('assets', used + '.img'));
    });
    await t('再掃一次：只剩被取消的那個', async () => {
      await o.click('#s-cscan');
      await o.waitForFunction(() => document.querySelectorAll('#s-clist .cleanrow').length === 1);
      assert.ok((await o.locator('#s-clist').innerText()).includes(free2));
    });
    await t('訪客的設定頁沒有清理區塊', async () => {
      const v = await open(VISITOR);
      assert.strictEqual(await v.locator('#s-cscan').count(), 0);
    });
    console.log('\nP16：' + H.count() + ' 項全部通過');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n失敗：', e.message);
  process.exit(1);
});
