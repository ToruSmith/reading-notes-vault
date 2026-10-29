// P7b 端對端：文字大小、邊緣拉線（點一下／拖到卡片／拖到空白）、手繪存成 SVG 卡
const H = require('./harness');
const { chromium, assert, OWNER, VISITOR, makeEnv, newPage, settle, t } = H;
const env = makeEnv();
env.store.saveTopic({ id: 'pub', title: '公開本', defaultPublic: true });
const T_ = (id, x, y, w, h, text, ex) =>
  Object.assign({ id, type: 'text', text, x, y, width: w, height: h }, ex || {});
const board = {
  nodes: [
    T_('A', 0, 0, 240, 120, '甲'),
    T_('B', 600, 0, 240, 120, '乙'),
    T_('C', 300, 500, 240, 120, '丙', { 'x-fontsize': 'banana' }),
    { id: 'G', type: 'group', label: '群組', x: 900, y: 300, width: 700, height: 400 },
    T_('D', 950, 360, 240, 120, '丁', { 'x-parent': 'G' })
  ],
  edges: []
};
assert.ok(env.call('saveBoard', { topic: 'pub', board }).ok);
const server = () => {
  const f = env.store.findFileByName('boards', 'pub.canvas.json');
  return JSON.parse(env.store.readText(f.fileId));
};
const cvItem = async (p, menu, item) => {
  const b = p.locator('.cv-bar .cv-mbtn', { hasText: menu }).first();
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
  await p.locator('.cv-mlist:not([hidden]) .cv-mi', { hasText: item }).first().click();
};
const state = p =>
  p.evaluate(() => {
    const c = VaultUI.canvasState();
    return JSON.parse(
      JSON.stringify({ board: c.board, sel: c.sel, selEdge: c.selEdge, view: c.view, dirty: c.dirty })
    );
  });
const nodeOf = (s, id) => s.board.nodes.find(n => n.id === id);
const open = async p => {
  await p.locator('#shelfBody button.pill', { hasText: '公開本' }).first().click();
  await p.getByRole('button', { name: '開啟畫布' }).click();
  await p.waitForSelector('.cv-view');
  await p.waitForFunction(() => document.querySelectorAll('.cv-node').length >= 4);
  await settle(p);
};
const select = async (p, ids) => {
  await p.evaluate(ids => {
    const c = VaultUI.canvasState();
    c.sel = {};
    ids.forEach(i => (c.sel[i] = 1));
    c.selEdge = null;
    VaultUI.cv.syncBar();
    VaultUI.cv.syncInspector();
    VaultUI.cv.draw();
  }, ids);
  await settle(p);
};
const box = (p, sel) => p.locator(sel).boundingBox();

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
      '文字大小：屬性欄可選小／中／大／特大，字真的變大；選回中就不存欄位；亂填的值當作中；存檔後雲端有',
      async () => {
        await select(o, ['A']);
        const sel = o.locator('#cv-fontsize');
        assert.strictEqual(await sel.inputValue(), 'm');
        const fs0 = await o
          .locator('.cv-node[data-id="A"] .cv-body')
          .evaluate(e => parseFloat(getComputedStyle(e).fontSize));
        await sel.selectOption('xl');
        await settle(o);
        const fs1 = await o
          .locator('.cv-node[data-id="A"] .cv-body')
          .evaluate(e => parseFloat(getComputedStyle(e).fontSize));
        assert.ok(fs1 > fs0 * 1.5, fs0 + '→' + fs1);
        assert.strictEqual(nodeOf(await state(o), 'A')['x-fontsize'], 'xl');
        await o.locator('#cv-fontsize').selectOption('s');
        await settle(o);
        assert.ok(await o.locator('.cv-node[data-id="A"]').evaluate(e => e.classList.contains('fs-s')));
        await o.locator('#cv-fontsize').selectOption('l');
        await o.locator('.cv-view').focus();
        await o.keyboard.press('Control+s');
        await o.waitForFunction(() => !VaultUI.canvasState().dirty);
        assert.strictEqual(nodeOf({ board: server() }, 'A')['x-fontsize'], 'l');
        await select(o, ['A']);
        await o.locator('#cv-fontsize').selectOption('m');
        assert.strictEqual(nodeOf(await state(o), 'A')['x-fontsize'], undefined);
        assert.ok(
          await o.locator('.cv-node[data-id="C"]').evaluate(e => e.classList.contains('fs-m')),
          '亂填的值＝中'
        );
        await select(o, ['C']);
        assert.strictEqual(await o.locator('#cv-fontsize').inputValue(), 'm');
        await o.keyboard.press('Control+z');
        await settle(o);
      }
    );

    await t(
      '邊緣圓點：只有「單選的非群組卡片」才有四個圓點；多選、群組、連線選取、訪客都沒有；圓點在視窗內',
      async () => {
        await select(o, ['A']);
        assert.strictEqual(await o.locator('.cv-ed').count(), 4);
        const bb = await box(o, '.cv-ed-right'),
          vb = await o.locator('.cv-view').boundingBox();
        assert.ok(bb.x >= vb.x && bb.x + bb.width <= vb.x + vb.width);
        await select(o, ['A', 'B']);
        assert.strictEqual(await o.locator('.cv-ed').count(), 0);
        await select(o, ['G']);
        assert.strictEqual(await o.locator('.cv-ed').count(), 0);
        await select(o, []);
        assert.strictEqual(await o.locator('.cv-ed').count(), 0);
        await select(o, ['A']);
        await o.getByRole('button', { name: '連線', exact: true }).click();
        await settle(o);
        assert.strictEqual(await o.locator('.cv-ed').count(), 0, '連線模式不顯示');
        await o.keyboard.press('Escape');
        const v = await newPage(ctx, env, VISITOR);
        await open(v);
        await v.locator('.cv-node[data-id="A"]').click();
        assert.strictEqual(await v.locator('.cv-ed').count(), 0);
        await v.close();
      }
    );

    await t(
      '邊緣拉線：點一下圓點＝旁邊長出新卡片＋連線＋進入輸入；復原一次全部還原；邊的 fromSide／toSide 合法',
      async () => {
        await select(o, ['A']);
        const n0 = await state(o);
        await o.locator('.cv-ed-right').click({ force: true });
        await settle(o);
        let s = await state(o);
        assert.strictEqual(s.board.nodes.length, n0.board.nodes.length + 1);
        assert.strictEqual(s.board.edges.length, 1);
        const nw = s.board.nodes[s.board.nodes.length - 1],
          e = s.board.edges[0];
        assert.ok(nw.x > 240, '在 A 右側');
        assert.strictEqual(e.fromNode, 'A');
        assert.strictEqual(e.toNode, nw.id);
        assert.strictEqual(e.fromSide, 'right');
        assert.strictEqual(e.toSide, 'left');
        assert.deepStrictEqual(Object.keys(s.sel), [nw.id]);
        assert.ok(
          await o.evaluate(() => document.activeElement && document.activeElement.tagName === 'TEXTAREA'),
          '焦點在文字欄'
        );
        await o.keyboard.type('新想法');
        assert.strictEqual(nodeOf(await state(o), nw.id).text, '新想法');
        await o.locator('.cv-view').focus();
        await o.keyboard.press('Control+z');
        await o.keyboard.press('Control+z');
        await settle(o);
        s = await state(o);
        assert.strictEqual(s.board.nodes.length, n0.board.nodes.length);
        assert.strictEqual(s.board.edges.length, 0);
      }
    );

    await t(
      '邊緣拉線：拖到另一張卡片＝只連線（不新增卡片）；重複連線被擋；拖到空白處＝在放開的位置新增並連線；落在群組內自動歸屬該群組',
      async () => {
        await select(o, ['A']);
        const hb = await box(o, '.cv-ed-right'),
          bb = await box(o, '.cv-node[data-id="B"]');
        await o.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
        await o.mouse.down();
        await o.mouse.move(bb.x + bb.width / 2 - 40, bb.y + bb.height / 2, { steps: 6 });
        assert.strictEqual(await o.locator('.cv-rubber line').count(), 1, '拖曳中有橡皮筋線');
        await o.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 2 });
        await o.mouse.up();
        await settle(o);
        let s = await state(o);
        assert.strictEqual(s.board.nodes.length, 5);
        assert.strictEqual(s.board.edges.length, 1);
        assert.deepStrictEqual(
          [
            s.board.edges[0].fromNode,
            s.board.edges[0].toNode,
            s.board.edges[0].fromSide,
            s.board.edges[0].toSide
          ],
          ['A', 'B', 'right', 'left']
        );
        assert.strictEqual(await o.locator('.cv-rubber').count(), 0, '放開後橡皮筋消失');
        assert.strictEqual(s.selEdge, s.board.edges[0].id);
        await select(o, ['A']);
        const hb2 = await box(o, '.cv-ed-right');
        await o.mouse.move(hb2.x + 5, hb2.y + 5);
        await o.mouse.down();
        await o.mouse.move(bb.x + 60, bb.y + 60, { steps: 5 });
        await o.mouse.up();
        await settle(o);
        s = await state(o);
        assert.strictEqual(s.board.edges.length, 1, '重複連線被擋');
        assert.ok((await o.locator('.cv-status').innerText()).includes('已經有連線'));
        await select(o, ['A']);
        const hb3 = await box(o, '.cv-ed-bottom'),
          vb = await o.locator('.cv-view').boundingBox();
        const dx = vb.x + 300,
          dy = vb.y + vb.height - 90;
        await o.mouse.move(hb3.x + 6, hb3.y + 6);
        await o.mouse.down();
        await o.mouse.move(dx, dy, { steps: 8 });
        await o.mouse.up();
        await settle(o);
        s = await state(o);
        assert.strictEqual(s.board.nodes.length, 6);
        const nn = s.board.nodes[5];
        assert.strictEqual(nn.type, 'text');
        assert.strictEqual(s.board.edges[1].fromSide, 'bottom');
        assert.strictEqual(s.board.edges[1].toNode, nn.id);
        const wp = await o.evaluate(([x, y]) => VaultUI.cv.toWorld(x, y), [dx, dy]);
        assert.ok(
          Math.abs(nn.x + nn.width / 2 - wp.x) <= 2 && Math.abs(nn.y + nn.height / 2 - wp.y) <= 2,
          '新卡片中心在放開處'
        );
        await select(o, ['B']);
        const hb4 = await box(o, '.cv-ed-bottom');
        const g = await box(o, '.cv-node[data-id="G"]');
        await o.mouse.move(hb4.x + 6, hb4.y + 6);
        await o.mouse.down();
        await o.mouse.move(g.x + g.width * 0.7, g.y + g.height * 0.7, { steps: 8 });
        await o.mouse.up();
        await settle(o);
        s = await state(o);
        const gn = s.board.nodes[s.board.nodes.length - 1];
        assert.strictEqual(gn['x-parent'], 'G');
        await o.locator('.cv-view').focus();
        await o.keyboard.press('Control+s');
        await o.waitForFunction(() => !VaultUI.canvasState().dirty);
        assert.strictEqual(server().edges.length, 3);
        assert.strictEqual(o.errors.length, 0, o.errors.join('|'));
      }
    );

    await t(
      '手繪：開畫板→畫兩筆→橡皮擦刪掉一筆→上一筆→重畫→完成：後端收到乾淨的 SVG，畫布多一張 SVG 圖片卡，顯示成圖；公開主題的訪客看得到',
      async () => {
        await cvItem(o, '＋ 新增', '手繪');
        const pad = o.locator('.cv-drawpad');
        await pad.waitFor();
        assert.ok(await o.locator('#cv-draw-ok').isDisabled(), '沒筆跡不能完成');
        const pb = await pad.boundingBox();
        const stroke = async pts => {
          await o.mouse.move(pb.x + pts[0][0] * pb.width, pb.y + pts[0][1] * pb.height);
          await o.mouse.down();
          for (const q of pts.slice(1))
            await o.mouse.move(pb.x + q[0] * pb.width, pb.y + q[1] * pb.height, { steps: 4 });
          await o.mouse.up();
        };
        await stroke([
          [0.1, 0.2],
          [0.4, 0.3],
          [0.6, 0.2]
        ]);
        await stroke([
          [0.1, 0.8],
          [0.5, 0.7],
          [0.9, 0.8]
        ]);
        assert.strictEqual(await o.locator('.cv-drawpad path').count(), 2);
        await o.locator('[data-tool="erase"]').click();
        const pb2 = await pad.boundingBox();
        await o.mouse.move(pb2.x + 0.5 * pb2.width, pb2.y + 0.7 * pb2.height);
        await o.mouse.down();
        await o.mouse.move(pb2.x + 0.52 * pb2.width, pb2.y + 0.7 * pb2.height, { steps: 3 });
        await o.mouse.up();
        assert.strictEqual(await o.locator('.cv-drawpad path').count(), 1, '橡皮擦刪一筆');
        await o.locator('[data-tool="hl"]').click();
        await o.locator('.cv-pen').nth(1).click();
        await stroke([
          [0.2, 0.5],
          [0.7, 0.55]
        ]);
        assert.strictEqual(await o.locator('.cv-drawpad path').count(), 2);
        await o.getByRole('button', { name: '上一筆' }).click();
        assert.strictEqual(await o.locator('.cv-drawpad path').count(), 1);
        await o.locator('[data-tool="pen"]').click();
        await stroke([
          [0.3, 0.9],
          [0.6, 0.6]
        ]);
        const n0 = (await state(o)).board.nodes.length;
        await o.locator('#cv-draw-ok').click();
        await o.waitForFunction(n => VaultUI.canvasState().board.nodes.length === n + 1, n0);
        await settle(o);
        const s = await state(o),
          card = s.board.nodes[s.board.nodes.length - 1];
        assert.strictEqual(card.type, 'file');
        assert.ok(/^assets\/\d{8}-[a-z0-9]{2,8}\.svg$/.test(card.file), card.file);
        assert.strictEqual(await o.locator('.cv-drawpad').count(), 0, '畫板已關閉');
        await o.waitForSelector('.cv-node[data-id="' + card.id + '"] img.cv-svg');
        const id = card.file.replace(/^assets\//, '').replace(/\.svg$/, ''),
          got = env.call('getSvg', { id });
        assert.ok(got.ok);
        assert.ok(
          got.svg.includes('<path') && got.svg.includes('viewBox') && !/<script|onload/i.test(got.svg)
        );
        await o.locator('.cv-view').focus();
        await o.keyboard.press('Control+s');
        await o.waitForFunction(() => !VaultUI.canvasState().dirty);
        assert.ok(env.call('getSvg', { id }, VISITOR).ok, '公開主題畫布上的圖，訪客讀得到');
        assert.strictEqual(o.errors.length, 0, o.errors.join('|'));
      }
    );

    await t('手繪：後端拒絕時顯示原因、畫板內容保留可重試；訪客沒有手繪入口', async () => {
      await cvItem(o, '＋ 新增', '手繪');
      const pad = o.locator('.cv-drawpad');
      const pb = await pad.boundingBox();
      await o.mouse.move(pb.x + 50, pb.y + 50);
      await o.mouse.down();
      await o.mouse.move(pb.x + 200, pb.y + 120, { steps: 4 });
      await o.mouse.up();
      await o.evaluate(() => {
        const orig = VaultUI.api;
        window.__origApi = orig;
        VaultUI.api = function (a, p) {
          return a === 'uploadSvg' ? Promise.resolve({ ok: false, error: '內容不符規則' }) : orig(a, p);
        };
      });
      const n0 = (await state(o)).board.nodes.length;
      await o.locator('#cv-draw-ok').click();
      await o.waitForFunction(() => /失敗/.test(document.querySelector('.cv-status').textContent));
      assert.strictEqual((await state(o)).board.nodes.length, n0);
      assert.strictEqual(await o.locator('.cv-drawpad path').count(), 1, '筆跡還在');
      await o.evaluate(() => {
        VaultUI.api = window.__origApi;
      });
      await o.getByRole('button', { name: '關閉' }).click();
      const v = await newPage(ctx, env, VISITOR);
      await open(v);
      assert.strictEqual(await v.locator('.cv-bar .cv-mbtn', { hasText: '＋ 新增' }).count(), 0);
      await v.close();
    });
    console.log('\nP7b 端對端：' + H.count() + ' 項全部通過');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n失敗：', e.message);
  process.exit(1);
});
