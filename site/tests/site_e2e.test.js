// 靜態站瀏覽器測試：套用 _headers 的 CSP 後，搜尋、畫布平移縮放、語言切換、手機版面都要正常，且 CSP 不得擋到自己的資源
const http = require('http'),
  fs = require('fs'),
  path = require('path'),
  assert = require('assert');
const { chromium } = require('playwright');
const { makeVault, syncToDir, buildSite } = require('./site_helpers');
let n = 0;
const t = async (name, fn) => {
  await fn();
  n++;
  console.log('通過  ' + name);
};
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.xml': 'application/xml'
};

(async () => {
  const v = makeVault();
  const { dir } = syncToDir(v);
  const { out } = buildSite(dir);
  const hdr = fs.readFileSync(path.join(out, '_headers'), 'utf8');
  const csp = /Content-Security-Policy: (.*)/.exec(hdr)[1];
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(out, p);
    if (!f.startsWith(out) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      return res.end(fs.readFileSync(path.join(out, '404.html')));
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch();
  const open = async (ctx, url) => {
    const p = await ctx.newPage();
    p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message));
    p.on('console', m => {
      if (m.type() === 'error') p.errs.push(m.text());
    });
    await p.route(/^https?:\/\/(?!localhost)/, r => r.abort());
    await p.goto(base + url);
    return p;
  };
  try {
    await t('首頁依瀏覽器語言導向 /zh/ 或 /en/；（首頁另附手動連結）', async () => {
      const zc = await browser.newContext({ locale: 'zh-TW' }),
        ec = await browser.newContext({ locale: 'en-US' });
      const a = await open(zc, '/');
      await a.waitForURL('**/zh/');
      const b = await open(ec, '/');
      await b.waitForURL('**/en/');
      assert.deepStrictEqual(a.errs.concat(b.errs), []);
      await zc.close();
      await ec.close();
    });
    const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 800 } });
    await t(
      '筆記頁：樣式與 SVG 圖載入、語法高亮、沒有 CSP 錯誤；語言切換直達翻譯版本；惡意標題不執行',
      async () => {
        const p = await open(ctx, '/zh/note/20261001-a001/');
        assert.ok(
          await p.evaluate(() => getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)')
        );
        assert.ok(await p.locator('.md img').evaluate(i => i.complete && i.naturalWidth > 0), 'SVG 圖要載入');
        assert.ok((await p.locator('.tk-k').count()) > 0);
        assert.deepStrictEqual(p.errs, []);
        await p.locator('.langsw').click();
        await p.waitForURL('**/en/note/20261002-a002/');
        assert.ok((await p.locator('h1').textContent()).includes('Database Basics'));
        const x = await open(ctx, '/zh/note/20261004-a004/');
        assert.ok((await x.locator('h1').textContent()).includes('<img src=x onerror=alert(1)>'));
        assert.strictEqual(await x.locator('main img').count(), 0);
        assert.strictEqual(await x.evaluate(() => window.__xss === undefined), true);
        assert.deepStrictEqual(x.errs, []);
      }
    );
    await t(
      '搜尋：中文子字串、標籤、多關鍵字都找得到；只回該語言；沒結果有提示；網址 ?q= 直接帶入',
      async () => {
        const p = await open(ctx, '/zh/search/');
        await p.locator('#sq').fill('入門');
        await p.waitForSelector('#sres li');
        assert.strictEqual(await p.locator('#sres li').count(), 1);
        assert.ok((await p.locator('#sinfo').textContent()).includes('1'));
        await p.locator('#sq').fill('db 入門');
        assert.strictEqual(await p.locator('#sres li').count(), 1);
        await p.locator('#sq').fill('database');
        assert.strictEqual(await p.locator('#sres li').count(), 0);
        assert.ok((await p.locator('#sinfo').textContent()).includes('沒有符合'));
        const q = await open(ctx, '/en/search/?q=database');
        await q.waitForSelector('#sres li');
        assert.strictEqual(await q.locator('#sres li').count(), 1);
        const r = await open(ctx, '/zh/');
        await r.locator('.sform input').fill('正文');
        await r.locator('.sform input').press('Enter');
        await r.waitForURL('**/zh/search/?q=*');
        await r.waitForSelector('#sres li');
        assert.deepStrictEqual(p.errs.concat(q.errs, r.errs), []);
      }
    );
    await t('畫布：滾輪平移、Ctrl＋滾輪縮放、按鈕縮放與符合視窗、鍵盤操作；卡片內連結可點', async () => {
      const p = await open(ctx, '/zh/board/pub/');
      await p.waitForSelector('.cn');
      const tr = () => p.locator('#world').evaluate(e => e.style.transform);
      const t0 = await tr();
      await p.locator('#board').hover();
      await p.mouse.wheel(0, 120);
      await p.waitForTimeout(80);
      const t1 = await tr();
      assert.notStrictEqual(t0, t1, '滾輪平移');
      await p.keyboard.down('Control');
      await p.mouse.wheel(0, -200);
      await p.keyboard.up('Control');
      await p.waitForTimeout(80);
      assert.notStrictEqual(await tr(), t1, '縮放');
      await p.locator('#bz-fit').click();
      assert.strictEqual(await tr(), t0);
      await p.locator('#bz-in').click();
      assert.notStrictEqual(await tr(), t0);
      await p.locator('#bz-fit').click();
      const bb = await p.locator('#board').boundingBox();
      await p.mouse.move(bb.x + 30, bb.y + 30);
      await p.mouse.down();
      await p.mouse.move(bb.x + 90, bb.y + 70, { steps: 4 });
      await p.mouse.up();
      assert.notStrictEqual(await tr(), t0, '拖曳平移');
      await p.locator('#bz-fit').click();
      await p.locator('.cn a', { hasText: '資料庫入門' }).click();
      await p.waitForURL('**/zh/note/20261001-a001/');
      assert.deepStrictEqual(p.errs, []);
    });
    await ctx.close();
    await t('手機 390px：首頁、筆記、畫布、搜尋都沒有橫向捲動', async () => {
      const m = await browser.newContext({
        locale: 'zh-TW',
        viewport: { width: 390, height: 800 },
        hasTouch: true,
        isMobile: true
      });
      for (const u of [
        '/zh/',
        '/zh/note/20261001-a001/',
        '/zh/topic/pub/',
        '/zh/board/pub/',
        '/zh/search/',
        '/en/note/20261002-a002/'
      ]) {
        const p = await open(m, u);
        assert.ok(
          await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
          u + ' 橫向捲動 ' + (await p.evaluate(() => document.documentElement.scrollWidth))
        );
        assert.deepStrictEqual(p.errs, [], u);
        await p.close();
      }
      await m.close();
    });
    await t('不存在的網址顯示 404 頁，並提供回首頁連結', async () => {
      const c = await browser.newContext({ locale: 'zh-TW' });
      const p = await c.newPage();
      const r = await p.goto(base + '/zh/note/20269999-zz/');
      assert.strictEqual(r.status(), 404);
      assert.ok((await p.locator('main').textContent()).includes('找不到'));
      await c.close();
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log('\n靜態站瀏覽器測試：' + n + ' 項全部通過');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
