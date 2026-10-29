// 範例壁畫（examples/mural-coffee）：ZIP 可正常匯入、畫布內容完整、收合與簡報順序正確、訪客可看
const H = require('./harness');
const path = require('path');
const { chromium, assert, OWNER, VISITOR, makeEnv, newPage, settle, t } = H;
const ZIP = path.join(__dirname, '..', '..', 'examples', 'mural-coffee', 'coffee-journey-mural.zip');
(async () => {
  const env = makeEnv();
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1600, height: 1200 } });
    const o = await newPage(ctx, env, OWNER);
    await t('匯入範例 ZIP：全部成功、沒有失敗項', async () => {
      await o.evaluate(() => VaultUI.openZip());
      await o.locator('#z-file').setInputFiles(ZIP);
      await o.waitForSelector('#z-go');
      await o.locator('#z-go').click();
      await o.waitForFunction(
        () => {
          const x = document.querySelector('#main').innerText;
          return /成功 \d+/.test(x) && !/還原中/.test(x);
        },
        null,
        { timeout: 30000 }
      );
      assert.ok(/失敗 0/.test(await o.locator('#main').innerText()));
    });
    await t('畫布內容完整：27 卡片、25 連線；卡片指向的筆記與 SVG 都存在', async () => {
      const b = env.call('getBoard', { topic: 'coffee-journey' }).board;
      assert.strictEqual(b.nodes.length, 27);
      assert.strictEqual(b.edges.length, 25);
      b.nodes
        .filter(n => n.type === 'file')
        .forEach(n => {
          const id = n.file.replace(/^(notes|assets)\//, '').replace(/\.(md|svg)$/, '');
          assert.ok(env.call(/^notes\//.test(n.file) ? 'getNote' : 'getSvg', { id }).ok, n.file);
        });
      assert.strictEqual(env.call('listIndex', {}).items.length, 5);
    });
    const p = await newPage(ctx, env, OWNER);
    const open = async page => {
      await page.locator('#shelfBody button.pill', { hasText: '咖啡的旅程' }).first().click();
      await page.getByRole('button', { name: '開啟畫布' }).click();
      await page.waitForSelector('.cv-node');
      await settle(page);
    };
    await open(p);
    const cnt = page => page.locator('.cv-node').count();
    await t('第一站展開、其餘收合（11 張可見）；點 ▸ 展開、再點收合', async () => {
      assert.strictEqual(await cnt(p), 11);
      await p.locator('.cv-node[data-id="g-process"] .cv-gtoggle').click();
      await settle(p);
      assert.strictEqual(await cnt(p), 15);
      await p.locator('.cv-node[data-id="g-process"] .cv-gtoggle').click();
      await settle(p);
      assert.strictEqual(await cnt(p), 11);
    });
    await t('簡報共 5 頁，順序依旅程', async () => {
      await p.getByRole('button', { name: '簡報', exact: true }).click();
      await settle(p);
      for (let i = 1; i <= 5; i++) {
        assert.strictEqual((await p.locator('#pres-n').textContent()).trim(), i + ' / 5');
        if (i < 5) {
          await p.keyboard.press('ArrowRight');
          await settle(p);
        }
      }
      await p.keyboard.press('Escape');
    });
    await t('主題改公開後，訪客看得到整張壁畫並可展開收合', async () => {
      const r = env.call('saveTopic', {
        id: 'coffee-journey',
        title: '咖啡的旅程：從種子到一杯',
        defaultPublic: true,
        confirmPublic: true
      });
      assert.ok(r.ok);
      const v = await newPage(ctx, env, VISITOR);
      await open(v);
      assert.strictEqual(await cnt(v), 11);
      await v.locator('.cv-node[data-id="g-brew"] .cv-gtoggle').click();
      await settle(v);
      assert.strictEqual(await cnt(v), 15);
    });
    console.log('\n範例壁畫：' + H.count() + ' 項全部通過');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n失敗：', e.message);
  process.exit(1);
});
