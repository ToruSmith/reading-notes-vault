// 閱讀／編輯模式：擁有者預設閱讀（沒有任何編輯入口、畫布不能動）；切換後才能編輯；選擇會記住；畫布有未存修改時切回閱讀要確認
const H = require('./harness');
const { chromium, assert, OWNER, VISITOR, makeEnv, newPage, settle, t } = H;
const env = makeEnv();
env.store.saveTopic({ id: 'pub', title: '公開本', defaultPublic: true });
env.saveNote('20261022-m001', '一則筆記', 'pub', true, '內文');
assert.ok(
  env.call('saveBoard', {
    topic: 'pub',
    board: { nodes: [{ id: 'A', type: 'text', text: '甲', x: 0, y: 0, width: 240, height: 120 }], edges: [] }
  }).ok
);
const state = p =>
  p.evaluate(() => {
    const c = VaultUI.canvasState();
    return JSON.parse(JSON.stringify({ board: c.board, dirty: c.dirty }));
  });
const openCv = async p => {
  await p.locator('#shelfBody button.pill', { hasText: '公開本' }).first().click();
  await p.getByRole('button', { name: '開啟畫布' }).click();
  await p.waitForSelector('.cv-view');
  await p.waitForFunction(() => document.querySelectorAll('.cv-node').length >= 1);
  await settle(p);
};

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 900 } });
    const o = await newPage(ctx, env, OWNER, { reading: true });
    await settle(o);

    await t(
      '擁有者預設是閱讀模式：頁首沒有新增／上傳／備份，筆記頁沒有編輯／刪除，主題頁沒有編輯主題',
      async () => {
        assert.ok(/閱讀中/.test(await o.locator('#btnMode').textContent()));
        for (const n of ['新增', '上傳', '備份'])
          assert.strictEqual(
            await o.locator('#tools button', { hasText: new RegExp('^' + n + '$') }).count(),
            0,
            n
          );
        await o.locator('#shelfBody button.pill', { hasText: '公開本' }).first().click();
        await settle(o);
        assert.strictEqual(await o.locator('#t-edit').count(), 0);
        await o.locator('text=一則筆記').first().click();
        await settle(o);
        assert.strictEqual(await o.getByRole('button', { name: '編輯', exact: true }).count(), 0);
        assert.strictEqual(await o.locator('#n-del').count(), 0);
      }
    );

    await t('閱讀模式的畫布：沒有新增選單、雙擊不會變成編輯、拖曳卡片不會移動', async () => {
      await o.goBack().catch(() => {});
      await o.reload();
      await settle(o);
      await openCv(o);
      assert.strictEqual(await o.locator('.cv-bar .cv-mbtn', { hasText: '＋ 新增' }).count(), 0);
      const b = await o.locator('.cv-node[data-id="A"]').boundingBox();
      await o.mouse.move(b.x + 40, b.y + 40);
      await o.mouse.down();
      await o.mouse.move(b.x + 200, b.y + 160, { steps: 5 });
      await o.mouse.up();
      await settle(o);
      const s = await state(o);
      assert.strictEqual(s.dirty, false);
      assert.strictEqual(s.board.nodes[0].x, 0);
      await o.locator('.cv-node[data-id="A"]').dblclick();
      await settle(o);
      assert.strictEqual(await o.locator('textarea.cv-ta').count(), 0);
    });

    await t(
      '切到編輯：畫布直接變可編輯（同一張畫布）、出現新增選單；選擇被記住（重新整理仍是編輯）',
      async () => {
        await o.locator('#btnMode').click();
        await o.waitForSelector('.cv-bar .cv-mbtn');
        await settle(o);
        assert.ok(/編輯中/.test(await o.locator('#btnMode').textContent()));
        assert.ok((await o.locator('.cv-bar .cv-mbtn', { hasText: '＋ 新增' }).count()) >= 1);
        assert.ok((await o.locator('#tools button', { hasText: /^新增$/ }).count()) === 1);
        const o2 = await newPage(ctx, env, OWNER, { reading: true });
        await settle(o2);
        assert.ok(/編輯中/.test(await o2.locator('#btnMode').textContent()), '另開分頁仍記得編輯模式');
        await o2.close(); // 用新分頁代替 reload：無頭瀏覽器偶爾在 reload 時讀不到剛寫的 localStorage
      }
    );

    await t('編輯中有未儲存修改時切回閱讀：跳確認；取消就留在編輯，確定才切換並放棄修改', async () => {
      await openCv(o);
      await o.evaluate(() => {
        const c = VaultUI.canvasState();
        VaultUI.cv.mutate(b =>
          Object.assign({}, b, { nodes: b.nodes.map(n => Object.assign({}, n, { x: 50 })) })
        );
      });
      assert.strictEqual((await state(o)).dirty, true);
      let asked = 0;
      o.once('dialog', d => {
        asked++;
        d.dismiss();
      });
      await o.locator('#btnMode').click();
      await settle(o);
      assert.strictEqual(asked, 1);
      assert.ok(/編輯中/.test(await o.locator('#btnMode').textContent()));
      o.once('dialog', d => {
        asked++;
        d.accept();
      });
      await o.locator('#btnMode').click();
      await settle(o);
      assert.ok(/閱讀中/.test(await o.locator('#btnMode').textContent()));
      assert.strictEqual(await o.locator('.cv-bar .cv-mbtn', { hasText: '＋ 新增' }).count(), 0);
      assert.strictEqual((await state(o)).board.nodes[0].x, 0);
    });

    await t('訪客沒有模式按鈕；訪客永遠唯讀（舊行為不變）', async () => {
      const v = await newPage(ctx, env, VISITOR, { reading: true });
      await settle(v);
      assert.strictEqual(await v.locator('#btnMode').count(), 0);
      await v.close();
    });
    console.log('\n閱讀／編輯模式：' + H.count() + ' 項全部通過');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n失敗：', e.message);
  process.exit(1);
});
