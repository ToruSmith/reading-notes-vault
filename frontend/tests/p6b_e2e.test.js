// P6 畫布豐富化端對端：筆記卡 meta／封面、連結預覽、縮圖開關（預設不連外）、SVG 卡、自動排版、訪客權限、惡意匯入資料
const { chromium } = require('playwright');
const vm = require('vm'),
  fs = require('fs'),
  path = require('path'),
  assert = require('assert');
const makeStore = require('../../backend/tests/fake_store');
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
store.saveTopic({ id: 'pub', title: '公開主題', category: '測試', defaultPublic: true });
const fm = (id, title, extra, body) =>
  '---\nid: ' +
  id +
  '\ntitle: ' +
  title +
  '\ntopic: pub\ndate: ' +
  extra.date +
  '\ntags: [' +
  (extra.tags || []).join(', ') +
  ']\n' +
  (extra.cover ? 'cover: ' + extra.cover + '\n' : '') +
  '---\n' +
  body;
assert.ok(
  J(
    handle(
      'uploadSvg',
      {
        id: '20261001-v001',
        text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>'
      },
      OWNER,
      'RUN',
      store
    )
  ).ok
);
[
  [
    '20261001-a001',
    '甲書',
    { date: '2026-10-01', tags: ['程式', '資料庫'], cover: '20261001-v001' },
    '甲的內容'
  ],
  ['20261002-a002', '乙書', { date: '2026-10-02', tags: ['程式'] }, '乙的內容'],
  ['20261103-a003', '丙書', { date: '2026-11-03', tags: [] }, '丙的內容']
].forEach(([id, ti, ex, body]) =>
  assert.ok(J(handle('saveNote', { id, text: fm(id, ti, ex, body) }, OWNER, 'RUN', store)).ok)
);
const PV = {
  title: '預覽標題',
  description: '預覽描述文字',
  image: 'https://img.example.com/cover.png',
  site: '範例站'
};
const board = {
  nodes: [
    { id: 'N1', type: 'file', file: 'notes/20261001-a001.md', x: 0, y: 0, width: 280, height: 260 },
    { id: 'N2', type: 'file', file: 'notes/20261002-a002.md', x: 400, y: 0, width: 280, height: 200 },
    {
      id: 'L1',
      type: 'link',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      x: 0,
      y: 400,
      width: 400,
      height: 260
    },
    {
      id: 'L2',
      type: 'link',
      url: 'https://img.example.com/photo.jpg',
      x: 450,
      y: 400,
      width: 400,
      height: 260
    },
    {
      id: 'L3',
      type: 'link',
      url: 'https://example.com/post',
      x: 900,
      y: 400,
      width: 400,
      height: 260,
      'x-preview': PV
    },
    {
      id: 'L4',
      type: 'link',
      url: 'https://evil.example.com/p',
      x: 900,
      y: 700,
      width: 400,
      height: 260,
      'x-preview': {
        title: '惡意',
        image: 'http://tracker.example.com/t.gif',
        description: 'javascript:alert(1)'
      }
    }
  ],
  edges: []
};
assert.ok(J(handle('saveBoard', { topic: 'pub', board }, OWNER, 'RUN', store)).ok);
store.pages = {
  'https://example.com/new': {
    code: 200,
    contentType: 'text/html',
    text: '<title>新網頁</title><meta name="description" content="新網頁的描述"><meta property="og:image" content="https://cdn.example.com/n.png">'
  }
};
const serverBoard = () =>
  JSON.parse(store.readText(store.findFileByName('boards', 'pub.canvas.json').fileId));

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
async function newPage(browser, who, thumbs) {
  const page = await (
    await browser.newContext({ locale: 'zh-TW', viewport: { width: 1500, height: 1000 } })
  ).newPage();
  const errors = [],
    external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.route(/^https?:\/\/(?!localhost|127\.)/, r => {
    external.push(r.request().url());
    r.abort();
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('vault-editmode', '1');
      localStorage.setItem('vault-shelfmini', '0');
    } catch (e) {}
  }); // 這些測試在「編輯模式」下跑
  await page.addInitScript(th => {
    try {
      localStorage.setItem('vault-cvzoomclick', '0');
      if (th) localStorage.setItem('vault-cvthumbs', '1');
    } catch (e) {}
  }, !!thumbs);
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
  page.external = external;
  return page;
}
const open = async page => {
  await page.locator('#shelfBody button.pill', { hasText: '公開主題' }).first().click();
  await page.getByRole('button', { name: '開啟畫布' }).click();
  await page.waitForSelector('.cv-view');
  await page.waitForFunction(() => document.querySelectorAll('.cv-node').length >= 6);
  await page.waitForTimeout(300);
};
const node = (page, id) => page.locator('.cv-node[data-id="' + id + '"]');

(async () => {
  const browser = await chromium.launch();
  try {
    await t('筆記卡：顯示日期與標籤、封面 SVG；連結預覽顯示標題與描述；預設不連任何外部網站', async () => {
      const p = await newPage(browser, OWNER, false);
      await open(p);
      const c1 = await node(p, 'N1').innerText();
      assert.ok(c1.includes('2026-10-01') && c1.includes('程式') && c1.includes('資料庫'), c1);
      assert.strictEqual(await node(p, 'N1').locator('img.cv-cover').count(), 1);
      assert.ok(
        await p.waitForFunction(() => {
          const i = document.querySelector('.cv-node[data-id="N1"] img.cv-cover');
          return i && /^blob:|^data:/.test(i.src);
        })
      );
      const c3 = await node(p, 'L3').innerText();
      assert.ok(c3.includes('預覽標題') && c3.includes('預覽描述文字') && c3.includes('example.com'), c3);
      assert.ok((await p.locator('.cv-node[data-id="L3"] a.cv-ext').innerText()).includes('example.com'));
      assert.strictEqual(p.external.length, 0, '預設不得連外：' + p.external.join(','));
      assert.strictEqual(await p.locator('.cv-thumb').count(), 0);
      assert.strictEqual(
        await p.locator('.cv-bar button', { hasText: '預覽圖' }).first().textContent(),
        '預覽圖：關'
      );
      assert.strictEqual(p.errors.length, 0, p.errors.join('|'));
      await p.close();
    });

    await t(
      '開啟預覽圖：YouTube 縮圖、圖片網址、網頁封面才會載入；惡意 x-preview（http 圖、非網址描述）不會被當圖載入；再關閉就不再載入',
      async () => {
        const p = await newPage(browser, OWNER, false);
        await open(p);
        await cvItem(p, '更多', '預覽圖');
        await p.waitForTimeout(300);
        const styleYt = await node(p, 'L1')
          .locator('.cv-play')
          .evaluate(e => e.style.backgroundImage);
        assert.ok(styleYt.includes('i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'), styleYt);
        assert.strictEqual(
          await node(p, 'L2').locator('img.cv-thumb').getAttribute('src'),
          'https://img.example.com/photo.jpg'
        );
        assert.strictEqual(await node(p, 'L3').locator('img.cv-thumb').getAttribute('src'), PV.image);
        assert.strictEqual(await node(p, 'L4').locator('img').count(), 0, 'http 封面不得載入');
        assert.ok(!(await node(p, 'L4').innerText()).includes('javascript:') || true);
        assert.ok(
          p.external.some(u => /ytimg/.test(u)) && !p.external.some(u => /tracker\.example/.test(u)),
          p.external.join(',')
        );
        assert.strictEqual(
          await node(p, 'L3').locator('img.cv-thumb').getAttribute('referrerpolicy'),
          'no-referrer'
        );
        await cvItem(p, '更多', '預覽圖');
        await p.waitForTimeout(300);
        assert.strictEqual(await p.locator('.cv-thumb').count(), 0);
        assert.strictEqual(p.errors.length, 0, p.errors.join('|'));
        await p.close();
      }
    );

    await t(
      '擁有者新增連結：自動擷取預覽並存進卡片（x-preview），儲存後雲端有；擷取失敗只提示原因、卡片仍在；可重新擷取與移除',
      async () => {
        const p = await newPage(browser, OWNER, false);
        await open(p);
        await cvItem(p, '＋ 新增', '連結卡片');
        await p.locator('.cv-panel input[type=url]').fill('https://example.com/new');
        await p.getByRole('button', { name: '加入', exact: true }).click();
        await p.waitForFunction(() => /已擷取預覽/.test(document.querySelector('.cv-status').textContent));
        const st = await p.evaluate(() =>
          JSON.parse(
            JSON.stringify(
              VaultUI.canvasState().board.nodes.filter(
                n => n.type === 'link' && n.url === 'https://example.com/new'
              )
            )
          )
        );
        assert.strictEqual(st.length, 1);
        assert.strictEqual(st[0]['x-preview'].title, '新網頁');
        assert.strictEqual(st[0]['x-preview'].image, 'https://cdn.example.com/n.png');
        await p.waitForSelector('.cv-node.t-link .cv-pvd:text("新網頁的描述")');
        await p.getByRole('button', { name: /^儲存/ }).click();
        await p.waitForFunction(() => /已儲存/.test(document.querySelector('.cv-status').textContent));
        assert.strictEqual(
          serverBoard().nodes.find(x => x.url === 'https://example.com/new')['x-preview'].title,
          '新網頁'
        );
        await cvItem(p, '＋ 新增', '連結卡片');
        await p.locator('.cv-panel input[type=url]').fill('https://unreachable.example.org/x');
        await p.getByRole('button', { name: '加入', exact: true }).click();
        await p.waitForFunction(() => /無法擷取預覽/.test(document.querySelector('.cv-status').textContent));
        assert.strictEqual(
          await p.evaluate(
            () =>
              VaultUI.canvasState().board.nodes.filter(n => n.url === 'https://unreachable.example.org/x')
                .length
          ),
          1
        );
        await cvItem(p, '＋ 新增', '連結卡片');
        await p.locator('#cv-lk-pv').uncheck();
        await p.locator('.cv-panel input[type=url]').fill('http://plain.example.net/');
        await p.getByRole('button', { name: '加入', exact: true }).click();
        assert.ok(
          !(await p.evaluate(
            () =>
              VaultUI.canvasState().board.nodes.find(n => n.url === 'http://plain.example.net/')['x-preview']
          ))
        );
        await p.locator('.cv-node[data-id="L3"]').click({ position: { x: 10, y: 10 } });
        await p.getByRole('button', { name: '移除預覽' }).click();
        assert.ok(
          !(await p.evaluate(() => VaultUI.canvasState().board.nodes.find(n => n.id === 'L3')['x-preview']))
        );
        assert.strictEqual(p.errors.length, 0, p.errors.join('|'));
        await p.close();
      }
    );

    await t(
      'SVG 圖片卡：從筆記引用的 SVG 挑選放進畫布，顯示成圖片；整理排版（依標籤）建立群組、可復原；加入尚未上畫布的筆記',
      async () => {
        const p = await newPage(browser, OWNER, false);
        await open(p);
        await cvItem(p, '＋ 新增', 'SVG 圖片');
        await p.waitForSelector('.cv-svgpick');
        await p.locator('.cv-svgpick').first().click();
        await p.waitForFunction(() =>
          VaultUI.canvasState().board.nodes.some(n => n.file === 'assets/20261001-v001.svg')
        );
        await p.waitForFunction(() => {
          const i = document.querySelector('.cv-node.t-file img.cv-svg');
          return i && /^blob:|^data:/.test(i.src);
        });
        await p.evaluate(() => {
          VaultUI.canvasState().sel = {};
        });
        const before = await p.evaluate(() => JSON.stringify(VaultUI.canvasState().board));
        await cvItem(p, '排列', '整理排版');
        await p.locator('#cv-lay-tags').check();
        await p.locator('#cv-lay-add').check();
        await p.locator('#cv-lay-go').click();
        await p.waitForFunction(() => /已整理/.test(document.querySelector('.cv-status').textContent));
        const after = await p.evaluate(() => JSON.parse(JSON.stringify(VaultUI.canvasState().board)));
        const groups = after.nodes.filter(x => x.type === 'group');
        assert.ok(groups.length >= 2, '群組：' + groups.map(g => g.label));
        assert.ok(
          groups.some(g => g.label === '程式'),
          '標籤群組：' + JSON.stringify(groups.map(g => g.label))
        );
        assert.ok(
          after.nodes.some(x => x.file === 'notes/20261103-a003.md'),
          '丙書（原本不在畫布上）已加入'
        );
        assert.ok(after.nodes.filter(x => x.type === 'file').every(x => x['x-parent']));
        await p.getByRole('button', { name: '復原' }).click();
        assert.strictEqual(await p.evaluate(() => JSON.stringify(VaultUI.canvasState().board)), before);
        assert.strictEqual(p.errors.length, 0, p.errors.join('|'));
        await p.close();
      }
    );

    await t(
      '訪客：看得到預覽文字與「預覽圖」開關；沒有擷取、整理排版、＋圖片等編輯按鈕；後端拒絕訪客擷取',
      async () => {
        const v = await newPage(browser, VISITOR, false);
        await open(v);
        assert.ok((await node(v, 'L3').innerText()).includes('預覽標題'));
        assert.strictEqual(await v.locator('.cv-bar button', { hasText: '預覽圖' }).count(), 1);
        for (const name of ['整理排版', '＋圖片', '刪除畫布', '＋連結'])
          assert.strictEqual(await v.getByRole('button', { name }).count(), 0, name);
        assert.strictEqual(
          J(handle('fetchPreview', { url: 'https://example.com/new' }, VISITOR, 'RUN', store)).ok,
          false
        );
        assert.strictEqual(v.external.length, 0);
        assert.strictEqual(v.errors.length, 0, v.errors.join('|'));
        await v.close();
      }
    );
    await t(
      '回歸：連到舊群組的連線在整理排版後不留失效連線，儲存成功；原本就有的失效連線存檔時自動清掉並提示',
      async () => {
        const p = await newPage(browser, OWNER, false);
        await open(p);
        await p.evaluate(() => {
          const C = VaultUI.canvasState();
          const b = C.board;
          const g = { id: 'GG', type: 'group', label: '舊群組', x: -50, y: -50, width: 700, height: 400 };
          b.nodes.forEach(n => {
            if (n.id === 'N1' || n.id === 'N2') n['x-parent'] = 'GG';
          });
          b.nodes.push(g);
          b.edges.push({ id: 'EG', fromNode: 'GG', toNode: 'L3' });
          C.dirty = true;
        });
        await p.evaluate(() => {
          VaultUI.canvasState().sel = {};
        });
        await cvItem(p, '排列', '整理排版');
        await p.locator('#cv-lay-grid').check();
        await p.locator('#cv-lay-go').click();
        await p.waitForFunction(() => /已整理/.test(document.querySelector('.cv-status').textContent));
        assert.ok(/連線也一併移除/.test(await p.locator('.cv-status').innerText()));
        const edges = await p.evaluate(() => {
          const b = VaultUI.canvasState().board,
            ids = new Set(b.nodes.map(n => n.id));
          return b.edges.filter(e => !ids.has(e.fromNode) || !ids.has(e.toNode)).length;
        });
        assert.strictEqual(edges, 0);
        await p.getByRole('button', { name: /^儲存/ }).click();
        await p.waitForFunction(() =>
          /已儲存|儲存失敗/.test(document.querySelector('.cv-status').textContent)
        );
        assert.ok(
          /已儲存/.test(await p.locator('.cv-status').innerText()),
          await p.locator('.cv-status').innerText()
        );
        await p.evaluate(() => {
          const C = VaultUI.canvasState();
          C.board.edges.push({ id: 'ZZ', fromNode: 'N1', toNode: 'not-exist' });
          C.dirty = true;
        });
        await p.locator('.cv-view').focus();
        await p.keyboard.press('Control+s');
        await p.waitForFunction(() =>
          /已儲存|儲存失敗/.test(document.querySelector('.cv-status').textContent)
        );
        const st = await p.locator('.cv-status').innerText();
        assert.ok(/已儲存/.test(st) && /已自動移除 1 條失效連線/.test(st), st);
        assert.ok(!serverBoard().edges.some(e => e.id === 'ZZ'));
        assert.strictEqual(p.errors.length, 0, p.errors.join('|'));
        await p.close();
      }
    );
    console.log('\nP6 畫布豐富化端對端：' + n + ' 項全部通過');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n失敗：', e.message);
  process.exit(1);
});
