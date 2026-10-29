// P12 版面：寬螢幕左右擴張、書櫃收成側邊小條（可浮動展開、可固定）、手機版不受影響
const H = require('./harness');
const { chromium, assert, OWNER, makeEnv, newPage, settle, t } = H;
const env = makeEnv();
env.store.saveTopic({ id: 'pub', title: '公開本', defaultPublic: true });
env.saveNote('20261020-aa01', '原子習慣', 'pub', true, '關於習慣的長長內文。'.repeat(40));
(async () => {
  const browser = await chromium.launch();
  try {
    const wide = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1900, height: 900 } });
    const o = await newPage(wide, env, OWNER, { mini: true });
    await settle(o);
    const wrapW = () =>
      o
        .locator('.wrap')
        .boundingBox()
        .then(b => b.width);
    await t(
      '寬螢幕：版面隨螢幕擴張（不再卡在 70rem）；書櫃預設是窄條（≤ 60px），內容區佔滿其餘寬度',
      async () => {
        assert.ok((await wrapW()) > 1500, 'wrap ' + (await wrapW()));
        const sb = await o.locator('#shelf').boundingBox();
        assert.ok(sb.width <= 60, 'shelf ' + sb.width);
        const mb = await o.locator('#main').boundingBox();
        assert.ok(mb.width > 1500, 'main ' + mb.width);
        assert.strictEqual(await o.locator('#shelfBody').isVisible(), false);
      }
    );
    await t('點小條：書櫃以浮動面板展開（不推擠內容）；選主題後自動收起；點外面或 Esc 也收起', async () => {
      const m0 = (await o.locator('#main').boundingBox()).x;
      await o.locator('#shelf summary').click();
      assert.ok(await o.locator('#shelfBody').isVisible());
      assert.strictEqual((await o.locator('#main').boundingBox()).x, m0);
      await o.locator('#shelfBody button.pill', { hasText: '公開本' }).first().click();
      await settle(o);
      assert.strictEqual(await o.locator('#shelfBody').isVisible(), false);
      await o.locator('#shelf summary').click();
      await o.mouse.click(1200, 600);
      await settle(o);
      assert.strictEqual(await o.locator('#shelfBody').isVisible(), false);
      await o.locator('#shelf summary').click();
      await o.keyboard.press('Escape');
      await settle(o);
      assert.strictEqual(await o.locator('#shelfBody').isVisible(), false);
    });
    await t('閱讀筆記時內文維持舒適行寬（原本的窄欄設計不變）', async () => {
      await o.locator('text=原子習慣').first().click();
      await settle(o);
      const b = await o.locator('#main > .md').boundingBox();
      assert.ok(b.width <= 42 * 16 + 4, 'md ' + b.width);
    });
    await t('「📌 固定展開」：書櫃回到左側欄；重新整理仍記得；「« 收成側邊」可再收起', async () => {
      await o.locator('#shelf summary').click();
      await o.locator('#shelf-pin').click();
      await settle(o);
      assert.ok((await o.locator('#shelf').boundingBox()).width > 200);
      assert.ok(await o.locator('#shelfBody').isVisible());
      await o.reload();
      await settle(o);
      assert.ok((await o.locator('#shelf').boundingBox()).width > 200);
      await o.locator('#shelf-pin').click();
      await settle(o);
      assert.ok((await o.locator('#shelf').boundingBox()).width <= 60);
    });
    await t('編輯器：寬螢幕並排預覽各佔一半、很寬', async () => {
      await o.locator('#tools button', { hasText: /^新增$/ }).click();
      await o.waitForSelector('textarea.body');
      const ta = await o.locator('textarea.body').boundingBox(),
        pv = await o.locator('#f-preview').boundingBox();
      assert.ok(ta.width > 600 && pv.width > 600, ta.width + ',' + pv.width);
    });
    const phone = await browser.newContext({
      locale: 'zh-TW',
      viewport: { width: 390, height: 800 },
      hasTouch: true,
      isMobile: true
    });
    await t(
      '手機：沒有側邊小條與固定鈕；書櫃照舊（摺疊在上方）；沒有橫向捲動；編輯器是「編輯／預覽」切換',
      async () => {
        const m = await newPage(phone, env, OWNER, { mini: true });
        await settle(m);
        assert.strictEqual(
          await m
            .locator('#shelf-pin')
            .isVisible()
            .catch(() => false),
          false
        );
        const sb = await m.locator('#shelf').boundingBox();
        assert.ok(sb.width > 300, 'shelf ' + sb.width);
        assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        await m.locator('#shelf summary').tap();
        assert.ok(await m.locator('#shelfBody').isVisible());
        const pos = await m.locator('#shelfBody').evaluate(e => getComputedStyle(e).position);
        assert.notStrictEqual(pos, 'fixed');
        await m.locator('#shelf summary').tap();
        await m.evaluate(() => VaultUI.openEditor(null));
        await m.waitForSelector('textarea.body');
        assert.deepStrictEqual(await m.locator('.ed-seg button').allTextContents(), ['編輯', '預覽']);
        assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        await m.close();
      }
    );
    console.log('\nP12 版面：' + H.count() + ' 項全部通過');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n失敗：', e.message);
  process.exit(1);
});
