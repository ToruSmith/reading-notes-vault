// P13：未編輯不留草稿、新筆記只留一份、過期自動清；閱讀頁置中與字級；書櫃按鈕
const H = require('./harness');
const { chromium, assert, OWNER, makeEnv, newPage, settle, t } = H;
const env = makeEnv();
env.store.saveTopic({ id: 'pub', title: '公開本', defaultPublic: true });
env.saveNote('20261020-aa01', '原子習慣', 'pub', true, '關於習慣的長長內文。'.repeat(40));
(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1900, height: 900 } });
    const o = await newPage(ctx, env, OWNER, { mini: true });
    await settle(o);
    const count = () => o.evaluate(() => VaultUI.Drafts.all().then(a => a.length));
    await t('點開舊筆記的編輯器但沒改：離開／切走時不產生草稿', async () => {
      await o.evaluate(() => VaultUI.openEditor('20261020-aa01'));
      await o.waitForSelector('textarea.body');
      await o.evaluate(() => VaultUI.flushDraft());
      await o.waitForTimeout(700);
      assert.strictEqual(await count(), 0);
    });
    await t('新增筆記但沒打字：沒有草稿；打了標題才有一份', async () => {
      await o.evaluate(() => VaultUI.openEditor(null));
      await o.waitForSelector('#f-title');
      await o.evaluate(() => VaultUI.flushDraft());
      assert.strictEqual(await count(), 0);
      await o.fill('#f-title', '草稿測試');
      await o.waitForTimeout(800);
      assert.strictEqual(await count(), 1);
    });
    await t('再按一次「新增」：還原同一份草稿，不會多生一份', async () => {
      await o.evaluate(() => VaultUI.openEditor(null));
      await o.waitForSelector('#f-title');
      assert.strictEqual(await o.inputValue('#f-title'), '草稿測試');
      await o.fill('#f-title', '草稿測試二');
      await o.waitForTimeout(800);
      assert.strictEqual(await count(), 1);
    });
    await t('把內容改回原樣：草稿自動消失', async () => {
      await o.fill('#f-title', '');
      await o.waitForTimeout(800);
      assert.strictEqual(await count(), 0);
    });
    await t('過期草稿自動清除（prune 30 天），新的保留', async () => {
      const n = await o.evaluate(async () => {
        await VaultUI.Drafts.put({
          key: 'old1',
          isNew: false,
          f: {},
          body: 'x',
          savedAt: Date.now() - 40 * 864e5
        });
        await VaultUI.Drafts.put({ key: 'new1', isNew: false, f: {}, body: 'y', savedAt: Date.now() });
        const removed = await VaultUI.Drafts.prune(30);
        const left = (await VaultUI.Drafts.all()).map(d => d.key);
        return { removed, left };
      });
      assert.strictEqual(n.removed, 1);
      assert.deepStrictEqual(n.left, ['new1']);
    });
    await t('設定頁：顯示草稿數，「全部清除」清空', async () => {
      await o.evaluate(() => VaultUI.openEditor(null)); // 離開編輯器以便開設定
      await o.evaluate(() => {
        VaultUI.S.edit = null;
        VaultUI.S.settings = true;
        VaultUI.render();
      });
      await o.waitForSelector('#s-dcount');
      await o.waitForFunction(() => /1/.test(document.getElementById('s-dcount').textContent));
      await o.click('#s-dclear');
      await o.waitForFunction(() => /沒有/.test(document.getElementById('s-dcount').textContent));
      assert.strictEqual(await count(), 0);
    });
    await t('閱讀頁：標題與內文同一欄、左右置中', async () => {
      await o.evaluate(() => {
        VaultUI.S.settings = false;
        VaultUI.S.edit = null;
        VaultUI.openNote('20261020-aa01');
      });
      await o.waitForSelector('#main > .md');
      const m = await o.locator('#main').boundingBox(),
        b = await o.locator('#main > .md').boundingBox(),
        h = await o.locator('#main > h2').boundingBox();
      assert.ok(
        Math.abs(b.x - m.x - (m.x + m.width - b.x - b.width)) < 4,
        'md 左右差 ' + (b.x - m.x) + ',' + (m.x + m.width - b.x - b.width)
      );
      assert.ok(Math.abs(h.x - b.x) < 2, 'h2 與 md 同欄');
    });
    await t('字級 A+/A−：內文變大變小、欄寬跟著變、重新整理仍記得；設定頁可還原預設', async () => {
      const fs = () => o.locator('#main > .md').evaluate(e => parseFloat(getComputedStyle(e).fontSize));
      const w0 = (await o.locator('#main > .md').boundingBox()).width,
        f0 = await fs();
      await o.click('#n-fsup');
      await o.click('#n-fsup');
      const f1 = await fs();
      assert.ok(f1 > f0 * 1.15, f0 + '→' + f1);
      assert.ok((await o.locator('#main > .md').boundingBox()).width > w0);
      const o2 = await newPage(ctx, env, OWNER, { mini: true });
      await settle(o2); // 同一個瀏覽器的另一個分頁＝等同重新開啟
      await o2.evaluate(() => VaultUI.openNote('20261020-aa01'));
      await o2.waitForSelector('#main > .md');
      assert.strictEqual(
        await o2.locator('#main > .md').evaluate(e => parseFloat(getComputedStyle(e).fontSize)),
        f1
      );
      await o2.close();

      await o.click('#n-fsdn');
      await o.click('#n-fsdn');
      assert.strictEqual(await fs(), f0);
    });
    await t('書櫃側條：一顆約 2.6rem 的圓角按鈕，展開時反白', async () => {
      const b = await o.locator('#shelf summary').boundingBox();
      assert.ok(b.width > 36 && b.width < 48 && Math.abs(b.width - b.height) < 2, b.width + 'x' + b.height);
      const bg0 = await o.locator('#shelf summary').evaluate(e => getComputedStyle(e).backgroundColor);
      await o.locator('#shelf summary').click();
      await o.waitForTimeout(400); // 等 .15s 的色彩過場
      assert.notStrictEqual(
        await o.locator('#shelf summary').evaluate(e => getComputedStyle(e).backgroundColor),
        bg0
      );
    });
    console.log('\nP13：' + H.count() + ' 項全部通過');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n失敗：', e.message);
  process.exit(1);
});
