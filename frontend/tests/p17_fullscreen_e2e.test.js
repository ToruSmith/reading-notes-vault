// P17：全螢幕工具列自動隱藏（桌機頂端／手機底部）、單卡片全螢幕、PDF 卡片、貼上嵌入碼與 Google 連結自動轉換
const H = require('./harness');
const { chromium, assert, OWNER, VISITOR, makeEnv, newPage, settle, t } = H;
const env = makeEnv();
env.store.saveTopic({ id: 'pub', title: '公開本', defaultPublic: true });
const PAGE = '<!doctype html><html><head><title>idle</title></head><body><h1 id="h">頁1</h1></body></html>';
const html1 = env.call('uploadHtml', { text: PAGE }).id;
const PDF = '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n';
const pdf1 = env.call('uploadPdf', {
  data: 'data:application/pdf;base64,' + Buffer.from(PDF).toString('base64')
});
assert.ok(pdf1.ok);
assert.ok(
  env.call('saveBoard', {
    topic: 'pub',
    board: {
      nodes: [
        {
          id: 'H1',
          type: 'file',
          file: 'assets/' + html1 + '.html',
          'x-title': '頁1',
          x: 0,
          y: 0,
          width: 440,
          height: 320
        },
        {
          id: 'P1',
          type: 'file',
          file: 'assets/' + pdf1.id + '.pdf',
          'x-title': '講義',
          x: 500,
          y: 0,
          width: 440,
          height: 360
        },
        {
          id: 'L1',
          type: 'link',
          url: 'https://example.com/page',
          'x-embed': true,
          x: 0,
          y: 400,
          width: 440,
          height: 320
        }
      ],
      edges: []
    }
  }).ok
);
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
const barShown = p => p.locator('.cv-bar').evaluate(e => e.classList.contains('show'));
const barTop = p => p.locator('.cv-bar').evaluate(e => Math.round(e.getBoundingClientRect().top));
const reveal = async p => {
  await p.mouse.move(300, 300);
  await p.mouse.move(300, 3);
  await p.waitForSelector('.cv-bar.show');
  await p.waitForTimeout(260);
};
const nodes = p => p.evaluate(() => VaultUI.canvasState().board.nodes);
const inCard = p =>
  p.evaluate(() => !!document.fullscreenElement && document.fullscreenElement.tagName === 'IFRAME');
(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1400, height: 800 } });
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'pdfViewerEnabled', { value: true }); // 無頭瀏覽器沒有 PDF 檢視器，這裡模擬桌機
      try {
        localStorage.setItem('vault-cvzoomclick', '0');
      } catch (e) {}
    });
    const o = await newPage(ctx, env, OWNER);
    await open(o);

    /* ───── 全螢幕：工具列自動隱藏（桌機） ───── */
    await t('進全螢幕先露出工具列，滑鼠移開後自動收起；畫布佔滿整個視窗高度', async () => {
      await o.getByRole('button', { name: '全螢幕', exact: true }).click();
      await settle(o);
      assert.strictEqual(await barShown(o), true, '剛進入時先露出');
      await o.mouse.move(700, 400);
      await o.waitForFunction(() => !document.querySelector('.cv-bar').classList.contains('show'), null, {
        timeout: 6000
      });
      await o.waitForTimeout(300);
      assert.ok((await barTop(o)) < -20, '收起後移到畫面外：' + (await barTop(o)));
      const v = await o.locator('.cv-view').boundingBox();
      assert.ok(v.height >= 795 && v.y <= 1, '畫布高度 ' + v.height + ' y=' + v.y);
    });
    await t('滑鼠移到畫面頂端：工具列浮現；移開後收起', async () => {
      await reveal(o);
      assert.ok((await barTop(o)) >= 0);
      await o.mouse.move(700, 500);
      await o.waitForFunction(() => !document.querySelector('.cv-bar').classList.contains('show'), null, {
        timeout: 6000
      });
    });
    await t('☰ 工具下拉展開時工具列不會收起；關掉後才收', async () => {
      await reveal(o);
      await o.locator('.cv-toolsbtn').click();
      await o.mouse.move(700, 500);
      await o.waitForTimeout(3300);
      assert.strictEqual(await barShown(o), true, '下拉展開中不可收起');
      await o.locator('.cv-toolsbtn').click(); // 重新展開狀態切換成收起
      await o.waitForTimeout(100);
      await o.mouse.move(700, 520);
      await o.waitForFunction(() => !document.querySelector('.cv-bar').classList.contains('show'), null, {
        timeout: 8000
      });
    });
    await t('用鍵盤 Tab 移到工具列時會浮現（看不到的按鈕也能用鍵盤操作）', async () => {
      await o.locator('.cv-bar button').first().focus();
      assert.strictEqual(await barShown(o), true);
      await o.locator('.cv-view').focus();
      await o.waitForFunction(() => !document.querySelector('.cv-bar').classList.contains('show'), null, {
        timeout: 6000
      });
    });
    await t('全螢幕的訊息改成浮動提示：出現後約 3.5 秒淡出', async () => {
      await o.evaluate(() => VaultUI.cv.setStatus('測試提示訊息'));
      const op = () => o.locator('.cv-status').evaluate(e => getComputedStyle(e).opacity);
      await o.waitForTimeout(300);
      assert.strictEqual(await op(), '1');
      await o.waitForTimeout(4200);
      assert.strictEqual(await op(), '0');
    });

    /* ───── 單卡片全螢幕 ───── */
    await t('卡片工具列有「⛶」，在「↗」旁邊（↗ 之後、✕ 之前）', async () => {
      await node(o, 'H1').locator('.cv-play').click();
      await o.waitForSelector('.cv-node[data-id="H1"] iframe');
      const labels = await node(o, 'H1').locator('.cv-embbar .cv-embbtn').allTextContents();
      assert.deepStrictEqual(labels, ['互動', '↗', '⛶', '✕']);
    });
    await t('按「⛶」：這張卡片的 iframe 單獨全螢幕；再按一次離開；畫布的全螢幕版面不受影響', async () => {
      await node(o, 'H1').locator('.cv-embfull').click();
      await o.waitForFunction(
        () => !!document.fullscreenElement && document.fullscreenElement.tagName === 'IFRAME'
      );
      assert.strictEqual(await inCard(o), true);
      assert.strictEqual(
        await o.evaluate(() => getComputedStyle(document.fullscreenElement).pointerEvents),
        'auto',
        '全螢幕中的卡片要能操作'
      );
      await node(o, 'H1').locator('.cv-embfull').dispatchEvent('click');
      await o.waitForFunction(
        () => !document.fullscreenElement || document.fullscreenElement.tagName !== 'IFRAME'
      );
      assert.strictEqual(await inCard(o), false);
      assert.ok(await o.evaluate(() => document.body.classList.contains('cv-full')));
    });
    await t('Esc 離開卡片全螢幕（畫布的全螢幕版面仍在，可再按「離開全螢幕」）', async () => {
      await node(o, 'H1').locator('.cv-embfull').click();
      await o.waitForFunction(
        () => !!document.fullscreenElement && document.fullscreenElement.tagName === 'IFRAME'
      );
      await o.keyboard.press('Escape');
      await o
        .waitForFunction(
          () => !document.fullscreenElement || document.fullscreenElement.tagName !== 'IFRAME',
          null,
          {
            timeout: 4000
          }
        )
        .catch(async () => {
          // 無頭瀏覽器不一定把 Esc 當成「離開全螢幕」，改用 API 確認離開後狀態正常
          await o.evaluate(() => document.exitFullscreen());
        });
      assert.strictEqual(await inCard(o), false);
      assert.ok(await o.evaluate(() => document.body.classList.contains('cv-full')), '畫布全螢幕版面仍在');
    });
    await t('不支援全螢幕的瀏覽器（例如 iPhone）：改用備援（在新分頁開啟）', async () => {
      await o.evaluate(() => {
        window.__opened = [];
        window.open = (...a) => {
          window.__opened.push(a[0]);
          return null;
        };
        HTMLIFrameElement.prototype.requestFullscreen = undefined;
        HTMLElement.prototype.requestFullscreen = undefined;
        HTMLElement.prototype.webkitRequestFullscreen = undefined;
      });
      await node(o, 'H1').locator('.cv-embfull').click();
      await o.waitForFunction(() => window.__opened.length >= 1);
    });
    await t('離開畫布全螢幕：工具列回到一般位置（不再浮動）', async () => {
      await reveal(o);
      await o.getByRole('button', { name: '離開全螢幕', exact: true }).click();
      await settle(o);
      assert.notStrictEqual(await o.locator('.cv-bar').evaluate(e => getComputedStyle(e).position), 'fixed');
      assert.strictEqual(await o.locator('.cv-fab, .cv-hot').first().isVisible(), false);
    });

    /* ───── 貼上嵌入碼／Google 連結自動轉換 ───── */
    const addLink = async text => {
      await cvItem(o, '＋ 新增', '連結卡片');
      await o.locator('.cv-panel input[type=url]').fill(text);
      await o.locator('.cv-panel').getByRole('button', { name: '加入', exact: true }).click();
      await settle(o);
      const ns = await nodes(o);
      return ns[ns.length - 1];
    };
    await t('貼上整段 <iframe> 嵌入碼：取出 src，自動開啟「嵌入網頁」', async () => {
      const nd = await addLink(
        '<iframe src="https://docs.google.com/presentation/d/e/2PACX-1vAbC_d/embed?start=false&amp;loop=false&amp;delayms=3000" frameborder="0" width="960" height="569" allowfullscreen="true"></iframe>'
      );
      assert.strictEqual(
        nd.url,
        'https://docs.google.com/presentation/d/e/2PACX-1vAbC_d/embed?start=false&loop=false&delayms=3000'
      );
      assert.strictEqual(nd['x-embed'], true);
    });
    await t(
      '貼上 Google 簡報「發布到網路」的 /pub 連結：自動嵌入，iframe 用 /embed；開新分頁仍是原連結',
      async () => {
        const nd = await addLink('https://docs.google.com/presentation/d/e/2PACX-9zZ/pub?start=false');
        assert.strictEqual(nd['x-embed'], true);
        assert.strictEqual(nd.url, 'https://docs.google.com/presentation/d/e/2PACX-9zZ/pub?start=false');
        const card = node(o, nd.id);
        await card.locator('.cv-play').click();
        await card.locator('iframe').waitFor();
        assert.strictEqual(
          await card.locator('iframe').getAttribute('src'),
          'https://docs.google.com/presentation/d/e/2PACX-9zZ/embed?start=false'
        );
        assert.strictEqual(
          await card.locator('.cv-embbar a').getAttribute('href'),
          'https://docs.google.com/presentation/d/e/2PACX-9zZ/pub?start=false'
        );
      }
    );
    await t('Google 雲端硬碟檔案連結：嵌入時用 /preview', async () => {
      const nd = await addLink('https://drive.google.com/file/d/1XyZabc/view?usp=sharing');
      assert.strictEqual(nd['x-embed'], true);
      const card = node(o, nd.id);
      await card.locator('.cv-play').click();
      await card.locator('iframe').waitFor();
      assert.strictEqual(
        await card.locator('iframe').getAttribute('src'),
        'https://drive.google.com/file/d/1XyZabc/preview'
      );
    });
    await t('一般網址不會被自動嵌入', async () => {
      const nd = await addLink('https://example.org/article');
      assert.strictEqual(nd['x-embed'], undefined);
    });
    await t('嵌入碼的 src 若不是 http(s)（例如 javascript:）：拒絕，不新增卡片', async () => {
      const before = (await nodes(o)).length;
      await cvItem(o, '＋ 新增', '連結卡片');
      await o.locator('.cv-panel input[type=url]').fill('<iframe src="javascript:alert(1)"></iframe>');
      await o.locator('.cv-panel').getByRole('button', { name: '加入', exact: true }).click();
      assert.strictEqual((await nodes(o)).length, before);
      await o.locator('.cv-panel').getByRole('button', { name: '關閉' }).click();
    });

    /* ───── PDF 卡片 ───── */
    const pickPdf = async (name, buf) => {
      const [fc] = await Promise.all([o.waitForEvent('filechooser'), cvItem(o, '＋ 新增', 'PDF 檔')]);
      await fc.setFiles({ name, mimeType: 'application/pdf', buffer: buf });
    };
    await t('選取 PDF 上傳：新增 PDF 卡片（標題取自檔名）、存進 assets；內容原樣', async () => {
      await pickPdf('我的講義.pdf', Buffer.from(PDF + 'second'));
      await o.waitForFunction(
        () =>
          VaultUI.canvasState().board.nodes.some(n => /\.pdf$/.test(n.file || '')) &&
          VaultUI.canvasState().board.nodes.filter(n => /\.pdf$/.test(n.file || '')).length >= 2
      );
      const nd = (await nodes(o)).filter(n => /\.pdf$/.test(n.file || '')).pop();
      assert.strictEqual(nd['x-title'], '我的講義');
      const id = /^assets\/(.+)\.pdf$/.exec(nd.file)[1];
      const got = env.call('getPdf', { id });
      assert.ok(got.ok && Buffer.from(got.data.split(',')[1], 'base64').toString() === PDF + 'second');
    });
    await t('不是 PDF 的檔案（副檔名 .pdf 但內容不是）與超過 5 MB 的檔案：拒絕並顯示原因', async () => {
      const count = async () => (await nodes(o)).length;
      const n0 = await count();
      await pickPdf('假的.pdf', Buffer.from('hello'));
      await o.waitForFunction(() => /不是有效的 PDF/.test(document.querySelector('.cv-status').textContent));
      await pickPdf('太大.pdf', Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024)]));
      await o.waitForFunction(() => /5 MB/.test(document.querySelector('.cv-status').textContent));
      assert.strictEqual(await count(), n0);
    });
    await t(
      '桌機（支援內嵌）：PDF 卡片預設只有「載入」；按下後才建立 iframe（blob 網址）；⛶ 在 ↗ 旁',
      async () => {
        const card = node(o, 'P1');
        assert.strictEqual(await card.locator('iframe').count(), 0);
        assert.ok((await card.textContent()).includes('講義'));
        await card.locator('.cv-play').click();
        await card.locator('iframe').waitFor();
        assert.ok((await card.locator('iframe').getAttribute('src')).startsWith('blob:'));
        assert.deepStrictEqual(await card.locator('.cv-embbar .cv-embbtn').allTextContents(), [
          '互動',
          '↗',
          '⛶',
          '✕'
        ]);
        await card.locator('.cv-embbtn', { hasText: '✕' }).click();
        assert.strictEqual(await card.locator('iframe').count(), 0);
      }
    );
    await t('右鍵 PDF 卡片：在新分頁開啟／下載 .pdf', async () => {
      await node(o, 'P1').click({ button: 'right', position: { x: 60, y: 60 } });
      const items = await o.locator('.cv-ctx .cv-ctxi').allTextContents();
      assert.deepStrictEqual(items, ['在新分頁開啟', '下載 .pdf']);
      await o.keyboard.press('Escape');
    });
    await o.close();

    /* ───── 瀏覽器不支援內嵌 PDF（手機同理）：直接開新分頁 ───── */
    const ctx2 = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1400, height: 800 } });
    await ctx2.addInitScript(() => {
      Object.defineProperty(navigator, 'pdfViewerEnabled', { value: false });
      try {
        localStorage.setItem('vault-cvzoomclick', '0');
      } catch (e) {}
    });
    const q = await newPage(ctx2, env, OWNER);
    await open(q);
    await t('不支援內嵌 PDF：按鈕是「開啟 PDF（在新分頁）」，按下去開新分頁且不建立 iframe', async () => {
      const card = node(q, 'P1');
      assert.ok((await card.locator('.cv-play').textContent()).includes('在新分頁'));
      const [pop] = await Promise.all([q.waitForEvent('popup'), card.locator('.cv-play').click()]);
      assert.ok(pop);
      await pop.close().catch(() => {});
      assert.strictEqual(await card.locator('iframe').count(), 0);
    });
    await q.close();

    /* ───── 訪客：看得到 PDF 卡片 ───── */
    const ctx3 = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1400, height: 800 } });
    await ctx3.addInitScript(() => Object.defineProperty(navigator, 'pdfViewerEnabled', { value: true }));
    const v = await newPage(ctx3, env, VISITOR);
    await open(v);
    await t('訪客：公開畫布的 PDF 卡片可載入顯示；沒有上傳／新增入口', async () => {
      const card = node(v, 'P1');
      await card.locator('.cv-play').click();
      await card.locator('iframe').waitFor();
      assert.ok((await card.locator('iframe').getAttribute('src')).startsWith('blob:'));
      assert.strictEqual(await v.locator('.cv-bar .cv-mbtn', { hasText: '＋ 新增' }).count(), 0);
    });
    await v.close();

    /* ───── 手機：工具列在底部、圓形按鈕開關 ───── */
    const mctx = await browser.newContext({
      locale: 'zh-TW',
      viewport: { width: 390, height: 800 },
      hasTouch: true,
      isMobile: true
    });
    const m = await newPage(mctx, env, OWNER);
    await m.evaluate(() => VaultUI.openCanvas('pub')); // 手機的書櫃是收起的，直接開畫布
    await m.waitForSelector('.cv-node');
    await settle(m);
    await t('手機全螢幕：工具列在底部（單手好按），自動收起後出現左下角圓形按鈕；沒有頂端熱區', async () => {
      await m.getByRole('button', { name: '全螢幕', exact: true }).tap();
      await settle(m);
      await m.waitForFunction(() => !document.querySelector('.cv-bar').classList.contains('show'), null, {
        timeout: 8000
      });
      await m.waitForTimeout(300);
      const fab = await m.locator('.cv-fab').boundingBox();
      assert.ok(fab && fab.x < 60 && fab.y > 800 - 100, JSON.stringify(fab));
      assert.ok(fab.width >= 44 && fab.height >= 44, '觸控目標至少 44px');
      assert.strictEqual(await m.locator('.cv-hot').isVisible(), false);
    });
    await t('點圓形按鈕：底部工具列浮現（貼齊畫面底部，按鈕收起）；點畫布空白處收起', async () => {
      await m.locator('.cv-fab').tap();
      await m.waitForSelector('.cv-bar.show');
      await m.waitForTimeout(260);
      const b = await m.locator('.cv-bar').boundingBox();
      assert.ok(Math.abs(b.y + b.height - 800) < 3, '貼底 ' + (b.y + b.height));
      assert.strictEqual(await m.locator('.cv-fab').isVisible(), false);
      await m.mouse.click(200, 300);
      await m.waitForFunction(() => !document.querySelector('.cv-bar').classList.contains('show'), null, {
        timeout: 3000
      });
    });
    await t('手機：底部工具列的「☰ 工具」下拉往上展開，不超出畫面', async () => {
      await m.locator('.cv-fab').tap();
      await m.waitForSelector('.cv-bar.show');
      await m.locator('.cv-toolsbtn').tap();
      await m.waitForTimeout(300);
      const tb = await m.locator('.cv-tools.open').boundingBox();
      assert.ok(tb.y >= 0 && tb.y + tb.height <= 800, JSON.stringify(tb));
      const bb = await m.locator('.cv-bar').boundingBox();
      assert.ok(tb.y + tb.height <= bb.y + 2, '下拉在工具列上方');
    });
    console.log('\nP17：' + H.count() + ' 項全部通過');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n失敗：', e.message);
  process.exit(1);
});
