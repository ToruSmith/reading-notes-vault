// 全螢幕工具列收成下拉；橫向手機（矮螢幕）畫布夠高；閱讀模式／訪客的畫布佔滿寬度
const H = require('./harness');
const { chromium, assert, OWNER, VISITOR, makeEnv, newPage, settle, t } = H;
const env = makeEnv();
env.store.saveTopic({ id: 'pub', title: '公開本', defaultPublic: true });
assert.ok(
  env.call('saveBoard', {
    topic: 'pub',
    board: { nodes: [{ id: 'A', type: 'text', text: '甲', x: 0, y: 0, width: 240, height: 120 }], edges: [] }
  }).ok
);
const open = async p => {
  await p.locator('#shelfBody button.pill', { hasText: '公開本' }).first().click();
  await p.getByRole('button', { name: '開啟畫布' }).click();
  await p.waitForSelector('.cv-view');
  await p.waitForFunction(() => document.querySelectorAll('.cv-node').length >= 1);
  await settle(p);
};
(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 880, height: 400 } });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('vault-cvzoomclick', '0');
      } catch (e) {}
    });
    const o = await newPage(ctx, env, OWNER);
    await open(o);
    await t('一般狀態：「☰ 工具」不顯示，所有按鈕照舊在工具列上', async () => {
      assert.strictEqual(await o.locator('.cv-toolsbtn').isVisible(), false);
      assert.ok(await o.getByRole('button', { name: '簡報', exact: true }).isVisible());
    });
    await t(
      '全螢幕：標題收起、工具列只剩一列（縮放、全螢幕、☰ 工具、儲存）；畫布高度夠（矮螢幕）',
      async () => {
        await o.getByRole('button', { name: '全螢幕', exact: true }).click();
        await settle(o);
        assert.strictEqual(await o.locator('#main > h2').isVisible(), false);
        assert.ok(await o.locator('.cv-toolsbtn').isVisible());
        assert.strictEqual(await o.getByRole('button', { name: '簡報', exact: true }).isVisible(), false);
        const bar = await o.locator('.cv-bar').boundingBox(),
          v = await o.locator('.cv-view').boundingBox();
        assert.ok(bar.height < 60, 'bar ' + bar.height);
        assert.ok(v.height > 400 - 110, 'view ' + v.height);
        assert.ok(await o.locator('.cv-save, .cv-b.primary').first().isVisible(), '儲存留在外面');
      }
    );
    await t('☰ 工具：點開看得到全部按鈕與下拉選單；選功能後自動收起；點外面也收起', async () => {
      await o.locator('.cv-toolsbtn').click();
      assert.ok(await o.getByRole('button', { name: '簡報', exact: true }).isVisible());
      assert.ok(await o.locator('.cv-bar .cv-mbtn', { hasText: '＋ 新增' }).isVisible());
      await o.locator('.cv-bar .cv-mbtn', { hasText: '更多' }).click();
      assert.ok(await o.locator('.cv-mlist:not([hidden]) .cv-mi').first().isVisible());
      await o.locator('.cv-mlist:not([hidden]) .cv-mi', { hasText: '分享連結' }).click();
      await settle(o);
      assert.strictEqual(
        await o.getByRole('button', { name: '簡報', exact: true }).isVisible(),
        false,
        '選完自動收起'
      );
      await o.locator('.cv-toolsbtn').click();
      await o.mouse.click(300, 250);
      await settle(o);
      assert.strictEqual(await o.getByRole('button', { name: '簡報', exact: true }).isVisible(), false);
      await o.locator('.cv-toolsbtn').click();
      await o.getByRole('button', { name: '簡報', exact: true }).click();
      await settle(o);
      assert.ok(await o.locator('#pres-n').isVisible());
      await o.keyboard.press('Escape');
      await settle(o);
    });
    await t('離開全螢幕後恢復原本的工具列', async () => {
      await o.getByRole('button', { name: '離開全螢幕', exact: true }).click();
      await settle(o);
      assert.ok(await o.getByRole('button', { name: '簡報', exact: true }).isVisible());
      assert.strictEqual(await o.locator('.cv-toolsbtn').isVisible(), false);
    });
    const wide = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1000, height: 700 } });
    await t(
      '閱讀模式（擁有者預設）與訪客：畫布佔滿整個寬度，沒有空的屬性欄位置；編輯模式才留屬性欄',
      async () => {
        const v = await newPage(wide, env, VISITOR);
        await open(v);
        const wb = await v.locator('.cv-wrap').boundingBox(),
          vb = await v.locator('.cv-view').boundingBox();
        assert.ok(vb.width > wb.width - 4, vb.width + ' vs ' + wb.width);
        await v.close();
        const e = await newPage(wide, env, OWNER);
        await open(e);
        const wb2 = await e.locator('.cv-wrap').boundingBox(),
          vb2 = await e.locator('.cv-view').boundingBox();
        assert.ok(vb2.width < wb2.width - 200, '編輯模式有屬性欄');
        await e.close();
      }
    );
    console.log('\n全螢幕工具列：' + H.count() + ' 項全部通過');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n失敗：', e.message);
  process.exit(1);
});
