// P14：首頁「分類」頁簽（依順序列出、可收合、擁有者調整順序並同步到書櫃；訪客只讀且不見私人分類）
const H = require('./harness');
const { chromium, assert, OWNER, VISITOR, makeEnv, newPage, settle, t } = H;
const env = makeEnv();
env.store.saveTopic({ id: 'a', title: '甲主題', category: '學習', defaultPublic: true });
env.store.saveTopic({ id: 'b', title: '乙主題', category: '學習', defaultPublic: true });
env.store.saveTopic({ id: 'x', title: '日記本', category: '生活', defaultPublic: true });
env.store.saveTopic({ id: 'sec', title: '祕密本', category: '私密分類', defaultPublic: false });
env.store.saveTopic({ id: 'empty', title: '空主題', category: '學習', defaultPublic: true });
env.saveNote('20261020-aa01', '筆記一', 'a', true, '內文');
env.saveNote('20261021-bb01', '筆記二', 'b', true, '內文');
env.saveNote('20261022-cc01', '筆記三', 'x', true, '內文');
env.saveNote('20261023-dd01', '祕密筆記', 'sec', false, '內文');
(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1400, height: 900 } });
    const o = await newPage(ctx, env, OWNER, { mini: true });
    await settle(o);
    const cats = () => o.locator('.catbox .catname').allTextContents();
    const topicsIn = n => o.locator('.catbox').nth(n).locator('.tcard-t').allTextContents();
    await t('首頁有「列表／分類／圖庫／日曆」四個頁簽，預設仍是列表', async () => {
      assert.deepStrictEqual(await o.locator('.vtab').allTextContents(), ['列表', '分類', '圖庫', '日曆']);
      assert.strictEqual(await o.locator('.vtab.on').textContent(), '列表');
    });
    await t('分類頁簽：預設依標題排；只展開第一個；編輯模式才看到空主題', async () => {
      await o.locator('.vtab', { hasText: '分類' }).click();
      const c = await cats();
      assert.strictEqual(c.length, 3, c.join());
      assert.ok(!c.includes('未分類'));
      assert.strictEqual(await o.locator('.catbox[open]').count(), 1);
      await o.locator('.catbox').nth(0).locator('summary').click();
      await o.locator('.catbox').nth(1).locator('summary').click();
      await o.locator('.catbox').nth(2).locator('summary').click();
      assert.ok((await o.locator('.tcard-t').allTextContents()).includes('空主題'));
    });
    await t('↑↓ 調整分類：畫面立刻變、書櫃跟著變、重新載入仍在（後端有存）', async () => {
      const before = await cats(),
        last = before.length - 1;
      await o.locator('.catbox').nth(last).locator('summary .ordbtn').first().click();
      await settle(o);
      const after = await cats();
      assert.strictEqual(after[last - 1], before[last]);
      await o.locator('#shelf summary').click();
      const shelfH = await o.locator('#shelfBody h3').allTextContents();
      assert.ok(shelfH.indexOf(before[last]) < shelfH.indexOf(before[last - 1]), shelfH.join());
      await o.keyboard.press('Escape');
      await o.reload();
      await settle(o);
      await o.locator('.vtab', { hasText: '分類' }).click();
      assert.deepStrictEqual(await cats(), after);
    });
    await t('↑↓ 調整分類內的主題；第一個的 ↑ 與最後一個的 ↓ 是停用的', async () => {
      const i = (await cats()).indexOf('學習');
      await o
        .locator('.catbox')
        .nth(i)
        .locator('summary')
        .click()
        .catch(() => {});
      if (
        !(await o
          .locator('.catbox')
          .nth(i)
          .evaluate(e => e.open))
      )
        await o.locator('.catbox').nth(i).locator('summary').click();
      const before = await topicsIn(i);
      assert.ok(before.length >= 2);
      assert.strictEqual(
        await o.locator('.catbox').nth(i).locator('.tcard').first().locator('.ordbtn').first().isDisabled(),
        true
      );
      assert.strictEqual(
        await o.locator('.catbox').nth(i).locator('.tcard').last().locator('.ordbtn').last().isDisabled(),
        true
      );
      await o.locator('.catbox').nth(i).locator('.tcard').nth(1).locator('.ordbtn').first().click();
      await settle(o);
      const after = await topicsIn(i);
      assert.strictEqual(after[0], before[1]);
      assert.strictEqual(after[1], before[0]);
    });
    await t('點主題卡片進入該主題列表；此時沒有「分類」頁簽（有篩選就退回列表）', async () => {
      await o.locator('.tcard-main', { hasText: '日記本' }).click();
      await settle(o);
      assert.ok((await o.locator('#main h2').textContent()).includes('日記本'));
      assert.deepStrictEqual(await o.locator('.vtab').allTextContents(), ['列表', '圖庫', '日曆']);
    });
    await t('閱讀模式（擁有者）：沒有 ↑↓、不顯示空主題', async () => {
      await o.evaluate(() => VaultUI.setEditMode(false));
      await o.evaluate(() => VaultUI.go({ topic: '', status: '', tag: '' }));
      await settle(o);
      await o.locator('.vtab', { hasText: '分類' }).click();
      assert.strictEqual(await o.locator('.ordbtn').count(), 0);
      assert.ok(!(await o.locator('.tcard-t').allTextContents()).includes('空主題'));
    });
    await t('後端存失敗時：順序還原並顯示訊息', async () => {
      await o.evaluate(() => VaultUI.setEditMode(true));
      await settle(o);
      await o.locator('.vtab', { hasText: '分類' }).click();
      const before = await cats(),
        ok = env.store.setProp;
      env.store.setProp = () => {
        throw new Error('壞了');
      };
      try {
        await o.locator('.catbox').nth(1).locator('summary .ordbtn').first().click();
        await o.waitForSelector('.err[role=alert]');
        await settle(o);
        assert.deepStrictEqual(await cats(), before);
        assert.ok((await o.locator('.err[role=alert]').textContent()).includes('順序沒有儲存成功'));
      } finally {
        env.store.setProp = ok;
      }
    });
    const v = await newPage(ctx, env, VISITOR, {});
    await settle(v);
    await t('訪客：有分類頁簽、看不到 ↑↓ 與私人分類／主題，也沒有空主題', async () => {
      await v.locator('.vtab', { hasText: '分類' }).click();
      assert.strictEqual(await v.locator('.ordbtn').count(), 0);
      const txt = await v.locator('#main').textContent();
      assert.ok(!txt.includes('私密分類') && !txt.includes('祕密本') && !txt.includes('空主題'), txt);
    });
    console.log('\nP14 分類頁簽：' + H.count() + ' 項全部通過');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n失敗：', e.message);
  process.exit(1);
});
