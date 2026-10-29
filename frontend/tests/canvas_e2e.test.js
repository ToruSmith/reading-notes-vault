// 畫布端對端測試：真實 Chromium ＋ 真實的 build 後 index.html ＋ 真實的後端邏輯（Core.gs 跑在假儲存層上）。
// 驗證介面行為、權限、效能。無法驗證：真實 Drive／Apps Script iframe 環境、真實觸控裝置。
const { chromium } = require('playwright');
const vm = require('vm'),
  fs = require('fs'),
  path = require('path'),
  assert = require('assert');
const makeStore = require('../../backend/tests/fake_store');
const CL = require('../canvaslogic.js'),
  gen = require('./gen_canvas.js');

const BE = path.join(__dirname, '..', '..', 'backend');
const ctx = vm.createContext({ console, Logger: { log() {} } });
['Yaml.gs', 'Svg.gs', 'Core.gs', 'Sync.gs', 'Code.gs', 'Store.gs'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(BE, f), 'utf8'), ctx, { filename: f })
);
const handle = vm.runInContext('handle_', ctx);
const OWNER = { isOwner: true, active: 'me@gmail.com' },
  VISITOR = { isOwner: false, active: '' };
const J = o => JSON.parse(JSON.stringify(o));

const store = makeStore();
store.saveTopic({ id: 'big', title: '大畫布', category: '測試', defaultPublic: false });
store.saveTopic({ id: 'small', title: '小畫布', category: '測試', defaultPublic: true });
store.saveTopic({ id: 'secret', title: '私人主題', category: '測試', defaultPublic: false });
const fm = (id, title, topic, pub, body) =>
  '---\nid: ' +
  id +
  '\ntitle: ' +
  title +
  '\ntopic: ' +
  topic +
  '\ndate: 2026-10-22\n' +
  (pub === undefined ? '' : 'public: ' + pub + '\n') +
  '---\n' +
  body;
const saveNote = (id, ...a) => {
  const r = J(handle('saveNote', { id, text: fm(id, ...a) }, OWNER, 'RUN', store));
  assert.ok(r.ok, JSON.stringify(r));
};
saveNote('20261022-s001', '公開筆記甲', 'small', true, '# 甲\n內容甲 **粗體**');
saveNote('20261022-s002', '私人筆記乙', 'small', false, 'SECRET-乙');
const bigFiles = [];
for (let i = 0; i < 20; i++) {
  const id = '20261023-b' + String(i).padStart(3, '0');
  saveNote(id, '大畫布筆記 ' + i, 'big', undefined, '筆記內容 ' + i + '\n\n- 要點');
  bigFiles.push(id);
}

const bigBoard = gen({ files: bigFiles });
assert.ok(J(handle('saveBoard', { topic: 'big', board: bigBoard }, OWNER, 'RUN', store)).ok);
const smallBoard = {
  'x-board': { keep: true },
  futureTop: 1,
  nodes: [
    { id: 'G', type: 'group', label: '群組G', x: 0, y: 0, width: 500, height: 360, color: '4' },
    {
      id: 'A',
      type: 'text',
      text: '卡片A',
      x: 40,
      y: 60,
      width: 200,
      height: 100,
      'x-parent': 'G',
      'x-keep': 'yes',
      weird: { a: [1] }
    },
    { id: 'B', type: 'text', text: '卡片B', x: 700, y: 60, width: 200, height: 100 },
    { id: 'F1', type: 'file', file: 'notes/20261022-s001.md', x: 700, y: 220, width: 260, height: 160 },
    { id: 'F2', type: 'file', file: 'notes/20261022-s002.md', x: 700, y: 420, width: 260, height: 160 },
    {
      id: 'Y',
      type: 'link',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      x: 1050,
      y: 60,
      width: 400,
      height: 225
    }
  ],
  edges: [
    { id: 'eAB', fromNode: 'A', toNode: 'B', label: '關聯', 'x-style': 'dashed', futureEdge: 1 },
    { id: 'eAF2', fromNode: 'A', toNode: 'F2' }
  ]
};
assert.ok(J(handle('saveBoard', { topic: 'small', board: smallBoard }, OWNER, 'RUN', store)).ok);

const cvItem = async (p, menu, item) => {
  const b = p.locator('.cv-bar .cv-mbtn', { hasText: menu }).first();
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
  await p.locator('.cv-mlist:not([hidden]) .cv-mi', { hasText: item }).first().click();
}; // 工具列下拉選單：開選單再點項目
let n = 0;
const t = async (name, fn) => {
  await fn();
  n++;
  console.log('通過  ' + name);
};
const boardOnServer = topic => {
  const f = store.findFileByName('boards', topic + '.canvas.json');
  return JSON.parse(store.readText(f.fileId));
};

async function newPage(browser, who) {
  const page = await (
    await browser.newContext({
      locale: 'zh-TW',
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true
    })
  ).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.route(/^https?:\/\/(?!localhost|127\.)/, r => r.abort()); // 外部網路一律阻擋：驗證不依賴也不洩漏任何外部請求
  await page.addInitScript(() => {
    try {
      localStorage.setItem('vault-editmode', '1');
      localStorage.setItem('vault-shelfmini', '0');
    } catch (e) {}
  }); // 這些測試在「編輯模式」下跑
  await page.addInitScript(() => {
    try {
      localStorage.setItem('vault-cvzoomclick', '0');
    } catch (e) {}
  }); // 舊測試依賴「單擊只選取」，關閉單擊放大
  await page.exposeFunction('__api', (a, p) => JSON.stringify(handle(a, JSON.parse(p), who, 'RUN', store)));
  await page.addInitScript(() => {
    const make = (ok, ng) => ({
      withSuccessHandler: f => make(f, ng),
      withFailureHandler: f => make(ok, f),
      api: (a, p) => {
        window
          .__api(a, JSON.stringify(p || {}))
          .then(r => ok && ok(JSON.parse(r)))
          .catch(e => ng && ng(e));
      }
    });
    window.google = { script: { run: make(null, null) } };
  });
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'index.html'));
  await page.waitForFunction(
    () => document.getElementById('who') && document.getElementById('who').textContent !== '載入中…'
  );
  page.errors = errors;
  return page;
}
const openCanvas = async (page, title) => {
  await page.locator('#shelfBody button.pill', { hasText: title }).first().click();
  await page.getByRole('button', { name: '開啟畫布' }).click();
  await page.waitForSelector('.cv-view');
  await page.waitForFunction(
    () => document.querySelectorAll('.cv-node').length > 0 || document.querySelector('.cv-hint')?.textContent
  );
};
const state = page =>
  page.evaluate(() => {
    const C = VaultUI.canvasState();
    return JSON.parse(
      JSON.stringify({
        board: C.board,
        dirty: C.dirty,
        sel: C.sel,
        selEdge: C.selEdge,
        view: C.view,
        status: C.status
      })
    );
  });
const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
const settle = page =>
  page.evaluate(
    () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))))
  );
const box = async (page, id) => {
  const b = await page.locator('.cv-node[data-id="' + id + '"]').boundingBox();
  assert.ok(b, '找不到卡片 ' + id);
  return b;
};
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  try {
    /* ═════ 擁有者：小畫布互動 ═════ */
    const o = await newPage(browser, OWNER);
    await t('擁有者：書櫃選主題後出現「開啟畫布」，打開後顯示卡片、群組、連線與小地圖', async () => {
      await openCanvas(o, '小畫布');
      assert.ok(await o.locator('.cv-node[data-id="A"]').count());
      assert.ok(await o.locator('.cv-node.t-group').count());
      assert.ok(await o.locator('.cv-mini').count());
      assert.ok((await o.locator('.cv-e').count()) >= 2);
      assert.ok((await o.locator('.cv-ttl', { hasText: '公開筆記甲' }).count()) === 1);
      await o
        .waitForFunction(
          () => document.querySelector('.cv-node[data-id="F1"] .cv-body')?.textContent.includes('內容甲'),
          null,
          { timeout: 5000 }
        )
        .catch(async e => {
          await o.screenshot({ path: path.join(SHOTS, 'debug.png') });
          throw e;
        });
      await o.screenshot({ path: path.join(SHOTS, '1_owner_small.png') });
    });
    await t('筆記卡片內顯示 Markdown；缺少的筆記顯示「找不到」而不是壞掉', async () => {
      const html = await o.locator('.cv-node[data-id="F1"] .cv-body').innerHTML();
      assert.ok(/<strong>粗體<\/strong>/.test(html));
    });
    await t('拖卡片 B 進群組：放開後 x-parent 才更新；拖出後脫離', async () => {
      const g = await box(o, 'G'),
        b = await box(o, 'B');
      await o.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await o.mouse.down();
      await o.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + 100, { steps: 8 });
      assert.strictEqual(
        (await state(o)).board.nodes.find(x => x.id === 'B')['x-parent'],
        undefined,
        '放開前不改歸屬'
      );
      await o.mouse.up();
      await settle(o);
      let s = await state(o);
      assert.strictEqual(s.board.nodes.find(x => x.id === 'B')['x-parent'], 'G');
      assert.ok(s.dirty);
      const b2 = await box(o, 'B');
      await o.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
      await o.mouse.down();
      await o.mouse.move(b2.x + 420, b2.y + 40, { steps: 8 });
      await o.mouse.up();
      await settle(o);
      s = await state(o);
      if ('x-parent' in s.board.nodes.find(x => x.id === 'B'))
        console.log(
          'DEBUG',
          JSON.stringify(s.board.nodes.filter(x => x.id === 'B' || x.id === 'G')),
          JSON.stringify(s.view),
          JSON.stringify(b2)
        );
      assert.ok(!('x-parent' in s.board.nodes.find(x => x.id === 'B')), '拖出後不留 x-parent');
    });
    await t('拖群組：成員（A）一起移動，相對位置不變', async () => {
      const before = (await state(o)).board.nodes,
        a0 = before.find(x => x.id === 'A'),
        g0 = before.find(x => x.id === 'G');
      const lab = await o.locator('.cv-node[data-id="G"] .cv-glabel').boundingBox();
      await o.mouse.move(lab.x + 20, lab.y + 8);
      await o.mouse.down();
      await o.mouse.move(lab.x + 120, lab.y + 78, { steps: 6 });
      await o.mouse.up();
      await settle(o);
      const after = (await state(o)).board.nodes,
        a1 = after.find(x => x.id === 'A'),
        g1 = after.find(x => x.id === 'G');
      assert.ok(g1.x !== g0.x || g1.y !== g0.y);
      assert.strictEqual(a1.x - g1.x, a0.x - g0.x);
      assert.strictEqual(a1.y - g1.y, a0.y - g0.y);
    });
    await t('復原／重做（鍵盤）：連續復原回到原狀，重做再套回', async () => {
      const ds = (await state(o)).board.nodes.find(x => x.id === 'G').x;
      await o.locator('.cv-view').focus();
      await o.keyboard.press('Control+z');
      await settle(o);
      await o.keyboard.press('Control+z');
      await settle(o);
      const back = (await state(o)).board.nodes.find(x => x.id === 'G').x;
      assert.notStrictEqual(back, ds);
      await o.keyboard.press('Control+y');
      await o.keyboard.press('Control+y');
      await settle(o);
      assert.strictEqual((await state(o)).board.nodes.find(x => x.id === 'G').x, ds);
    });
    await t('調整大小：拖右下角方塊；新增文字卡片（雙擊空白）並在屬性欄輸入文字', async () => {
      await o.locator('.cv-node[data-id="B"]').click({ position: { x: 30, y: 30 } });
      const bb = await box(o, 'B');
      const h = await o.locator('.cv-node[data-id="B"] > .cv-h').boundingBox();
      const w0 = (await state(o)).board.nodes.find(x => x.id === 'B').width;
      await o.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
      await o.mouse.down();
      await o.mouse.move(h.x + 120, h.y + 80, { steps: 6 });
      await o.mouse.up();
      await settle(o);
      assert.ok((await state(o)).board.nodes.find(x => x.id === 'B').width > w0);
      const view = await o.locator('.cv-view').boundingBox();
      const cnt0 = (await state(o)).board.nodes.length;
      await o.mouse.dblclick(view.x + 120, view.y + view.height - 120);
      await settle(o);
      assert.strictEqual((await state(o)).board.nodes.length, cnt0, '雙擊空白處不應新增卡片');
      await cvItem(o, '＋ 新增', '文字卡片');
      await settle(o);
      const ta = o.locator('.cv-insp textarea');
      await ta.fill('## 新卡片\n*由按鈕建立*');
      await settle(o);
      const nodes = (await state(o)).board.nodes;
      const created = nodes[nodes.length - 1];
      assert.strictEqual(created.type, 'text');
      assert.ok(created.text.includes('由按鈕建立'));
      assert.ok(await o.locator('.cv-node[data-id="' + created.id + '"] .cv-body em').count());
      await o.locator('.cv-view').focus();
      await o.keyboard.press('Delete');
      await settle(o); // 新卡片落在畫面中央會擋住後面的測試，用完刪掉
    });
    await t('建立連線（連線模式依序點兩張卡）並設定名稱、虛線、雙向、顏色', async () => {
      await o.getByRole('button', { name: '連線', exact: true }).click();
      const a = await box(o, 'F1'),
        bb = await box(o, 'B');
      await o.mouse.click(a.x + a.width / 2, a.y + a.height / 2);
      await o.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await settle(o);
      let s = await state(o);
      assert.ok(s.selEdge);
      const eid = s.selEdge;
      const e0 = s.board.edges.find(e => e.id === eid);
      assert.deepStrictEqual([e0.fromEnd, e0.toEnd], ['none', 'arrow']);
      await o.locator('.cv-insp input[aria-label="連線名稱"]').fill('反例');
      await o.locator('.cv-insp select[aria-label="方向"]').selectOption('both');
      await o.locator('.cv-insp select[aria-label="線型"]').selectOption('dashed');
      await o.locator('.cv-insp .cv-s[aria-label="紅"]').click();
      await settle(o);
      const e1 = (await state(o)).board.edges.find(e => e.id === eid);
      assert.deepStrictEqual(
        [e1.label, e1.fromEnd, e1.toEnd, e1['x-style'], e1.color],
        ['反例', 'arrow', 'arrow', 'dashed', '1']
      );
      await o.getByRole('button', { name: '連線', exact: true }).click();
      await o.getByRole('button', { name: '連線', exact: true }).click(); // 開關連線模式不應壞掉
      await o.keyboard.press('Escape');
    });
    await t('框選（Shift 拖曳）選到多張卡片；刪除後連到它們的線一併消失，可復原', async () => {
      const view = await o.locator('.cv-view').boundingBox();
      const before = await state(o);
      await o.keyboard.down('Shift');
      await o.mouse.move(view.x + 3, view.y + 3);
      await o.mouse.down();
      await o.mouse.move(view.x + view.width - 260, view.y + view.height - 20, { steps: 6 });
      await o.mouse.up();
      await o.keyboard.up('Shift');
      await settle(o);
      const s = await state(o);
      assert.ok(Object.keys(s.sel).length >= 3, '框選到 ' + Object.keys(s.sel).length);
      await o.locator('.cv-view').focus();
      await o.keyboard.press('Delete');
      await settle(o);
      const d = await state(o);
      assert.ok(d.board.nodes.length < before.board.nodes.length);
      assert.ok(
        d.board.edges.every(
          e => d.board.nodes.some(x => x.id === e.fromNode) && d.board.nodes.some(x => x.id === e.toNode)
        )
      );
      await o.keyboard.press('Control+z');
      await settle(o);
      assert.strictEqual((await state(o)).board.nodes.length, before.board.nodes.length);
    });
    await t(
      'YouTube：預設只有「載入影片」按鈕（不連外）；按下後才建立 youtube-nocookie 的 iframe',
      async () => {
        assert.strictEqual(await o.locator('iframe').count(), 0);
        await o.locator('.cv-node[data-id="Y"] .cv-play').click({ force: true });
        await settle(o);
        const src = await o.locator('.cv-node[data-id="Y"] iframe').getAttribute('src');
        assert.strictEqual(src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
        assert.ok(
          (await o.locator('.cv-node[data-id="Y"] iframe').getAttribute('sandbox')).includes('allow-scripts')
        );
        assert.ok(
          await o.locator('.cv-node[data-id="Y"] a.cv-ext').count(),
          '一定有「在新分頁開啟」的備援連結'
        );
      }
    );
    await t(
      '群組收合：成員隱藏、顯示「標題（數量）」，連到成員的線改接群組；可連線到群組；展開後還原；寫入 x-collapsed 並可復原',
      async () => {
        await o.locator('.cv-view').focus();
        await o.keyboard.press('0');
        await settle(o);
        await o.evaluate(() => {
          VaultUI.canvasState().view.k < 0.4 && (VaultUI.canvasState().view = { x: 60, y: 120, k: 0.6 });
        });
        await o.keyboard.press('-');
        await o.keyboard.press('+');
        await settle(o);
        assert.ok(await o.locator('.cv-node[data-id="A"]').count(), '收合前 A 可見');
        await o.locator('.cv-node[data-id="G"] .cv-gtoggle').click();
        await settle(o);
        assert.strictEqual(await o.locator('.cv-node[data-id="A"]').count(), 0, '成員被隱藏');
        assert.ok((await o.locator('.cv-node[data-id="G"]').getAttribute('class')).includes('collapsed'));
        assert.ok((await o.locator('.cv-node[data-id="G"] .cv-glabel').textContent()).includes('群組G（1）'));
        assert.ok(await o.locator('.cv-e[data-e="eAF2"]').count(), 'A→F2 的線改接到群組後仍存在');
        assert.strictEqual(
          await o.locator('.cv-e[data-e="eAB"]').count(),
          1,
          'A→B：B 在群組外，線改接成 群組→B'
        );
        let s = await state(o);
        assert.strictEqual(s.board.nodes.find(x => x.id === 'G')['x-collapsed'], true);
        assert.ok(s.dirty);
        assert.deepStrictEqual(s.board.nodes.find(x => x.id === 'A')['x-parent'], 'G', '收合不改成員關係');
        // 連線到群組：點 F1 再點收合群組
        await o.getByRole('button', { name: '連線', exact: true }).click();
        const f1 = await box(o, 'F1'),
          g = await box(o, 'G');
        await o.mouse.click(f1.x + f1.width / 2, f1.y + f1.height / 2);
        await o.mouse.click(g.x + g.width * 0.6, g.y + g.height / 2);
        await settle(o);
        s = await state(o);
        const ne = s.board.edges.find(e => e.fromNode === 'F1' && e.toNode === 'G');
        assert.ok(ne, '建立了連到群組的線');
        assert.ok(await o.locator('.cv-e[data-e="' + ne.id + '"]').count());
        await o.locator('.cv-node[data-id="G"] .cv-gtoggle').click();
        await settle(o); // 展開
        assert.ok(await o.locator('.cv-node[data-id="A"]').count(), '展開後成員回來');
        assert.ok(await o.locator('.cv-e[data-e="' + ne.id + '"]').count(), '展開後到群組的線仍在');
        assert.strictEqual((await state(o)).board.nodes.find(x => x.id === 'G')['x-collapsed'], false);
        await o.keyboard.press('Escape');
        await o.locator('.cv-view').focus();
        await o.keyboard.press('Control+z');
        await settle(o);
        await o.keyboard.press('Control+z');
        await settle(o);
        await o.keyboard.press('Control+z');
        await settle(o);
        assert.ok(!(await state(o)).board.edges.some(e => e.id === ne.id), '復原可移除新連線');
        await o.screenshot({ path: path.join(SHOTS, '7_collapse.png') });
      }
    );
    await t(
      '存檔：寫入雲端；A 的 x-、未知欄位與頂層未知欄位原樣保留；座標為整數；通過 JSON Canvas 檢查',
      async () => {
        await o.getByRole('button', { name: /^儲存/ }).click();
        await o.waitForFunction(() => VaultUI.canvasState().dirty === false);
        await settle(o);
        const srv = boardOnServer('small');
        const A = srv.nodes.find(x => x.id === 'A');
        assert.strictEqual(A['x-keep'], 'yes');
        assert.deepStrictEqual(A.weird, { a: [1] });
        assert.strictEqual(A['x-parent'], 'G');
        assert.deepStrictEqual(srv['x-board'], { keep: true });
        assert.strictEqual(srv.futureTop, 1);
        assert.strictEqual(srv.edges.find(e => e.id === 'eAB').futureEdge, 1);
        assert.deepStrictEqual(CL.validateCanvas(srv), []);
      }
    );
    await t(
      '衝突：別處先改了雲端 → 儲存不會靜默覆蓋，出現合併／覆蓋／另存選項；合併後兩邊的修改都在',
      async () => {
        const f = store.findFileByName('boards', 'small.canvas.json');
        const cur = JSON.parse(store.readText(f.fileId));
        cur.nodes.push({
          id: 'THEIRS',
          type: 'text',
          text: '別處新增',
          x: 2000,
          y: 0,
          width: 200,
          height: 100
        });
        assert.ok(
          J(
            handle(
              'saveBoard',
              { topic: 'small', board: cur, baseUpdatedAt: f.updatedAt },
              OWNER,
              'RUN',
              store
            )
          ).ok
        );
        await o.locator('.cv-view').focus();
        await o.keyboard.press('Control+z');
        await settle(o);
        await o.keyboard.press('Control+y');
        await settle(o); // 製造一次本機修改
        const a = await box(o, 'A');
        await o.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await o.mouse.down();
        await o.mouse.move(a.x + a.width / 2 + 30, a.y + a.height / 2 + 30, { steps: 4 });
        await o.mouse.up();
        await settle(o);
        await o.getByRole('button', { name: /^儲存/ }).click();
        await o.waitForSelector('.cv-panel[role="alert"]');
        for (const label of ['合併', '用我的覆蓋', '另存我的版本', '放棄我的修改，載入雲端版'])
          assert.ok(await o.getByRole('button', { name: label }).count(), label);
        assert.ok(!boardOnServer('small').nodes.every(x => x.id !== 'THEIRS') === true, '雲端的內容沒被動到');
        await o.screenshot({ path: path.join(SHOTS, '2_conflict.png') });
        await o.getByRole('button', { name: '合併', exact: true }).click();
        await settle(o);
        const ids = (await state(o)).board.nodes.map(x => x.id);
        assert.ok(ids.includes('THEIRS') && ids.includes('A'));
        await o.getByRole('button', { name: /^儲存/ }).click();
        await o.waitForFunction(() => VaultUI.canvasState().dirty === false);
        assert.ok(boardOnServer('small').nodes.some(x => x.id === 'THEIRS'));
      }
    );
    await t('匯出：下載的檔案符合 JSON Canvas、保留所有自訂欄位（Obsidian 相容檢查）', async () => {
      const [dl] = await Promise.all([o.waitForEvent('download'), cvItem(o, '更多', '匯出')]);
      assert.strictEqual(dl.suggestedFilename(), 'small.canvas');
      const text = fs.readFileSync(await dl.path(), 'utf8'),
        b = JSON.parse(text);
      assert.deepStrictEqual(CL.validateCanvas(b), []);
      assert.strictEqual(b.nodes.find(x => x.id === 'A')['x-keep'], 'yes');
      assert.strictEqual(b.futureTop, 1);
      fs.writeFileSync(path.join(SHOTS, 'small_export.canvas'), text);
    });
    await t('匯入：用 .canvas 檔取代畫布（可復原），未知欄位保留、格式提醒不擋人', async () => {
      const f = path.join(SHOTS, 'import_test.canvas');
      fs.writeFileSync(
        f,
        JSON.stringify({
          unknownTop: 'x',
          nodes: [
            { id: 'i1', type: 'text', text: '匯入的', x: 1.5, y: 2, width: 100, height: 50, 'x-z': 1 },
            { id: 'i2', type: 'text', text: 'p', x: 0, y: 0, width: 10, height: 10, 'x-parent': 'nope' }
          ],
          edges: [{ id: 'ie', fromNode: 'i1', toNode: 'i2' }]
        })
      );
      o.once('dialog', d => d.accept());
      await o.locator('.cv-file').setInputFiles(f);
      await settle(o);
      const s = await state(o);
      assert.strictEqual(s.board.nodes.length, 2);
      assert.strictEqual(s.board.unknownTop, 'x');
      assert.ok(!('x-parent' in s.board.nodes.find(x => x.id === 'i2')), '壞掉的 x-parent 被修復');
      await o.keyboard.press('Control+z');
      await settle(o);
      assert.ok((await state(o)).board.nodes.length > 2);
    });
    await t('縮得很小時新增 YouTube 連結卡：自動拉近到 100%，並出現「載入影片」按鈕', async () => {
      await o.locator('.cv-view').focus();
      await o.keyboard.press('0');
      await settle(o);
      await o.evaluate(() => {
        VaultUI.canvasState().view = { x: 100, y: 100, k: 0.14 };
      });
      await o.keyboard.press('-');
      await settle(o);
      assert.ok((await state(o)).view.k < 0.4);
      await cvItem(o, '＋ 新增', '連結卡片');
      await o.locator('.cv-panel input[type=url]').fill('https://www.youtube.com/watch?v=d7qmp6gjpiU');
      await o.getByRole('button', { name: '加入', exact: true }).click();
      await settle(o);
      assert.strictEqual((await state(o)).view.k, 1);
      await o.waitForSelector('.cv-node.sel .cv-play', { timeout: 3000 });
    });
    await t('離開時有未儲存修改會先詢問（取消則留在畫布）', async () => {
      await o.locator('.cv-view').focus();
      await o.keyboard.press('0');
      await settle(o);
      await o.locator('.cv-node[data-id="B"]').click({ force: true });
      await o.locator('.cv-insp .cv-s[aria-label="綠"]').click();
      await settle(o);
      assert.ok((await state(o)).dirty);
      let asked = false;
      o.once('dialog', d => {
        asked = true;
        d.dismiss();
      });
      await o.getByRole('button', { name: '← 回到列表' }).click();
      await settle(o);
      assert.ok(asked);
      assert.ok(await o.locator('.cv-view').count(), '取消後仍在畫布');
      o.once('dialog', d => d.accept());
      await o.getByRole('button', { name: '← 回到列表' }).click();
      await settle(o);
      assert.strictEqual(await o.locator('.cv-view').count(), 0);
    });
    await t('雙擊筆記卡開啟筆記，返回後畫布狀態還在', async () => {
      await openCanvas(o, '小畫布');
      await o.waitForFunction(() => document.querySelector('.cv-node[data-id="F1"]'));
      await o.locator('.cv-node[data-id="F1"]').dblclick();
      await o.waitForSelector('.md');
      assert.ok((await o.locator('h2').first().textContent()).includes('公開筆記甲'));
      await o.getByRole('button', { name: '← 回到列表' }).click();
      await o.waitForSelector('.cv-view');
      await o.waitForSelector('.cv-node[data-id="F1"]', { timeout: 5000 });
    });
    assert.deepStrictEqual(o.errors, [], '頁面不應有錯誤：' + o.errors.join(' | '));

    /* ═════ 擁有者：300 張卡片效能 ═════ */
    const p = await newPage(browser, OWNER);
    await t('300 張卡片：載入、符合視窗（LOD）只畫標題方塊；放大後只建立視窗內的卡片 DOM', async () => {
      const t0 = Date.now();
      await openCanvas(p, '大畫布');
      await settle(p);
      const total = (await state(p)).board.nodes.length;
      assert.ok(total >= 300, '節點數 ' + total);
      const loadMs = Date.now() - t0;
      const info = await p.evaluate(() => ({
        lod: document.querySelector('.cv-world').classList.contains('lod'),
        dom: document.querySelectorAll('.cv-node').length,
        k: VaultUI.canvasState().view.k
      }));
      console.log(
        '      節點 ' +
          total +
          '（卡片 ' +
          (total - 15) +
          '）；載入到可操作 ' +
          loadMs +
          ' ms；符合視窗 k=' +
          info.k.toFixed(2) +
          '，LOD=' +
          info.lod +
          '，DOM 節點 ' +
          info.dom
      );
      assert.ok(info.lod);
      await p.screenshot({ path: path.join(SHOTS, '3_big_fit_lod.png') });
      await p.locator('.cv-view').focus();
      await p.keyboard.press('Escape');
      await p.evaluate(() => {
        const C = VaultUI.canvasState();
        C.view = { x: -600 * 1, y: -100, k: 1 };
      });
      await p.locator('.cv-view').hover();
      await p.mouse.wheel(0, 0);
      await p.evaluate(() =>
        document.querySelector('.cv-view').dispatchEvent(
          new WheelEvent('wheel', {
            deltaX: 1,
            deltaY: 0,
            clientX: 10,
            clientY: 10,
            bubbles: true,
            cancelable: true
          })
        )
      );
      await settle(p);
      const z = await p.evaluate(() => ({
        lod: document.querySelector('.cv-world').classList.contains('lod'),
        dom: document.querySelectorAll('.cv-node').length,
        bodies: document.querySelectorAll('.cv-body').length
      }));
      console.log('      放大到 100%：LOD=' + z.lod + '，DOM 節點 ' + z.dom + '（總共 ' + total + '）');
      assert.ok(!z.lod);
      assert.ok(z.dom < total * 0.5, '只應建立視窗內的卡片，實際 ' + z.dom);
      await p.screenshot({ path: path.join(SHOTS, '4_big_100.png') });
    });
    await t(
      '300 張卡片：連續平移、縮放 200 次，每次繪製耗時 p95 與最大值在預算內；沒有 5 秒長任務',
      async () => {
        await p.evaluate(() => {
          const C = VaultUI.canvasState();
          C.pm = [];
          window.__long = 0;
          new PerformanceObserver(l =>
            l.getEntries().forEach(e => {
              window.__long = Math.max(window.__long, e.duration);
            })
          ).observe({ entryTypes: ['longtask'] });
        });
        const res = await p.evaluate(async () => {
          const view = document.querySelector('.cv-view'),
            r = view.getBoundingClientRect(),
            fr = () => new Promise(res => requestAnimationFrame(res));
          const t0 = performance.now();
          let frames = 0;
          for (let i = 0; i < 100; i++) {
            view.dispatchEvent(
              new WheelEvent('wheel', {
                deltaX: 40,
                deltaY: 25,
                clientX: r.left + 300,
                clientY: r.top + 300,
                bubbles: true,
                cancelable: true
              })
            );
            await fr();
            frames++;
          }
          for (let i = 0; i < 100; i++) {
            view.dispatchEvent(
              new WheelEvent('wheel', {
                deltaY: i < 50 ? -4 : 4,
                ctrlKey: true,
                clientX: r.left + 400,
                clientY: r.top + 300,
                bubbles: true,
                cancelable: true
              })
            );
            await fr();
            frames++;
          }
          const dt = performance.now() - t0;
          const pm = VaultUI.canvasState()
            .pm.slice()
            .sort((a, b) => a - b);
          return {
            frames,
            fps: Math.round(frames / (dt / 1000)),
            p50: pm[Math.floor(pm.length * 0.5)],
            p95: pm[Math.floor(pm.length * 0.95)],
            max: pm[pm.length - 1],
            long: window.__long,
            k: VaultUI.canvasState().view.k
          };
        });
        console.log(
          '      平移＋縮放 ' +
            res.frames +
            ' 幀：實際 ' +
            res.fps +
            ' fps；每次繪製（JS）中位數 ' +
            res.p50.toFixed(1) +
            ' ms、p95 ' +
            res.p95.toFixed(1) +
            ' ms、最大 ' +
            res.max.toFixed(1) +
            ' ms；最長任務 ' +
            Math.round(res.long) +
            ' ms'
        );
        assert.ok(res.p95 < 16, 'p95 繪製 ' + res.p95);
        assert.ok(res.long < 200, '長任務 ' + res.long);
      }
    );
    await t(
      '300 張卡片：拖曳一張卡片（連線即時跟隨）與框選全部都能完成，存檔後 x-、未知欄位逐項保留',
      async () => {
        await p.locator('.cv-view').focus();
        await p.keyboard.press('0');
        await settle(p);
        await p.evaluate(() => {
          const C = VaultUI.canvasState();
          C.view = { x: 40 - 20, y: 80, k: 0.8 };
        });
        await p.mouse.wheel(0, 0);
        await p.evaluate(() =>
          document.querySelector('.cv-view').dispatchEvent(
            new WheelEvent('wheel', {
              deltaX: 1,
              deltaY: 0,
              clientX: 5,
              clientY: 5,
              bubbles: true,
              cancelable: true
            })
          )
        );
        await settle(p);
        const id = await p.evaluate(() => {
          const C = VaultUI.canvasState();
          const el = [...document.querySelectorAll('.cv-node.t-text')].find(
            e =>
              e.getBoundingClientRect().left > 200 &&
              e.getBoundingClientRect().top > 150 &&
              e.getBoundingClientRect().right < 1000 &&
              e.getBoundingClientRect().bottom < 800
          );
          return el.getAttribute('data-id');
        });
        const bb = await box(p, id);
        await p.mouse.move(bb.x + bb.width / 2, bb.y + 20);
        await p.mouse.down();
        await p.mouse.move(bb.x + bb.width / 2 + 60, bb.y + 60, { steps: 10 });
        await p.mouse.up();
        await settle(p);
        assert.ok((await state(p)).dirty);
        await p.getByRole('button', { name: /^儲存/ }).click();
        await p.waitForFunction(() => VaultUI.canvasState().dirty === false, null, { timeout: 15000 });
        const srv = boardOnServer('big'),
          src = bigBoard;
        assert.strictEqual(srv.nodes.length, src.nodes.length);
        assert.strictEqual(srv.edges.length, src.edges.length);
        assert.deepStrictEqual(srv.futureTopLevel, [1, 2, 3]);
        assert.deepStrictEqual(srv['x-board'], src['x-board']);
        const sm = CL.byId(srv.nodes);
        let checked = 0;
        src.nodes.forEach(s0 => {
          Object.keys(s0).forEach(k => {
            if (k.startsWith('x-') || k === 'futureField') {
              if (k === 'x-parent' && s0.id === id) return;
              assert.deepStrictEqual(sm[s0.id][k], s0[k], s0.id + '.' + k);
              checked++;
            }
          });
        });
        src.edges.forEach(e => {
          const se = srv.edges.find(x => x.id === e.id);
          ['futureEdgeField', 'x-style', 'color', 'label'].forEach(k => {
            if (k in e) {
              assert.deepStrictEqual(se[k], e[k], e.id + '.' + k);
              checked++;
            }
          });
        });
        console.log('      存檔後逐項比對 ' + checked + ' 個自訂／未知欄位，全部相同');
        assert.deepStrictEqual(CL.validateCanvas(srv), []);
      }
    );
    assert.deepStrictEqual(p.errors, [], '頁面不應有錯誤：' + p.errors.join(' | '));

    /* ═════ 訪客 ═════ */
    const v = await newPage(browser, VISITOR);
    await t(
      '訪客：只能開公開主題的畫布，沒有任何編輯工具；私人筆記的卡片整張不見（連標題都沒有）',
      async () => {
        assert.strictEqual(
          await v.locator('#shelfBody button.pill', { hasText: '大畫布' }).count(),
          0,
          '私人主題對訪客不存在'
        );
        await openCanvas(v, '小畫布');
        await settle(v);
        const html = await v.content();
        assert.ok(!html.includes('私人筆記乙'));
        assert.ok(!html.includes('SECRET-乙'));
        assert.ok(!html.includes('20261022-s002'));
        assert.ok(await v.locator('.cv-node[data-id="F1"]').count());
        assert.strictEqual(await v.locator('.cv-node[data-id="F2"]').count(), 0, '私人卡片被過濾');
        for (const label of ['＋文字', '＋筆記', '連線', '儲存', '匯入', '刪除'])
          assert.strictEqual(await v.getByRole('button', { name: label, exact: true }).count(), 0, label);
        assert.strictEqual(await v.locator('.cv-insp').count(), 0);
        const s = await state(v);
        assert.ok(!s.board.edges.some(e => e.toNode === 'F2'), '連到私人卡片的線也被過濾');
        await v.screenshot({ path: path.join(SHOTS, '5_visitor.png') });
      }
    );
    await t('訪客：拖曳只會平移；雙擊空白處、按 Delete、Ctrl+S 都不會改任何東西', async () => {
      const before = JSON.stringify((await state(v)).board);
      const view = await v.locator('.cv-view').boundingBox();
      await v.mouse.dblclick(view.x + 100, view.y + view.height - 100);
      await v.locator('.cv-view').focus();
      await v.keyboard.press('Delete');
      await v.keyboard.press('Control+s');
      const a = await box(v, 'A');
      await v.mouse.move(a.x + 50, a.y + 30);
      await v.mouse.down();
      await v.mouse.move(a.x + 200, a.y + 130, { steps: 5 });
      await v.mouse.up();
      await settle(v);
      const s = await state(v);
      assert.strictEqual(JSON.stringify(s.board), before);
      assert.ok(!s.dirty);
    });
    await t('訪客：可暫時收合／展開群組（只改畫面，不算修改、不會存檔）', async () => {
      await v.locator('.cv-node[data-id="G"] .cv-gtoggle').click();
      await settle(v);
      assert.strictEqual(await v.locator('.cv-node[data-id="A"]').count(), 0);
      assert.ok(!(await state(v)).dirty);
      assert.notStrictEqual(boardOnServer('small').nodes.find(x => x.id === 'G')['x-collapsed'], true);
      await v.locator('.cv-node[data-id="G"] .cv-gtoggle').click();
      await settle(v);
      assert.ok(await v.locator('.cv-node[data-id="A"]').count());
    });
    await t('訪客：即使硬呼叫 saveBoard 也被後端拒絕（權限在後端，不在介面）', async () => {
      const r = await v.evaluate(
        () =>
          new Promise(res =>
            google.script.run
              .withSuccessHandler(res)
              .withFailureHandler(e => res({ err: e.message }))
              .api('saveBoard', { topic: 'small', board: { nodes: [], edges: [] } })
          )
      );
      assert.strictEqual(r.ok, false);
      assert.ok(boardOnServer('small').nodes.length > 2);
    });
    assert.deepStrictEqual(v.errors, [], '頁面不應有錯誤：' + v.errors.join(' | '));

    /* ═════ 手機寬度 ═════ */
    const ctxm = await browser.newContext({
      locale: 'zh-TW',
      viewport: { width: 390, height: 800 },
      hasTouch: true,
      isMobile: true
    });
    const m = await ctxm.newPage();
    const merr = [];
    m.on('pageerror', e => merr.push(e.message));
    await m.route(/^https?:\/\/(?!localhost|127\.)/, r => r.abort());
    await m.exposeFunction('__api', (a, p) => JSON.stringify(handle(a, JSON.parse(p), OWNER, 'RUN', store)));
    await m.addInitScript(() => {
      const make = (ok, ng) => ({
        withSuccessHandler: f => make(f, ng),
        withFailureHandler: f => make(ok, f),
        api: (a, p) => {
          window
            .__api(a, JSON.stringify(p || {}))
            .then(r => ok && ok(JSON.parse(r)))
            .catch(e => ng && ng(e));
        }
      });
      window.google = { script: { run: make(null, null) } };
    });
    await m.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'index.html'));
    await m.waitForFunction(() => document.getElementById('who').textContent !== '載入中…');
    await t(
      '手機（擁有者）：畫布唯讀（canvasTouchEdit=false）— 沒有編輯工具、可平移縮放；沒有橫向捲動',
      async () => {
        await m.locator('#shelf summary').click();
        await m.locator('#shelfBody button.pill', { hasText: '小畫布' }).first().click();
        await m.getByRole('button', { name: '開啟畫布' }).click();
        await m.waitForSelector('.cv-view');
        await settle(m);
        for (const label of ['＋文字', '＋筆記', '連線', '儲存', '匯入'])
          assert.strictEqual(await m.getByRole('button', { name: label, exact: true }).count(), 0, label);
        assert.ok(await m.getByRole('button', { name: '符合視窗' }).count());
        const sw = await m.evaluate(() => document.documentElement.scrollWidth);
        assert.ok(sw <= 392, '橫向捲動寬度 ' + sw);
        const k0 = (await state(m)).view.k;
        await m.getByRole('button', { name: '放大', exact: true }).click();
        await settle(m);
        assert.ok((await state(m)).view.k > k0);
        await m.screenshot({ path: path.join(SHOTS, '6_mobile.png') });
      }
    );
    await t(
      '手機：雙指張開／捏合縮放、單指拖曳平移，縮放比例永遠是有效數字（不會 NaN），卡片不會消失',
      async () => {
        const cdp = await ctxm.newCDPSession(m);
        const v0 = await m.locator('.cv-view').boundingBox();
        const touch = (type, pts) =>
          cdp.send('Input.dispatchTouchEvent', {
            type,
            touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i + 1 }))
          });
        const cx = v0.x + v0.width / 2,
          cy = v0.y + v0.height / 2;
        const bad = async () =>
          m.evaluate(() => {
            const v = VaultUI.canvasState().view;
            return (
              !(isFinite(v.x) && isFinite(v.y) && isFinite(v.k) && v.k > 0) ||
              /NaN/.test(document.querySelector('.cv-zoom').textContent)
            );
          });
        await touch('touchStart', [
          [cx - 40, cy],
          [cx + 40, cy]
        ]);
        for (let i = 1; i <= 8; i++)
          await touch('touchMove', [
            [cx - 40 - i * 12, cy],
            [cx + 40 + i * 12, cy]
          ]);
        await touch('touchEnd', []);
        await settle(m);
        const z1 = (await state(m)).view.k;
        assert.ok(!(await bad()), '張開後出現 NaN');
        assert.ok(z1 > 0.9 * 0.5, 'k=' + z1);
        const k1 = z1;
        await touch('touchStart', [
          [cx - 140, cy],
          [cx + 140, cy]
        ]);
        for (let i = 1; i <= 8; i++)
          await touch('touchMove', [
            [cx - 140 + i * 12, cy],
            [cx + 140 - i * 12, cy]
          ]);
        await touch('touchEnd', []);
        await settle(m);
        assert.ok(!(await bad()), '捏合後出現 NaN');
        assert.ok((await state(m)).view.k < k1, '捏合應縮小');
        const before = (await state(m)).view;
        await touch('touchStart', [[cx, cy]]);
        for (let i = 1; i <= 6; i++) await touch('touchMove', [[cx + i * 10, cy + i * 6]]);
        await touch('touchEnd', []);
        await settle(m);
        const after = (await state(m)).view;
        assert.ok(
          after.x > before.x && after.y > before.y && Math.abs(after.k - before.k) < 1e-9,
          '單指拖曳應平移'
        );
        assert.ok(!(await bad()));
        assert.ok((await m.locator('.cv-node').count()) > 0, '卡片不應消失');
        assert.ok(await m.evaluate(() => /^\d+%$/.test(document.querySelector('.cv-zoom').textContent)));
      }
    );
    assert.deepStrictEqual(merr, [], '手機頁面不應有錯誤');
  } finally {
    await browser.close();
  }
  console.log('\n畫布端對端：' + n + ' 項全部通過');
})().catch(e => {
  console.error('\n失敗：', (e && e.stack) || e);
  process.exit(1);
});
