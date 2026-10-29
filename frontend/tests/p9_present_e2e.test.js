// P7c 端對端：簡報模式、匯出 SVG／PNG、群組轉大綱筆記、筆記頁「出現在哪些畫布」
const H = require('./harness');
const { chromium, assert, OWNER, VISITOR, makeEnv, newPage, settle, t } = H;
const env = makeEnv();
env.store.saveTopic({ id: 'pub', title: '公開本', defaultPublic: true });
env.store.saveTopic({ id: 'priv', title: '私人本', defaultPublic: false });
env.saveNote('20261022-q001', '公開筆記一', 'pub', true, '內文一');
env.saveNote('20261022-q002', '私人筆記二', 'priv', false, '內文二');
const T_ = (id, x, y, w, h, text, ex) =>
  Object.assign({ id, type: 'text', text, x, y, width: w, height: h }, ex || {});
const G_ = (id, label, x, y, w, h) => ({ id, type: 'group', label, x, y, width: w, height: h });
const boardPub = {
  nodes: [
    G_('G1', '第一章', 0, 0, 700, 400),
    T_('A', 400, 40, 240, 100, '乙卡 **粗**', { 'x-parent': 'G1' }),
    T_('B', 40, 40, 240, 100, '甲卡', { 'x-parent': 'G1' }),
    {
      id: 'N',
      type: 'file',
      file: 'notes/20261022-q001.md',
      x: 40,
      y: 200,
      width: 260,
      height: 150,
      'x-parent': 'G1'
    },
    G_('G2', '第二章', 0, 600, 700, 400),
    T_('C', 40, 640, 240, 100, '丙卡', { 'x-parent': 'G2' })
  ],
  edges: [{ id: 'E', fromNode: 'B', toNode: 'A', label: '接著' }]
};
assert.ok(env.call('saveBoard', { topic: 'pub', board: boardPub }).ok);
assert.ok(
  env.call('saveBoard', {
    topic: 'priv',
    board: {
      nodes: [
        { id: 'P', type: 'file', file: 'notes/20261022-q002.md', x: 0, y: 0, width: 260, height: 150 },
        { id: 'P2', type: 'file', file: 'notes/20261022-q001.md', x: 300, y: 0, width: 260, height: 150 }
      ],
      edges: []
    }
  }).ok
);
const cvItem = async (p, menu, item) => {
  const b = p.locator('.cv-bar .cv-mbtn', { hasText: menu }).first();
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
  await p.locator('.cv-mlist:not([hidden]) .cv-mi', { hasText: item }).first().click();
};
const open = async (p, title) => {
  await p.locator('#shelfBody button.pill', { hasText: title }).first().click();
  await p.getByRole('button', { name: '開啟畫布' }).click();
  await p.waitForSelector('.cv-view');
  await p.waitForFunction(() => document.querySelectorAll('.cv-node').length >= 3);
  await settle(p);
};
const view = p =>
  p.evaluate(() => {
    const v = VaultUI.canvasState().view;
    return { x: v.x, y: v.y, k: v.k };
  });

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      locale: 'zh-TW',
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true
    });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('vault-cvzoomclick', '0');
      } catch (e) {}
    });
    const o = await newPage(ctx, env, OWNER);
    await open(o, '公開本');

    await t(
      '簡報：依群組逐頁放大（第一章→第二章）；→／←換頁、頭尾按鈕停用；Esc 離開並回到原視角',
      async () => {
        const v0 = await view(o);
        await o.getByRole('button', { name: '簡報', exact: true }).click();
        await settle(o);
        assert.strictEqual((await o.locator('#pres-n').textContent()).trim(), '1 / 2');
        assert.ok(await o.locator('#pres-prev').isDisabled());
        const v1 = await view(o);
        assert.ok(v1.k > 0.3);
        assert.strictEqual(await o.locator('.cv-bar').isVisible(), false, '簡報中工具列收起');
        await o.keyboard.press('ArrowRight');
        await settle(o);
        assert.strictEqual((await o.locator('#pres-n').textContent()).trim(), '2 / 2');
        assert.ok(await o.locator('#pres-next').isDisabled());
        const v2 = await view(o);
        assert.ok(v2.y !== v1.y);
        await o.keyboard.press('ArrowRight');
        await settle(o);
        assert.strictEqual((await o.locator('#pres-n').textContent()).trim(), '2 / 2');
        await o.keyboard.press('ArrowLeft');
        await settle(o);
        assert.strictEqual((await o.locator('#pres-n').textContent()).trim(), '1 / 2');
        await o.keyboard.press('Escape');
        await settle(o);
        assert.strictEqual(await o.locator('.cv-pres').count(), 0);
        assert.ok(await o.locator('.cv-bar').isVisible());
        const v3 = await view(o);
        assert.ok(Math.abs(v3.x - v0.x) < 1 && Math.abs(v3.k - v0.k) < 0.001);
      }
    );

    await t('簡報中不能拖卡片或改字：拖曳後畫布沒有被修改', async () => {
      await o.getByRole('button', { name: '簡報', exact: true }).click();
      await settle(o);
      const b = await o.locator('.cv-node[data-id="B"]').boundingBox();
      await o.mouse.move(b.x + 30, b.y + 30);
      await o.mouse.down();
      await o.mouse.move(b.x + 200, b.y + 120, { steps: 4 });
      await o.mouse.up();
      await settle(o);
      assert.strictEqual(await o.evaluate(() => VaultUI.canvasState().dirty), false);
      await o.locator('#pres-exit').click();
      await settle(o);
    });

    await t(
      '匯出 SVG：下載得到獨立的 SVG（含群組名、卡片文字，沒有 script 與外部網址）；選取時只匯出選取的卡片',
      async () => {
        let [dl] = await Promise.all([o.waitForEvent('download'), cvItem(o, '更多', '匯出 SVG 圖片')]);
        assert.strictEqual(dl.suggestedFilename(), 'pub.svg');
        let svg = require('fs').readFileSync(await dl.path(), 'utf8');
        assert.ok(
          svg.includes('第一章') &&
            svg.includes('甲卡') &&
            svg.includes('接著') &&
            svg.includes('公開筆記一'),
          svg.slice(0, 300)
        );
        assert.ok(!/<script|foreignObject|href="http/i.test(svg));
        await o.evaluate(() => {
          const c = VaultUI.canvasState();
          c.sel = { C: 1 };
          VaultUI.cv.draw();
        });
        [dl] = await Promise.all([o.waitForEvent('download'), cvItem(o, '更多', '匯出 SVG 圖片')]);
        assert.strictEqual(dl.suggestedFilename(), 'pub-selection.svg');
        svg = require('fs').readFileSync(await dl.path(), 'utf8');
        assert.ok(svg.includes('丙卡') && !svg.includes('甲卡'));
      }
    );

    await t('匯出 PNG：下載得到真正的 PNG 檔（檔頭正確、尺寸大於零）', async () => {
      await o.evaluate(() => {
        VaultUI.canvasState().sel = {};
      });
      const [dl] = await Promise.all([o.waitForEvent('download'), cvItem(o, '更多', '匯出 PNG 圖片')]);
      assert.strictEqual(dl.suggestedFilename(), 'pub.png');
      const buf = require('fs').readFileSync(await dl.path());
      assert.strictEqual(buf.slice(1, 4).toString(), 'PNG');
      assert.ok(buf.readUInt32BE(16) > 100 && buf.readUInt32BE(20) > 100);
    });

    await t(
      '群組轉大綱：開出新筆記草稿（標題＝群組名、內文是依位置排好的清單、筆記卡變成 [[id]]），沒有自動存檔',
      async () => {
        await o.evaluate(() => {
          const c = VaultUI.canvasState();
          c.sel = { G1: 1 };
          VaultUI.cv.syncInspector();
          VaultUI.cv.draw();
        });
        await settle(o);
        await o.locator('#cv-outline').click();
        await o.waitForSelector('textarea.body');
        const body = await o.inputValue('textarea.body');
        assert.strictEqual(body, '# 第一章\n- 甲卡\n- 乙卡 粗\n- [[20261022-q001]]\n');
        assert.ok(!o.calls.saveNote);
        assert.strictEqual(await o.locator('#main input').first().inputValue(), '第一章');
      }
    );

    await t('筆記頁「出現在哪些畫布？」：擁有者看到公開本與私人本；訪客只看到公開本', async () => {
      await o.reload();
      await settle(o);
      await o.locator('text=公開筆記一').first().click();
      await settle(o);
      await o.locator('#cv-refs-btn').click();
      await o.waitForSelector('#cv-refs h3');
      const ot = await o.locator('#cv-refs').textContent();
      assert.ok(ot.includes('公開本') && ot.includes('私人本'), ot);
      await o.locator('#cv-refs .item', { hasText: '公開本' }).click();
      await o.waitForSelector('.cv-view');
      const v = await newPage(ctx, env, VISITOR);
      await settle(v);
      await v.locator('text=公開筆記一').first().click();
      await settle(v);
      await v.locator('#cv-refs-btn').click();
      await v.waitForSelector('#cv-refs h3');
      const vt = await v.locator('#cv-refs').textContent();
      assert.ok(vt.includes('公開本') && !vt.includes('私人本'), vt);
      await v.close();
    });

    await t('訪客也能簡報；訪客的畫布沒有轉大綱入口', async () => {
      const v = await newPage(ctx, env, VISITOR);
      await open(v, '公開本');
      await v.getByRole('button', { name: '簡報', exact: true }).click();
      await settle(v);
      assert.strictEqual((await v.locator('#pres-n').textContent()).trim(), '1 / 2');
      await v.keyboard.press('Escape');
      await settle(v);
      assert.strictEqual(await v.locator('#cv-outline').count(), 0);
      await v.close();
    });
    console.log('\nP7c 端對端：' + H.count() + ' 項全部通過');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n失敗：', e.message);
  process.exit(1);
});
