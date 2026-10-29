// P7b-2 端對端：圖片卡（選檔上傳、儲存、訪客檢視、拒絕非圖片）、連線文字大小與位置
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
    T_('C', 300, 500, 240, 120, '丙'),
    T_('D', 900, 500, 240, 120, '丁')
  ],
  edges: [
    { id: 'E1', fromNode: 'A', toNode: 'B', label: '關聯' },
    { id: 'E2', fromNode: 'C', toNode: 'D', label: '亂填', 'x-labelsize': 'banana', 'x-labelpos': 'zzz' }
  ]
};
assert.ok(env.call('saveBoard', { topic: 'pub', board }).ok);
const server = () => {
  const f = env.store.findFileByName('boards', 'pub.canvas.json');
  return JSON.parse(env.store.readText(f.fileId));
};
const cvItem = async (p, menu, item) => {
  const b = p.locator('.cv-bar .cv-mbtn', { hasText: menu }).first();
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
  await p
    .locator('.cv-mlist:not([hidden]) .cv-mi', {
      hasText: typeof item === 'string' ? new RegExp('^' + item + '$') : item
    })
    .first()
    .click();
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

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
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
      '連線文字：預設置中中字；選小／大字真的變小／變大；選回預設不存欄位；亂填的值當預設',
      async () => {
        await o.evaluate(() => {
          const c = VaultUI.canvasState();
          c.selEdge = 'E1';
          c.sel = {};
          VaultUI.cv.syncInspector();
          VaultUI.cv.draw();
        });
        await settle(o);
        const px = () =>
          o.locator('[data-e="E1"] .cv-et').evaluate(e => parseFloat(getComputedStyle(e).fontSize));
        const x0 = async () => await o.locator('[data-e="E1"] .cv-et').evaluate(e => +e.getAttribute('x'));
        assert.strictEqual(await o.locator('#cv-labelsize').inputValue(), 'm');
        assert.strictEqual(await o.locator('#cv-labelpos').inputValue(), 'mid');
        const mid = await px(),
          xm = await x0();
        assert.strictEqual(mid, 14);
        await o.locator('#cv-labelsize').selectOption('s');
        await settle(o);
        assert.strictEqual(await px(), 11);
        await o.locator('#cv-labelsize').selectOption('l');
        await settle(o);
        assert.strictEqual(await px(), 20);
        await o.locator('#cv-labelpos').selectOption('start');
        await settle(o);
        const xs = await x0();
        assert.ok(xs < xm - 50, xs + ' vs ' + xm);
        await o.locator('#cv-labelpos').selectOption('end');
        await settle(o);
        const xe = await x0();
        assert.ok(xe > xm + 50, xe + ' vs ' + xm);
        await o.locator('#cv-labelsize').selectOption('m');
        await o.locator('#cv-labelpos').selectOption('mid');
        await settle(o);
        const e1 = (await state(o)).board.edges.find(e => e.id === 'E1');
        assert.strictEqual(e1['x-labelsize'], undefined);
        assert.strictEqual(e1['x-labelpos'], undefined);
        assert.strictEqual(
          await o.locator('[data-e="E2"] .cv-et').evaluate(e => parseFloat(getComputedStyle(e).fontSize)),
          14,
          '亂填的值＝中'
        );
        await o.locator('#cv-labelsize').selectOption('l');
        await o.locator('#cv-labelpos').selectOption('end');
        await o.locator('.cv-view').focus();
        await o.keyboard.press('Control+s');
        await o.waitForFunction(() => !VaultUI.canvasState().dirty);
        const sv = server().edges.find(e => e.id === 'E1');
        assert.strictEqual(sv['x-labelsize'], 'l');
        assert.strictEqual(sv['x-labelpos'], 'end');
      }
    );

    await t('圖片卡：新增→圖片選檔 → 上傳、出現圖片卡、顯示圖；儲存後雲端有圖與卡片', async () => {
      const [fc] = await Promise.all([o.waitForEvent('filechooser'), cvItem(o, '＋ 新增', '圖片')]);
      await fc.setFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG });
      await o.waitForFunction(() =>
        VaultUI.canvasState().board.nodes.some(n => /^assets\/.*\.img$/.test(n.file || ''))
      );
      const nd = (await state(o)).board.nodes.find(n => /\.img$/.test(n.file || ''));
      await o.waitForFunction(id => {
        const i = document.querySelector('.cv-node[data-id="' + id + '"] img.cv-photo');
        return i && /^data:image\/(png|jpeg|webp);base64,/.test(i.src);
      }, nd.id);
      assert.ok(/已加入/.test(await o.locator('.cv-status').textContent()));
      await o.locator('.cv-view').focus();
      await o.keyboard.press('Control+s');
      await o.waitForFunction(() => !VaultUI.canvasState().dirty);
      assert.ok(server().nodes.some(n => n.file === nd.file));
      const id = /assets\/(.*)\.img/.exec(nd.file)[1];
      assert.ok(env.call('getImage', { id }).ok);
    });

    await t('圖片卡：不是圖片（文字檔、SVG）只顯示提示，不上傳、不新增卡片', async () => {
      const n0 = (await state(o)).board.nodes.length,
        up0 = env.store.listFilesPage('assets', null, 99, '.img').files.length;
      const [fc] = await Promise.all([o.waitForEvent('filechooser'), cvItem(o, '＋ 新增', '圖片')]);
      await fc.setFiles({ name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
      await settle(o);
      assert.ok(/只支援/.test(await o.locator('.cv-status').textContent()));
      assert.strictEqual((await state(o)).board.nodes.length, n0);
      assert.strictEqual(env.store.listFilesPage('assets', null, 99, '.img').files.length, up0);
    });

    await t('圖片卡：拖放圖片檔到畫布會新增；後端拒絕時顯示原因、不新增卡片', async () => {
      const n0 = (await state(o)).board.nodes.length;
      await o.evaluate(async () => {
        const b = await (
          await fetch(
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
          )
        ).blob();
        const dt = new DataTransfer();
        dt.items.add(new File([b], 'd.png', { type: 'image/png' }));
        const v = document.querySelector('.cv-view');
        v.dispatchEvent(
          new DragEvent('drop', {
            dataTransfer: dt,
            bubbles: true,
            cancelable: true,
            clientX: 400,
            clientY: 300
          })
        );
      });
      await o.waitForFunction(n => VaultUI.canvasState().board.nodes.length === n + 1, n0);
      await o.evaluate(() => {
        window.__origApi = VaultUI.api;
        VaultUI.api = function (a, p) {
          return a === 'uploadImage'
            ? Promise.resolve({ ok: false, error: '內容不符規則', reasons: ['圖片超過 5 MB 的技術上限'] })
            : window.__origApi(a, p);
        };
      });
      await o.evaluate(async () => {
        const b = await (
          await fetch(
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
          )
        ).blob();
        const dt = new DataTransfer();
        dt.items.add(new File([b], 'e.png', { type: 'image/png' }));
        document
          .querySelector('.cv-view')
          .dispatchEvent(
            new DragEvent('drop', {
              dataTransfer: dt,
              bubbles: true,
              cancelable: true,
              clientX: 500,
              clientY: 300
            })
          );
      });
      await o.waitForFunction(() => /失敗/.test(document.querySelector('.cv-status').textContent));
      assert.strictEqual((await state(o)).board.nodes.length, n0 + 1);
      await o.evaluate(() => {
        VaultUI.api = window.__origApi;
      });
    });

    await t('訪客：公開主題畫布上的圖片看得到；私人主題的圖片讀不到；訪客沒有圖片入口', async () => {
      const v = await newPage(ctx, env, VISITOR);
      await open(v);
      await v.waitForFunction(
        () =>
          document.querySelector('img.cv-photo') &&
          /^data:image/.test(document.querySelector('img.cv-photo').src)
      );
      assert.strictEqual(await v.locator('.cv-bar .cv-mbtn', { hasText: '＋ 新增' }).count(), 0);
      await v.close();
      const up = env.call('uploadImage', { data: 'data:image/png;base64,' + PNG.toString('base64') });
      assert.ok(up.ok);
      assert.strictEqual(JSON.parse(JSON.stringify(env.call('getImage', { id: up.id }, VISITOR))).ok, false);
    });
    console.log('\nP7b-2 端對端：' + H.count() + ' 項全部通過');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n失敗：', e.message);
  process.exit(1);
});
