// P15：畫布嵌入卡片（HTML 檔：預設不執行腳本、可開腳本、最多同時 3 個；嵌入網頁：只收 https；選檔上傳；訪客可看）
const H = require('./harness');
const { chromium, assert, OWNER, VISITOR, makeEnv, newPage, settle, t } = H;
const env = makeEnv();
env.store.saveTopic({ id: 'pub', title: '公開本', defaultPublic: true });
const PAGE =
  '<!doctype html><html><head><title>idle</title></head><body><h1 id="h">你好 HTML</h1><script>document.title="ran"</script></body></html>';
const ids = [1, 2, 3, 4].map(i => {
  const r = env.call('uploadHtml', { text: PAGE.replace('你好', '頁' + i) });
  assert.ok(r.ok);
  return r.id;
});
const F = (id, i) => ({
  id,
  type: 'file',
  file: 'assets/' + ids[i] + '.html',
  'x-title': '頁' + (i + 1),
  x: i * 500,
  y: 0,
  width: 440,
  height: 320
});
const board = {
  nodes: [
    F('H1', 0),
    F('H2', 1),
    F('H3', 2),
    F('H4', 3),
    {
      id: 'L1',
      type: 'link',
      url: 'https://example.com/page',
      'x-embed': true,
      x: 0,
      y: 400,
      width: 440,
      height: 320
    },
    {
      id: 'L2',
      type: 'link',
      url: 'http://example.com/insecure',
      'x-embed': true,
      x: 500,
      y: 400,
      width: 440,
      height: 320
    },
    { id: 'L3', type: 'link', url: 'https://example.com/plain', x: 1000, y: 400, width: 440, height: 320 }
  ],
  edges: []
};
assert.ok(env.call('saveBoard', { topic: 'pub', board }).ok);
const open = async p => {
  await p.locator('#shelfBody button.pill', { hasText: '公開本' }).first().click();
  await p.getByRole('button', { name: '開啟畫布' }).click();
  await p.waitForSelector('.cv-node');
  await settle(p);
};
const node = (p, id) => p.locator('.cv-node[data-id="' + id + '"]');
const cvItem = async (p, menu, item) => {
  const b = p.locator('.cv-bar .cv-mbtn', { hasText: menu }).first();
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
  await p.locator('.cv-mlist:not([hidden]) .cv-mi', { hasText: item }).first().click();
};
const fit = p => p.evaluate(() => VaultUI.cv.fit && VaultUI.cv.fit());
(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1700, height: 1000 } });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('vault-cvzoomclick', '0');
      } catch (e) {}
    });
    const o = await newPage(ctx, env, OWNER);
    await open(o);
    await fit(o);
    await t('一開畫布：HTML 卡與嵌入網頁卡只有標題與「載入」按鈕，沒有任何 iframe', async () => {
      assert.strictEqual(await o.locator('.cv-node iframe').count(), 0);
      assert.ok((await node(o, 'H1').textContent()).includes('頁1'));
      assert.ok((await node(o, 'H1').textContent()).includes('不執行腳本'));
      assert.ok((await node(o, 'L1').textContent()).includes('example.com'));
      assert.ok((await node(o, 'L2').textContent()).includes('只有 https'), 'http 不可嵌入');
      assert.strictEqual(await node(o, 'L3').locator('iframe').count(), 0, '沒開 x-embed 的連結卡照舊');
    });
    await t(
      '載入 HTML：靜態顯示；iframe 沙箱沒有 allow-scripts／allow-same-origin；內含 CSP；腳本沒執行',
      async () => {
        await node(o, 'H1').locator('.cv-play').click();
        await o.waitForSelector('.cv-node[data-id="H1"] iframe');
        const f = node(o, 'H1').locator('iframe'),
          sb = await f.getAttribute('sandbox');
        assert.ok(!/allow-scripts|allow-same-origin/.test(sb), sb);
        assert.ok((await f.getAttribute('srcdoc')).includes('Content-Security-Policy'));
        const fr = await (await f.elementHandle()).contentFrame();
        await fr.waitForSelector('#h');
        assert.strictEqual(await fr.locator('#h').textContent(), '你好 HTML'.replace('你好', '頁1'));
        assert.strictEqual(await fr.title(), 'idle');
      }
    );
    await t('預設 iframe 不接收滑鼠；按「互動」才接收；再按關閉', async () => {
      const pe = () =>
        node(o, 'H1')
          .locator('iframe')
          .evaluate(e => getComputedStyle(e).pointerEvents);
      assert.strictEqual(await pe(), 'none');
      await node(o, 'H1').locator('.cv-embbtn', { hasText: '互動' }).click();
      assert.strictEqual(
        await pe(),
        'auto',
        await node(o, 'H1')
          .locator('.cv-emb')
          .evaluate(e => e.className + '|' + e.outerHTML.slice(0, 200))
      );
      await node(o, 'H1').locator('.cv-embbtn', { hasText: '互動' }).click();
      assert.strictEqual(await pe(), 'none');
    });
    await t(
      '屬性欄開「允許執行腳本」：卡片回到載入鈕，重新載入後腳本才執行；存檔後 x-scripts 寫進畫布',
      async () => {
        await o.evaluate(() => {
          const c = VaultUI.canvasState();
          c.sel = { H1: 1 };
          c.selEdge = null;
          VaultUI.cv.syncBar();
          VaultUI.cv.syncInspector();
        });
        await o.locator('#cv-scripts').check();
        await settle(o);
        assert.strictEqual(await node(o, 'H1').locator('iframe').count(), 0);
        assert.ok((await node(o, 'H1').textContent()).includes('可執行腳本'));
        await node(o, 'H1').locator('.cv-play').click();
        await o.waitForSelector('.cv-node[data-id="H1"] iframe');
        const sb = await node(o, 'H1').locator('iframe').getAttribute('sandbox');
        assert.ok(/allow-scripts/.test(sb) && !/allow-same-origin/.test(sb), sb);
        const fr = await (await node(o, 'H1').locator('iframe').elementHandle()).contentFrame();
        await fr.waitForFunction(() => document.title === 'ran');
        await o.locator('.cv-view').focus();
        await o.keyboard.press('Control+s');
        await o.waitForFunction(() => !VaultUI.canvasState().dirty);
        const f = env.store.findFileByName('boards', 'pub.canvas.json');
        assert.strictEqual(
          JSON.parse(env.store.readText(f.fileId)).nodes.find(n => n.id === 'H1')['x-scripts'],
          true
        );
      }
    );
    await t('同時最多 3 個載入中：載入第 4 個時最舊的收回成按鈕', async () => {
      for (const id of ['H2', 'H3', 'H4']) {
        await node(o, id).locator('.cv-play').click();
        await o.waitForSelector('.cv-node[data-id="' + id + '"] iframe');
      }
      assert.strictEqual(await o.locator('.cv-node iframe').count(), 3);
      assert.strictEqual(await node(o, 'H1').locator('iframe').count(), 0, '最舊的 H1 被收回');
      await node(o, 'H4').locator('.cv-embbtn', { hasText: '✕' }).click();
      assert.strictEqual(await o.locator('.cv-node iframe').count(), 2);
    });
    await t('嵌入網頁：按了才建立 iframe，網址正確、沙箱沒有頂層導覽；另開分頁連結存在', async () => {
      await node(o, 'L1').locator('.cv-play').click();
      const f = node(o, 'L1').locator('iframe');
      await f.waitFor();
      assert.strictEqual(await f.getAttribute('src'), 'https://example.com/page');
      const sb = await f.getAttribute('sandbox');
      assert.ok(!/allow-top-navigation/.test(sb), sb);
      assert.ok(
        (await node(o, 'L1').locator('a[href="https://example.com/page"][target=_blank]').count()) >= 1
      );
    });
    await t('屬性欄對連結卡可開關「嵌入網頁」', async () => {
      await o.evaluate(() => {
        const c = VaultUI.canvasState();
        c.sel = { L3: 1 };
        c.selEdge = null;
        VaultUI.cv.syncBar();
        VaultUI.cv.syncInspector();
      });
      await o.locator('#cv-embed').check();
      await settle(o);
      assert.ok((await node(o, 'L3').textContent()).includes('嵌入網頁'));
      await o.locator('#cv-embed').uncheck();
      await settle(o);
      assert.ok(!(await node(o, 'L3').textContent()).includes('▶ 嵌入網頁'));
      const n = await o.evaluate(() => VaultUI.canvasState().board.nodes.find(n => n.id === 'L3'));
      assert.strictEqual(n['x-embed'], undefined);
    });
    await t('「＋ 新增 → HTML 檔」選檔上傳：新增一張 HTML 卡；非 .html 檔與過大檔被拒絕', async () => {
      const before = await o.evaluate(() => VaultUI.canvasState().board.nodes.length);
      const [fc] = await Promise.all([o.waitForEvent('filechooser'), cvItem(o, '新增', 'HTML 檔')]);
      await fc.setFiles({
        name: '我的筆記.html',
        mimeType: 'text/html',
        buffer: Buffer.from('<h1>新頁</h1>')
      });
      await o.waitForFunction(n => VaultUI.canvasState().board.nodes.length === n + 1, before);
      const nn = await o.evaluate(() => VaultUI.canvasState().board.nodes.slice(-1)[0]);
      assert.ok(/^assets\/\d{8}-[a-z0-9]+\.html$/.test(nn.file));
      assert.strictEqual(nn['x-title'], '我的筆記');
      await o.evaluate(() => VaultUI.cv.embed.addHtmlFile({ name: 'x.txt', size: 5 }, { x: 0, y: 0 }));
      assert.ok(
        (await o.locator('.cv-status, [role=status]').allTextContents()).join().includes('只支援 .html')
      );
      await o.evaluate(() =>
        VaultUI.cv.embed.addHtmlFile({ name: 'big.html', size: 600 * 1024 }, { x: 0, y: 0 })
      );
      assert.ok((await o.locator('.cv-status, [role=status]').allTextContents()).join().includes('500 KB'));
      assert.strictEqual(await o.evaluate(() => VaultUI.canvasState().board.nodes.length), before + 1);
    });
    await t('匯出 SVG 不會因嵌入卡報錯：只有標題文字，沒有 iframe／script', async () => {
      const [dl] = await Promise.all([o.waitForEvent('download'), cvItem(o, '更多', '匯出 SVG 圖片')]);
      const txt = require('fs').readFileSync(await dl.path(), 'utf8');
      assert.ok(txt.includes('我的筆記'), 'SVG 內容：' + txt.slice(0, 600));
      assert.ok(!/<iframe|<script|srcdoc/i.test(txt), '含嵌入標籤');
    });
    await t(
      '右鍵 HTML 卡：選單有「在新分頁開啟」「下載 .html」；新分頁是佔滿視窗的沙箱頁面；下載檔名＝標題.html',
      async () => {
        await node(o, 'H2').click({ button: 'right' });
        await o.waitForSelector('.cv-ctx');
        assert.deepStrictEqual(await o.locator('.cv-ctxi').allTextContents(), ['在新分頁開啟', '下載 .html']);
        const [pg] = await Promise.all([
          ctx.waitForEvent('page'),
          o.locator('.cv-ctxi', { hasText: '在新分頁開啟' }).click()
        ]);
        await pg.waitForURL(/^blob:/);
        const fr = pg.frameLocator('iframe');
        await fr.locator('#h').waitFor();
        assert.strictEqual(await fr.locator('#h').textContent(), '頁2 HTML');
        assert.ok(!/allow-same-origin/.test(await pg.locator('iframe').getAttribute('sandbox')));
        assert.strictEqual(await pg.evaluate(() => window.opener), null);
        await pg.close();
        // 測試環境的頁面不是同源，瀏覽器會忽略 download 檔名；所以攔截 a.click()，直接檢查檔名屬性與內容
        await o.evaluate(() => {
          window.__dl = null;
          const orig = URL.createObjectURL.bind(URL),
            blobs = {};
          URL.createObjectURL = b => {
            const u = orig(b);
            blobs[u] = b;
            return u;
          };
          HTMLAnchorElement.prototype.click = function () {
            const name = this.getAttribute('download');
            blobs[this.href].text().then(text => {
              window.__dl = { name, text };
            });
          };
        });
        await node(o, 'H2').click({ button: 'right' });
        await o.locator('.cv-ctxi', { hasText: '下載' }).click();
        await o.waitForFunction(() => window.__dl);
        const dl = await o.evaluate(() => window.__dl);
        assert.strictEqual(dl.name, '頁2.html');
        assert.ok(dl.text.includes('<h1 id="h">頁2 HTML</h1>'));
        assert.strictEqual(await o.locator('.cv-ctx').count(), 0, '選單用完會關');
      }
    );
    await t('雙擊 HTML 卡片直接在新分頁開啟；Esc 可關掉右鍵選單', async () => {
      const [pg] = await Promise.all([ctx.waitForEvent('page'), node(o, 'H3').dblclick()]);
      await pg.waitForURL(/^blob:/);
      await pg.frameLocator('iframe').locator('#h').waitFor();
      await pg.close();
      await o.bringToFront();
      await node(o, 'H3').click({ button: 'right' });
      await o.waitForSelector('.cv-ctx');
      await o.keyboard.press('Escape');
      await o.waitForFunction(() => !document.querySelector('.cv-ctx'));
    });
    const v = await newPage(ctx, env, VISITOR);
    await open(v);
    await t('訪客：看得到 HTML 卡，按「載入」後可顯示；沒有屬性欄的腳本開關', async () => {
      assert.strictEqual(await v.locator('.cv-node iframe').count(), 0);
      await node(v, 'H2').locator('.cv-play').click();
      const fr = await (await node(v, 'H2').locator('iframe').elementHandle()).contentFrame();
      await fr.waitForSelector('#h');
      assert.strictEqual(await v.locator('#cv-scripts').count(), 0);
      assert.ok(
        !/allow-scripts/.test(await node(v, 'H2').locator('iframe').getAttribute('sandbox')),
        '沒勾的卡片對訪客也不執行腳本'
      );
      await node(v, 'H1').locator('.cv-play').click();
      await node(v, 'H1').locator('iframe').waitFor();
      assert.ok(
        /allow-scripts/.test(await node(v, 'H1').locator('iframe').getAttribute('sandbox')),
        '擁有者勾過並儲存的「允許執行腳本」，訪客也會套用'
      );
      const f1 = await (await node(v, 'H1').locator('iframe').elementHandle()).contentFrame();
      await f1.waitForFunction(() => document.title === 'ran');
    });
    console.log('\nP15 嵌入卡片：' + H.count() + ' 項全部通過');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n失敗：', e.message);
  process.exit(1);
});
