// 設定疊在目前畫面上：從筆記、編輯器、沉浸閱讀開設定，關掉後回到原處
const H = require('./harness');
const { chromium, assert, OWNER, makeEnv, newPage, t } = H;
const env = makeEnv();
env.store.saveTopic({ id: 'dev', title: '程式筆記' });
env.saveNote(
  '20261024-s001',
  '長筆記',
  'dev',
  undefined,
  '# 開頭\n' + Array(80).fill('一段文字。').join('\n\n') + '\n\n## 結尾\n完'
);
(async () => {
  const browser = await chromium.launch();
  try {
    const bctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 800 } });
    const p = await newPage(bctx, env, OWNER);
    await t('從筆記開設定：改主題與語言後回到同一篇筆記、同樣的捲動位置，不重新讀取', async () => {
      await p.getByText('長筆記').first().click();
      await p.waitForSelector('.md');
      await p.evaluate(() => window.scrollTo(0, 900));
      await p.waitForTimeout(100);
      const y0 = await p.evaluate(() => window.scrollY),
        g0 = p.calls.getNote;
      await p.locator('#btnSettings').click();
      await p.waitForSelector('#s-lang');
      assert.ok((await p.locator('#s-back').textContent()).includes('回到筆記'));
      await p.locator('.th[data-theme-id="dracula"]').click();
      await p.selectOption('#s-lang', 'en');
      await p.waitForFunction(() => document.documentElement.lang === 'en');
      assert.ok((await p.locator('#s-back').textContent()).includes('Back to note'));
      await p.locator('#s-back').click();
      await p.waitForSelector('.md');
      assert.ok((await p.locator('#main h2').first().textContent()).includes('長筆記'));
      assert.strictEqual(p.calls.getNote, g0, '不該重新讀取筆記');
      await p.waitForFunction(y => Math.abs(window.scrollY - y) < 5, y0, { timeout: 3000 });
      assert.strictEqual(
        await p.evaluate(() => document.documentElement.getAttribute('data-theme')),
        'dracula'
      );
      assert.ok(await p.getByRole('button', { name: 'Edit', exact: true }).count());
      await p.locator('#btnSettings').click();
      await p.selectOption('#s-lang', 'zh-Hant');
      await p.locator('.th[data-theme-id="auto"]').click();
      await p.locator('#s-back').click();
    });
    await t('從沉浸閱讀開設定（工具列有「設定」）：關掉後回到那篇筆記', async () => {
      await p.locator('#n-read').click();
      await p.waitForSelector('body.reading');
      await p.locator('#rd-settings').click();
      await p.waitForSelector('#s-lang');
      await p.locator('#s-back').click();
      await p.waitForSelector('.md');
      assert.ok((await p.locator('#main h2').first().textContent()).includes('長筆記'));
    });
    await t('從編輯器開設定：正在編輯的文字原封不動；回來後可繼續編輯與儲存', async () => {
      await p
        .locator('.tbtn', { hasText: /^編輯$/ })
        .first()
        .click();
      await p.waitForSelector('textarea.body');
      await p.fill('textarea.body', '改到一半的內文');
      await p.locator('#btnSettings').click();
      await p.waitForSelector('#s-lang');
      assert.ok((await p.locator('#s-back').textContent()).includes('回到編輯'));
      await p.locator('#s-back').click();
      await p.waitForSelector('textarea.body');
      assert.strictEqual(await p.inputValue('textarea.body'), '改到一半的內文');
      assert.ok(!p.calls.saveNote, '開關設定不應儲存');
      await p.locator('button', { hasText: '捨棄草稿' }).click();
    });
    await t('設定開著時按搜尋或書櫃，會正常離開設定；沒有 JavaScript 錯誤', async () => {
      await p.locator('#btnSettings').click();
      await p.waitForSelector('#s-lang');
      await p.locator('#shelfBody button.pill').first().click();
      await p.waitForSelector('#main .list');
      assert.strictEqual(await p.locator('#s-lang').count(), 0);
      assert.deepStrictEqual(p.errors, []);
    });
    console.log('\n設定疊加端對端：' + H.count() + ' 項全部通過');
  } catch (e) {
    console.error('\n失敗：', e.stack.split('\n').slice(0, 6).join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
