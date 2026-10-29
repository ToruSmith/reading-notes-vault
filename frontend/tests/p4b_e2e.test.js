// P4.1 端對端：畫布全螢幕、單擊放大／雙擊開筆記、手機表頭選單
const H = require('./harness');
const { chromium, assert, OWNER, VISITOR, makeEnv, newPage, t } = H;
const env = makeEnv();
env.store.saveTopic({ id: 'pub', title: '公開本', defaultPublic: true });
env.saveNote('20261024-n001', '被連到的筆記', 'pub', undefined, '筆記正文內容', { date: '2026-10-01' });
assert.ok(
  env.call('saveBoard', {
    topic: 'pub',
    board: {
      nodes: [
        { id: 'F1', type: 'file', file: 'notes/20261024-n001.md', x: 0, y: 0, width: 240, height: 160 },
        { id: 'T1', type: 'text', text: '文字卡', x: 500, y: 0, width: 200, height: 160 }
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
const st = p => p.evaluate(() => JSON.parse(JSON.stringify(VaultUI.canvasState().view)));
const openCv = async p => {
  await p.evaluate(() => {
    VaultUI.S.note = null;
    VaultUI.openCanvas('pub');
  });
  await p.waitForSelector('.cv-node[data-id="F1"]');
  await p.waitForTimeout(150);
};

(async () => {
  const browser = await chromium.launch();
  try {
    const vctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 800 } });
    const v = await newPage(vctx, env, VISITOR);
    await openCv(v);
    await t('單擊卡片＝放大到該卡片；再單擊＝回到原視角；都不會開筆記', async () => {
      const v0 = await st(v);
      await v.locator('.cv-node[data-id="T1"]').click();
      await v.waitForTimeout(100);
      const v1 = await st(v);
      assert.ok(v1.k > v0.k * 1.5, JSON.stringify([v0, v1]));
      assert.ok(await v.locator('.cv-view').isVisible());
      assert.strictEqual(await v.evaluate(() => !!VaultUI.S.note), false);
      await v.locator('.cv-node[data-id="T1"]').click();
      await v.waitForTimeout(100);
      const v2 = await st(v);
      assert.ok(Math.abs(v2.k - v0.k) < 0.001 && Math.abs(v2.x - v0.x) < 1);
    });
    await t('雙擊筆記卡片＝開啟那則筆記', async () => {
      await v.locator('.cv-node[data-id="F1"]').dblclick();
      await v.waitForFunction(() => VaultUI.S.note && VaultUI.S.note.data);
      assert.strictEqual(await v.evaluate(() => VaultUI.S.note.id), '20261024-n001');
      assert.ok((await v.locator('#main').textContent()).includes('筆記正文內容'));
    });
    await t('全螢幕：隱藏頁首與書櫃、畫布變大；按鈕變「離開全螢幕」；再按恢復；Esc 也能離開', async () => {
      await openCv(v);
      const h0 = await v.locator('.cv-view').evaluate(e => e.clientHeight);
      await v.getByRole('button', { name: '全螢幕', exact: true }).click();
      await v.waitForTimeout(150);
      assert.ok(await v.evaluate(() => document.body.classList.contains('cv-full')));
      assert.strictEqual(await v.locator('header.bar').isVisible(), false);
      assert.strictEqual(await v.locator('#shelf').isVisible(), false);
      const h1 = await v.locator('.cv-view').evaluate(e => e.clientHeight);
      assert.ok(h1 > h0, h0 + ' → ' + h1);
      const w1 = await v.locator('.cv-view').evaluate(e => e.clientWidth);
      assert.ok(w1 > 900, '全螢幕畫布寬度 ' + w1);
      assert.ok((await v.locator('.cv-node').count()) > 0, '全螢幕下要有卡片');
      assert.ok(await v.getByRole('button', { name: '離開全螢幕' }).count());
      await v.getByRole('button', { name: '離開全螢幕' }).click();
      await v.waitForTimeout(100);
      assert.ok(await v.locator('header.bar').isVisible());
      await v.getByRole('button', { name: '全螢幕', exact: true }).click();
      await v.waitForTimeout(100);
      if (await v.evaluate(() => !!document.fullscreenElement))
        await v.evaluate(() => document.exitFullscreen());
      await v.keyboard.press('Escape');
      await v.waitForTimeout(100);
      assert.strictEqual(await v.evaluate(() => document.body.classList.contains('cv-full')), false);
    });
    await t('離開畫布時一併離開全螢幕版面', async () => {
      await v.getByRole('button', { name: '全螢幕', exact: true }).click();
      await v.waitForTimeout(100);
      await v.evaluate(() => {
        VaultUI.leaveCanvas();
        VaultUI.render();
      });
      assert.strictEqual(await v.evaluate(() => document.body.classList.contains('cv-full')), false);
    });
    assert.deepStrictEqual(v.errors, []);
    await v.close();

    const octx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 800 } });
    const o = await newPage(octx, env, OWNER);
    await openCv(o);
    await t(
      '擁有者可編輯時：單擊＝選取並放大（再單擊回原視角）；拖曳仍是移動不放大；可關閉單擊放大；雙擊筆記卡片開筆記',
      async () => {
        const v0 = await st(o);
        await o.locator('.cv-node[data-id="T1"]').click();
        await o.waitForTimeout(80);
        assert.deepStrictEqual(await o.evaluate(() => Object.keys(VaultUI.canvasState().sel)), ['T1']);
        assert.ok((await st(o)).k > v0.k * 1.5);
        await o.locator('.cv-node[data-id="T1"]').click();
        await o.waitForTimeout(80);
        assert.ok(Math.abs((await st(o)).k - v0.k) < 0.001);
        const bb = await o.locator('.cv-node[data-id="T1"]').boundingBox();
        await o.mouse.move(bb.x + 20, bb.y + 20);
        await o.mouse.down();
        await o.mouse.move(bb.x + 60, bb.y + 50, { steps: 4 });
        await o.mouse.up();
        await o.waitForTimeout(80);
        assert.ok(Math.abs((await st(o)).k - v0.k) < 0.001, '拖曳不該放大');
        assert.ok(await o.evaluate(() => VaultUI.canvasState().dirty), '拖曳應移動卡片');
        await cvItem(o, '更多', '單擊放大');
        await o.locator('.cv-node[data-id="F1"]').click();
        await o.waitForTimeout(80);
        assert.ok(Math.abs((await st(o)).k - v0.k) < 0.001, '關閉後單擊不放大');
        await cvItem(o, '更多', '放大所選');
        await o.waitForTimeout(80);
        assert.ok((await st(o)).k > v0.k * 1.5);
        await o.getByRole('button', { name: '符合視窗' }).click();
        await o.waitForTimeout(100);
        await o.locator('.cv-node[data-id="F1"]').dblclick();
        await o.waitForFunction(() => VaultUI.S.note && VaultUI.S.note.data);
      }
    );
    await o.close();

    const mctx = await browser.newContext({
      locale: 'zh-TW',
      viewport: { width: 390, height: 800 },
      hasTouch: true,
      isMobile: true
    });
    const m = await newPage(mctx, env, OWNER);
    await t('手機表頭：只有搜尋＋選單＋身分一行，高度明顯變小；按鈕收進選單，點選項後自動收起', async () => {
      const hh = await m.locator('header.bar').evaluate(e => e.getBoundingClientRect().height);
      assert.ok(hh < 110, '表頭高度 ' + hh);
      assert.strictEqual(await m.locator('#btnSettings').isVisible(), false);
      assert.strictEqual(await m.locator('#hmenu').isVisible(), false);
      await m.locator('#btnMenu').tap();
      await m.waitForTimeout(100);
      assert.ok(await m.locator('#btnSettings').isVisible());
      assert.ok(await m.locator('#btnPublish').isVisible());
      assert.strictEqual(await m.locator('#btnMenu').getAttribute('aria-expanded'), 'true');
      assert.ok(
        await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        '橫向捲動'
      );
      const bs = await m
        .locator('#hmenu .tbtn')
        .evaluateAll(a => a.map(e => e.getBoundingClientRect().height));
      assert.ok(
        bs.every(h => h >= 40),
        bs.join(',')
      );
      await m.locator('#btnSettings').tap();
      await m.waitForTimeout(150);
      assert.strictEqual(await m.locator('#hmenu').isVisible(), false);
      assert.ok(await m.evaluate(() => VaultUI.S.settings));
    });
    await t('手機畫布：點卡片放大、全螢幕可用、沒有橫向捲動', async () => {
      await m.evaluate(() => {
        const S = VaultUI.S;
        S.settings = false;
        S.note = null;
        VaultUI.openCanvas('pub');
      });
      await m.waitForSelector('.cv-node[data-id="T1"]');
      await m.waitForTimeout(150);
      await m.getByRole('button', { name: '全螢幕', exact: true }).tap();
      await m.waitForTimeout(150);
      assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      const v0 = await st(m);
      await m.locator('.cv-node[data-id="T1"]').tap();
      await m.waitForTimeout(100);
      assert.ok((await st(m)).k > v0.k * 1.3);
    });
    assert.deepStrictEqual(m.errors, []);
    await t('英文介面：選單與全螢幕按鈕沒有殘留中文', async () => {
      const ectx = await browser.newContext({
        locale: 'en-US',
        viewport: { width: 390, height: 800 },
        hasTouch: true,
        isMobile: true
      });
      const e = await newPage(ectx, env, OWNER, { lang: 'en-US' });
      assert.strictEqual((await e.locator('#btnMenu').textContent()).trim(), 'Menu');
      await e.evaluate(() => {
        VaultUI.S.note = null;
        VaultUI.openCanvas('pub');
      });
      await e.waitForSelector('.cv-node');
      const names = await e.locator('.cv-bar button').allTextContents();
      assert.deepStrictEqual(
        names.filter(s => /[一-鿿]/.test(s)),
        []
      );
      assert.ok(names.includes('Full screen'), names.join('|'));
    });
  } finally {
    await browser.close();
  }
  console.log('\nP4.1 端對端：' + H.count() + ' 項全部通過');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
