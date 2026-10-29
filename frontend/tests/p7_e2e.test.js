// P7a 端對端：工具列分組選單、對齊吸附、對齊／等距、複製貼上、畫布內搜尋、體積與效能預算
const H = require('./harness');
const { chromium, assert, OWNER, VISITOR, makeEnv, newPage, settle, t, fs, path } = H;
const env = makeEnv();
env.store.saveTopic({ id: 'pub', title: '公開本', defaultPublic: true });
env.saveNote('20261024-n001', '資料庫筆記', 'pub', undefined, '索引與交易的正文', {
  date: '2026-10-01',
  tags: ['sql']
});
const T_ = (id, x, y, w, h, text) => ({ id, type: 'text', text, x, y, width: w, height: h });
const board = {
  nodes: [
    T_('A', 0, 0, 200, 100, '甲卡片 alpha'),
    T_('B', 400, 13, 200, 100, '乙卡片 beta'),
    T_('C', 800, 230, 200, 100, '丙卡片 Alpha'),
    { id: 'G', type: 'group', label: '第一章', x: -40, y: 400, width: 500, height: 260 },
    Object.assign(T_('D', 0, 460, 200, 100, '丁 gamma'), { 'x-parent': 'G' }),
    { id: 'F1', type: 'file', file: 'notes/20261024-n001.md', x: 800, y: 500, width: 260, height: 160 },
    {
      id: 'L1',
      type: 'link',
      url: 'https://example.com/ref',
      x: 1200,
      y: 0,
      width: 300,
      height: 160,
      'x-preview': { title: '外部參考', description: 'delta' }
    }
  ],
  edges: [
    { id: 'e1', fromNode: 'A', toNode: 'B' },
    { id: 'e2', fromNode: 'D', toNode: 'C' }
  ]
};
assert.ok(env.call('saveBoard', { topic: 'pub', board }).ok);
const cvItem = async (p, menu, item) => {
  const b = p.locator('.cv-bar .cv-mbtn', { hasText: menu }).first();
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
  await p.locator('.cv-mlist:not([hidden]) .cv-mi', { hasText: item }).first().click();
};
const state = p =>
  p.evaluate(() => {
    const c = VaultUI.canvasState();
    return JSON.parse(
      JSON.stringify({
        board: c.board,
        sel: c.sel,
        view: c.view,
        dirty: c.dirty,
        hits: c.hits || null,
        hitCur: c.hitCur || null
      })
    );
  });
const nodeOf = (s, id) => s.board.nodes.find(n => n.id === id);
const open = async p => {
  await p.locator('#shelfBody button.pill', { hasText: '公開本' }).first().click();
  await p.getByRole('button', { name: '開啟畫布' }).click();
  await p.waitForSelector('.cv-view');
  await p.waitForFunction(() => document.querySelectorAll('.cv-node').length >= 5);
  await settle(p);
};
const select = (p, ids) =>
  p.evaluate(ids => {
    const c = VaultUI.canvasState();
    c.sel = {};
    ids.forEach(i => (c.sel[i] = 1));
    c.selEdge = null;
    VaultUI.cv.syncBar();
    VaultUI.cv.syncInspector();
    VaultUI.cv.draw();
  }, ids);
const box = (p, id) => p.locator('.cv-node[data-id="' + id + '"]').boundingBox();
const drag = async (p, id, dxScreen, dyScreen, opts) => {
  const b = await box(p, id);
  const x = b.x + b.width / 2,
    y = b.y + 12;
  if (opts && opts.alt) await p.keyboard.down('Alt');
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x + dxScreen / 2, y + dyScreen / 2, { steps: 3 });
  await p.mouse.move(x + dxScreen, y + dyScreen, { steps: 3 });
  const g = await p.locator('.cv-guide').count();
  await p.mouse.up();
  if (opts && opts.alt) await p.keyboard.up('Alt');
  await settle(p);
  return g;
};
const clip = (p, type, text) =>
  p.evaluate(
    ([type, text]) => {
      const dt = new DataTransfer();
      if (text !== null) dt.setData('text/plain', text);
      const ev = new ClipboardEvent(type, { clipboardData: dt, bubbles: true, cancelable: true });
      document.querySelector('.cv-view').dispatchEvent(ev);
      return dt.getData('text/plain');
    },
    [type, text]
  );

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('vault-cvzoomclick', '0');
      } catch (e) {}
    });
    const o = await newPage(ctx, env, OWNER);
    await open(o);

    await t(
      '工具列：擁有者最上層只有少數按鈕＋三個下拉選單；選單可用鍵盤與 Esc、點外面收起，點項目後自動收起',
      async () => {
        const top = await o.locator('.cv-bar > button, .cv-bar > .cv-menu > button').count();
        assert.ok(top <= 16, '最上層按鈕數 ' + top);
        for (const m of ['＋ 新增', '排列', '更多'])
          assert.strictEqual(await o.locator('.cv-bar .cv-mbtn', { hasText: m }).count(), 1, m);
        const nb = o.locator('.cv-bar .cv-mbtn', { hasText: '＋ 新增' });
        assert.strictEqual(await nb.getAttribute('aria-expanded'), 'false');
        await nb.click();
        assert.strictEqual(await nb.getAttribute('aria-expanded'), 'true');
        assert.ok(await o.locator('.cv-mlist:not([hidden])').isVisible());
        assert.ok(
          await o.evaluate(() => document.activeElement.classList.contains('cv-mi')),
          '開啟後焦點進選單'
        );
        await o.keyboard.press('ArrowDown');
        await o.keyboard.press('Escape');
        assert.strictEqual(await nb.getAttribute('aria-expanded'), 'false');
        await nb.click();
        await o.mouse.click(5, 5);
        assert.strictEqual(await o.locator('.cv-mlist:not([hidden])').count(), 0, '點外面收起');
        const cnt0 = (await state(o)).board.nodes.length;
        await cvItem(o, '＋ 新增', '文字卡片');
        assert.strictEqual((await state(o)).board.nodes.length, cnt0 + 1);
        assert.strictEqual(await o.locator('.cv-mlist:not([hidden])').count(), 0, '點項目後收起');
        await o.keyboard.press('Control+z');
        await settle(o);
        assert.strictEqual((await state(o)).board.nodes.length, cnt0);
      }
    );

    await t(
      '對齊吸附：靠近另一張卡片的邊時吸到對齊位置並出現對齊線；按住 Alt 或關閉吸附就不吸；放開後線消失',
      async () => {
        const s0 = await state(o),
          k = s0.view.k;
        const bx = nodeOf(s0, 'B');
        const g1 = await drag(o, 'B', (3 - bx.x) * k, 0); // 左邊落在 A 左邊右側 3（世界座標）→ 吸到 0
        let s = await state(o);
        assert.strictEqual(nodeOf(s, 'B').x, 0);
        assert.ok(g1 >= 1, '拖曳中有對齊線');
        assert.strictEqual(await o.locator('.cv-guide').count(), 0, '放開後清掉');
        await o.keyboard.press('Control+z');
        await settle(o);
        await drag(o, 'B', (3 - bx.x) * k, 0, { alt: true });
        s = await state(o);
        assert.ok(Math.abs(nodeOf(s, 'B').x - 3) <= 1, 'Alt 不吸附：' + nodeOf(s, 'B').x);
        await o.keyboard.press('Control+z');
        await settle(o);
        await cvItem(o, '排列', '對齊吸附');
        assert.ok((await o.locator('.cv-mi', { hasText: '對齊吸附' }).first().textContent()).includes('關'));
        await drag(o, 'B', (3 - bx.x) * k, 0);
        s = await state(o);
        assert.ok(Math.abs(nodeOf(s, 'B').x - 3) <= 1, '關閉吸附：' + nodeOf(s, 'B').x);
        await o.keyboard.press('Control+z');
        await settle(o);
        await cvItem(o, '排列', '對齊吸附'); // 再開回來
        assert.ok((await o.locator('.cv-mi', { hasText: '對齊吸附' }).first().textContent()).includes('開'));
      }
    );

    await t('對齊與等距：選 3 張→水平等距、靠上；少選時項目停用；群組帶著成員；可復原', async () => {
      await select(o, ['A']);
      await o.locator('.cv-bar .cv-mbtn', { hasText: '排列' }).click();
      assert.ok(await o.locator('.cv-mlist:not([hidden]) .cv-mi', { hasText: '靠左對齊' }).isDisabled());
      await o.keyboard.press('Escape');
      await select(o, ['A', 'B', 'C']);
      const before = await state(o);
      await cvItem(o, '排列', '水平等距');
      let s = await state(o);
      const A = nodeOf(s, 'A'),
        B = nodeOf(s, 'B'),
        C = nodeOf(s, 'C');
      assert.strictEqual(B.x - (A.x + A.width), C.x - (B.x + B.width), '間距相等');
      assert.strictEqual(A.x, 0);
      assert.strictEqual(C.x, 800);
      assert.ok(s.dirty);
      await cvItem(o, '排列', '靠上對齊');
      s = await state(o);
      assert.deepStrictEqual(
        ['A', 'B', 'C'].map(i => nodeOf(s, i).y),
        [0, 0, 0]
      );
      await select(o, ['G', 'A']);
      await cvItem(o, '排列', '靠右對齊');
      s = await state(o);
      assert.strictEqual(nodeOf(s, 'G').x + nodeOf(s, 'G').width, nodeOf(s, 'A').x + nodeOf(s, 'A').width);
      assert.strictEqual(nodeOf(s, 'D')['x-parent'], 'G');
      assert.strictEqual(
        nodeOf(s, 'D').x - nodeOf(s, 'G').x,
        nodeOf(before, 'D').x - nodeOf(before, 'G').x,
        '成員與群組相對位置不變'
      );
      for (let i = 0; i < 3; i++) {
        await o.keyboard.press('Control+z');
        await settle(o);
      }
      s = await state(o);
      assert.deepStrictEqual(
        ['A', 'B', 'C'].map(i => [nodeOf(s, i).x, nodeOf(s, i).y]),
        ['A', 'B', 'C'].map(i => [nodeOf(before, i).x, nodeOf(before, i).y])
      );
    });

    await t('屬性欄：多選時出現排列按鈕列，2 張以下等距停用', async () => {
      await select(o, ['A', 'B']);
      assert.strictEqual(await o.locator('.cv-alignrow button').count(), 8);
      assert.ok(await o.locator('.cv-alignrow [data-align="hdist"]').isDisabled());
      assert.ok(!(await o.locator('.cv-alignrow [data-align="left"]').isDisabled()));
      await o.locator('.cv-alignrow [data-align="left"]').click();
      assert.strictEqual(nodeOf(await state(o), 'B').x, 0);
      await o.keyboard.press('Control+z');
      await settle(o);
    });

    await t(
      '複製貼上：複製→剪貼簿是 JSON Canvas；貼上換新 id、連線跟著、錯開位置；Ctrl+D 複製；剪下；可貼到文字欄之外的任何情況皆不影響欄位輸入',
      async () => {
        await select(o, ['A', 'B']);
        const copied = await clip(o, 'copy', null);
        const f = JSON.parse(copied);
        assert.deepStrictEqual(f.nodes.map(n => n.id).sort(), ['A', 'B']);
        assert.deepStrictEqual(
          f.edges.map(e => e.id),
          ['e1']
        );
        const n0 = (await state(o)).board.nodes.length;
        await clip(o, 'paste', copied);
        let s = await state(o);
        assert.strictEqual(s.board.nodes.length, n0 + 2);
        assert.strictEqual(s.board.edges.length, 3);
        assert.strictEqual(new Set(s.board.nodes.map(n => n.id)).size, s.board.nodes.length);
        const sel = Object.keys(s.sel);
        assert.strictEqual(sel.length, 2);
        assert.ok(sel.every(id => !['A', 'B'].includes(id)));
        const pa = s.board.nodes.find(n => n.id !== 'A' && n.text === '甲卡片 alpha');
        assert.ok(pa.x > 0 && pa.y > 0, '錯開');
        await clip(o, 'paste', copied);
        s = await state(o);
        assert.strictEqual(s.board.nodes.length, n0 + 4);
        await select(o, ['C']);
        await o.locator('.cv-view').focus();
        await o.keyboard.press('Control+d');
        await settle(o);
        s = await state(o);
        assert.strictEqual(s.board.nodes.length, n0 + 5);
        assert.strictEqual(Object.keys(s.sel).length, 1);
        assert.ok(!s.sel.C);
        const before = s.board.nodes.length;
        await select(o, ['L1']);
        await clip(o, 'cut', null);
        s = await state(o);
        assert.strictEqual(s.board.nodes.length, before - 1);
        for (let i = 0; i < 5; i++) {
          await o.keyboard.press('Control+z');
          await settle(o);
        }
        assert.strictEqual((await state(o)).board.nodes.length, n0);
      }
    );

    await t(
      '貼上外部內容：網址→連結卡、文字→文字卡、惡意 JSON（script 型別、javascript: 網址、超長）被清理；在輸入欄裡貼上不會建立卡片',
      async () => {
        const n0 = (await state(o)).board.nodes.length;
        await clip(o, 'paste', 'https://example.com/a');
        let s = await state(o);
        const l = s.board.nodes[s.board.nodes.length - 1];
        assert.strictEqual(l.type, 'link');
        assert.strictEqual(l.url, 'https://example.com/a');
        await clip(o, 'paste', '隨手記的一段文字');
        s = await state(o);
        assert.strictEqual(s.board.nodes[s.board.nodes.length - 1].type, 'text');
        await clip(
          o,
          'paste',
          JSON.stringify({
            nodes: [
              { id: 'x', type: 'script', x: 0, y: 0 },
              { id: 'y', type: 'link', url: 'javascript:alert(1)', x: 0, y: 0, width: 100, height: 100 }
            ],
            edges: [{ id: 'z', fromNode: 'x', toNode: 'y' }]
          })
        );
        s = await state(o);
        assert.strictEqual(s.board.nodes.length, n0 + 2, '惡意卡片被剔除、整包不貼');
        assert.ok(!s.board.nodes.some(n => n.url && /^javascript/i.test(n.url)));
        await settle(o);
        assert.strictEqual(await o.locator('.cv-node a[href^="javascript"]').count(), 0);
        assert.strictEqual(s.board.edges.length, 2);
        const before = s.board.nodes.length;
        await select(o, ['A']);
        await o
          .locator('.cv-insp textarea, .cv-insp input')
          .first()
          .evaluate(el => {
            const dt = new DataTransfer();
            dt.setData('text/plain', 'https://example.com/zzz');
            el.dispatchEvent(
              new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
            );
          });
        assert.strictEqual((await state(o)).board.nodes.length, before, '欄位內貼上不建卡');
        for (let i = 0; i < 2; i++) {
          await o.keyboard.press('Control+z');
          await settle(o);
        }
        assert.strictEqual((await state(o)).board.nodes.length, n0);
        assert.strictEqual(o.errors.length, 0, o.errors.join('|'));
      }
    );

    await t(
      '畫布內搜尋：Ctrl+F 開啟；不分大小寫；Enter 跳下一個並放大到該卡；標示符合的卡片；Esc 關閉並清除標示',
      async () => {
        await o.locator('.cv-view').focus();
        await o.keyboard.press('Control+f');
        await o.waitForSelector('#cv-find');
        await o.locator('#cv-find').fill('alpha');
        await o.waitForFunction(
          () => VaultUI.canvasState().hits && Object.keys(VaultUI.canvasState().hits).length === 2
        );
        await settle(o);
        let s = await state(o);
        assert.deepStrictEqual(Object.keys(s.hits).sort(), ['A', 'C']);
        assert.strictEqual(s.hitCur, 'A');
        assert.strictEqual(await o.locator('.cv-findn').innerText(), '1 / 2');
        assert.ok(await o.locator('.cv-node[data-id="A"]').evaluate(e => e.classList.contains('hitcur')));
        const v1 = s.view;
        await o.locator('#cv-find').press('Enter');
        await settle(o);
        s = await state(o);
        assert.strictEqual(s.hitCur, 'C');
        assert.strictEqual(await o.locator('.cv-findn').innerText(), '2 / 2');
        assert.ok(s.view.x !== v1.x);
        await o.locator('#cv-find').press('Enter');
        s = await state(o);
        assert.strictEqual(s.hitCur, 'A', '繞回第一個');
        await o.locator('#cv-find').fill('外部參考');
        await o.waitForFunction(() => VaultUI.canvasState().hitCur === 'L1');
        await o.locator('#cv-find').fill('第一章');
        await o.waitForFunction(() => VaultUI.canvasState().hitCur === 'G');
        await o.locator('#cv-find').fill('索引');
        await o.waitForFunction(() => VaultUI.canvasState().hitCur === 'F1', null, { timeout: 5000 }); // 筆記卡：搜標題、標籤與已載入的內文
        await o.locator('#cv-find').fill('完全不存在');
        await o.waitForFunction(() => VaultUI.canvasState().hitCur === null);
        assert.strictEqual(await o.locator('.cv-findn').innerText(), '找不到');
        await o.locator('#cv-find').press('Escape');
        await settle(o);
        s = await state(o);
        assert.strictEqual(s.hits, null);
        assert.strictEqual(await o.locator('#cv-find').count(), 0);
        assert.strictEqual(await o.locator('.cv-node.hit, .cv-node.hitcur').count(), 0);
      }
    );

    await t('搜尋收合群組裡的卡片：改移到收合的群組並提示', async () => {
      await o.evaluate(() => {
        const c = VaultUI.canvasState();
        c.board = Object.assign({}, c.board, {
          nodes: c.board.nodes.map(n => (n.id === 'G' ? Object.assign({}, n, { 'x-collapsed': true }) : n))
        });
        VaultUI.cv.draw();
      });
      await o.locator('.cv-view').focus();
      await o.keyboard.press('Control+f');
      await o.locator('#cv-find').fill('gamma');
      await o.waitForFunction(() => VaultUI.canvasState().hitCur === 'D');
      await settle(o);
      assert.ok((await o.locator('.cv-status').innerText()).includes('收合的群組'));
      await o.locator('#cv-find').press('Escape');
      await o.keyboard.press('Control+z');
      await settle(o);
    });

    const v = await newPage(ctx, env, VISITOR);
    await open(v);
    await t(
      '訪客：沒有新增／排列選單、沒有刪除與匯入；有搜尋與「更多」（預覽圖、分享、匯出）；Ctrl+V、Ctrl+D 不會改畫布',
      async () => {
        assert.strictEqual(await v.locator('.cv-bar .cv-mbtn', { hasText: '＋ 新增' }).count(), 0);
        assert.strictEqual(await v.locator('.cv-bar .cv-mbtn', { hasText: '排列' }).count(), 0);
        assert.strictEqual(await v.locator('.cv-bar .cv-mbtn', { hasText: '更多' }).count(), 1);
        assert.ok(await v.getByRole('button', { name: '搜尋', exact: true }).isVisible());
        const items = await v.locator('.cv-mlist .cv-mi').allTextContents();
        for (const bad of ['刪除畫布', '匯入', '放大所選', '單擊放大'])
          assert.ok(!items.some(x => x.includes(bad)), bad + ' 不該出現：' + items.join('|'));
        for (const ok of ['預覽圖', '分享連結', '匯出'])
          assert.ok(
            items.some(x => x.includes(ok)),
            ok
          );
        const before = JSON.stringify((await state(v)).board);
        await clip(v, 'paste', 'https://example.com/v');
        await v.locator('.cv-view').focus();
        await v.keyboard.press('Control+d');
        await settle(v);
        assert.strictEqual(JSON.stringify((await state(v)).board), before);
        await v.getByRole('button', { name: '搜尋', exact: true }).click();
        await v.locator('#cv-find').fill('beta');
        await v.waitForFunction(() => VaultUI.canvasState().hitCur === 'B');
        assert.strictEqual(v.errors.length, 0, v.errors.join('|'));
      }
    );

    await t(
      '效能與體積預算：index.html ≤ 720 KB；300 張卡片時開啟吸附拖曳一次的繪製時間在預算內；沒用到搜尋時不建立對齊線／搜尋 DOM',
      async () => {
        const kb = fs.statSync(path.join(__dirname, '..', '..', 'dist', 'index.html')).size / 1024;
        assert.ok(kb <= 720, 'index.html ' + Math.round(kb) + ' KB');
        assert.strictEqual(await o.locator('#cv-find').count(), 0);
        assert.strictEqual(await o.locator('.cv-guide').count(), 0);
        const nodes = [];
        for (let i = 0; i < 300; i++)
          nodes.push(T_('n' + i, (i % 20) * 260, Math.floor(i / 20) * 160, 240, 120, '卡片 ' + i));
        env.store.saveTopic({ id: 'big', title: '大畫布', defaultPublic: true });
        assert.ok(env.call('saveBoard', { topic: 'big', board: { nodes, edges: [] } }).ok);
        const p = await newPage(
          await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 900 } }),
          env,
          OWNER
        );
        await p.locator('#shelfBody button.pill', { hasText: '大畫布' }).first().click();
        await p.getByRole('button', { name: '開啟畫布' }).click();
        await p.waitForSelector('.cv-node');
        await p.evaluate(() => {
          const c = VaultUI.canvasState();
          c.view = { x: 20, y: 20, k: 0.7 };
          c.pm = [];
          VaultUI.cv.draw();
        });
        await settle(p);
        const b = await box(p, 'n23');
        await p.mouse.move(b.x + 20, b.y + 10);
        await p.mouse.down();
        for (let i = 1; i <= 20; i++) await p.mouse.move(b.x + 20 + i * 6, b.y + 10 + i * 4);
        const t0 = Date.now();
        const pm = await p.evaluate(() => VaultUI.canvasState().pm.slice());
        await p.mouse.up();
        await settle(p);
        const sorted = pm.slice().sort((a, b) => a - b),
          p90 = sorted[Math.floor(sorted.length * 0.9)] || 0;
        assert.ok(pm.length > 5 && p90 < 60, '繪製 p90 ' + p90.toFixed(1) + ' ms（' + pm.length + ' 次）');
        assert.strictEqual(p.errors.length, 0, p.errors.join('|'));
        await p.close();
      }
    );
    console.log('\nP7a 端對端：' + H.count() + ' 項全部通過');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n失敗：', e.message);
  process.exit(1);
});
