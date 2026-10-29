// 分享連結（主題、畫布）、直接開啟畫布的連結、從全螢幕畫布開筆記的版面
const { chromium } = require('playwright');
const vm = require('vm'),
  fs = require('fs'),
  path = require('path'),
  os = require('os'),
  assert = require('assert');
const makeStore = require('../../backend/tests/fake_store');
const BE = path.join(__dirname, '..', '..', 'backend');
const ctx = vm.createContext({ console, Logger: { log() {} } });
['Yaml.gs', 'Svg.gs', 'Core.gs', 'Sync.gs', 'Code.gs', 'Store.gs'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(BE, f), 'utf8'), ctx, { filename: f })
);
const handle = vm.runInContext('handle_', ctx),
  routeJson = vm.runInContext('routeJson_', ctx);
const OWNER = { isOwner: true, active: 'me@gmail.com' },
  VISITOR = { isOwner: false, active: '' };
const J = o => JSON.parse(JSON.stringify(o));
const BASE = 'https://script.google.com/macros/s/AKfyTEST/exec';

const store = makeStore();
store.saveTopic({ id: 'pubt', title: '公開主題', category: '測試', defaultPublic: true });
store.saveTopic({ id: 'privt', title: '私人主題', category: '測試', defaultPublic: false });
store.props = Object.assign(store.props || {}, { PUBLIC_URL: ' ' + BASE + ' \n' });
const note = (id, title, topic, pub) =>
  assert.ok(
    J(
      handle(
        'saveNote',
        {
          id,
          text:
            '---\nid: ' +
            id +
            '\ntitle: ' +
            title +
            '\ntopic: ' +
            topic +
            '\ndate: 2026-10-22\n' +
            (pub === undefined ? '' : 'public: ' + pub + '\n') +
            '---\n內容'
        },
        OWNER,
        'RUN',
        store
      )
    ).ok
  );
note('20261022-a001', '公開主題的筆記', 'pubt');
note('20261022-a002', '私人主題裡的公開筆記', 'privt', true);
const board = (topic, id) => ({
  nodes: [
    { id: 'A', type: 'file', file: 'notes/' + id + '.md', x: 0, y: 0, width: 280, height: 200 },
    { id: 'B', type: 'text', text: '便利貼', x: 400, y: 0, width: 200, height: 100 }
  ],
  edges: []
});
const nid = '0123456789abcdef0123456789abcdef';
const pb = board('pubt', '20261022-a001');
pb.nodes.push(
  {
    id: 'L1',
    type: 'link',
    url: 'https://example.com/page',
    x: 700,
    y: 0,
    width: 360,
    height: 220,
    'x-preview': { title: '範例頁', description: '描述' }
  },
  {
    id: 'L2',
    type: 'link',
    url: 'https://www.notion.so/ws/My-Reading-Plan-' + nid,
    x: 700,
    y: 300,
    width: 360,
    height: 220,
    'x-preview': { title: 'Notion', description: 'Notion – The all-in-one workspace' }
  }
);
assert.ok(J(handle('saveBoard', { topic: 'pubt', board: pb }, OWNER, 'RUN', store)).ok);
assert.ok(
  J(handle('saveBoard', { topic: 'privt', board: board('privt', '20261022-a002') }, OWNER, 'RUN', store)).ok
);

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
const tmpHtml = route => {
  const f = path.join(
    os.tmpdir(),
    'vault-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.html'
  );
  fs.writeFileSync(
    f,
    fs
      .readFileSync(path.join(__dirname, '..', '..', 'dist', 'index.html'), 'utf8')
      .split('/*__ROUTE__*/null')
      .join(route),
    'utf8'
  );
  return f;
};
async function newPage(browser, who, params) {
  const page = await (
    await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 900 } })
  ).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.route(/^https?:\/\/(?!localhost|127\.)/, r => r.abort());
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
  });
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
  const route = routeJson(params || {}, BASE.trim());
  await page.goto('file://' + tmpHtml(route));
  await page.waitForFunction(
    () => document.getElementById('who') && document.getElementById('who').textContent !== '載入中…'
  );
  page.errors = errors;
  return page;
}

(async () => {
  const browser = await chromium.launch();
  try {
    await t('後端：board=1 只在主題 id 合法時才帶出；其他參數照舊被驗證', async () => {
      const r = x => JSON.parse(routeJson(x, BASE));
      assert.deepStrictEqual(r({ topic: 'pubt', board: '1' }), { base: BASE, topic: 'pubt', board: true });
      assert.deepStrictEqual(r({ board: '1' }), { base: BASE });
      assert.deepStrictEqual(r({ topic: '../x', board: '1' }), { base: BASE });
      assert.deepStrictEqual(r({ topic: 'pubt', board: 'yes' }), { base: BASE, topic: 'pubt' });
    });

    await t(
      '擁有者：主題頁的「分享連結」顯示 ?topic=…（含公開網址），私人主題有提醒；複製鈕存在',
      async () => {
        const p = await newPage(browser, OWNER);
        await p.locator('#shelfBody button.pill', { hasText: '公開主題' }).first().click();
        await p.locator('#t-share').click();
        assert.strictEqual(await p.locator('#share-url2').inputValue(), BASE + '?topic=pubt');
        assert.strictEqual(await p.locator('#share-private').count(), 0);
        assert.strictEqual(await p.locator('#share-nobase').count(), 0);
        assert.strictEqual(await p.locator('#share-copy2').count(), 1);
        await p.locator('#shelfBody button.pill', { hasText: '私人主題' }).first().click();
        await p.locator('#t-share').click();
        assert.strictEqual(await p.locator('#share-url2').inputValue(), BASE + '?topic=privt');
        assert.strictEqual(await p.locator('#share-private').count(), 1);
        assert.strictEqual(p.errors.length, 0, p.errors.join('|'));
        await p.close();
      }
    );

    await t(
      '畫布頁的「分享連結」：網址帶 &board=1；擁有者看得到「卡片會被拿掉」的說明；訪客也能分享公開畫布',
      async () => {
        const p = await newPage(browser, OWNER);
        await p.locator('#shelfBody button.pill', { hasText: '公開主題' }).first().click();
        await p.getByRole('button', { name: '開啟畫布' }).click();
        await p.waitForSelector('.cv-view');
        await cvItem(p, '更多', '分享連結');
        assert.strictEqual(await p.locator('#share-url2').inputValue(), BASE + '?topic=pubt&board=1');
        assert.ok((await p.locator('#share-board-box').innerText()).includes('拿掉指向私人筆記的卡片'));
        await p.close();
        const v = await newPage(browser, VISITOR);
        await v.locator('#shelfBody button.pill', { hasText: '公開主題' }).first().click();
        await v.getByRole('button', { name: '開啟畫布' }).click();
        await v.waitForSelector('.cv-view');
        await cvItem(v, '更多', '分享連結');
        assert.strictEqual(await v.locator('#share-url2').inputValue(), BASE + '?topic=pubt&board=1');
        assert.strictEqual(await v.locator('#share-private').count(), 0);
        assert.strictEqual(v.errors.length, 0, v.errors.join('|'));
        await v.close();
      }
    );

    await t(
      '訪客打開 ?topic=…&board=1：公開主題直接進畫布；私人主題打不開（停在列表，沒有畫布、沒有私人內容）',
      async () => {
        const v = await newPage(browser, VISITOR, { topic: 'pubt', board: '1' });
        await v.waitForSelector('.cv-view');
        await v.waitForFunction(() => document.querySelectorAll('.cv-node').length >= 1);
        const w = await newPage(browser, VISITOR, { topic: 'privt', board: '1' });
        await w.waitForTimeout(500);
        assert.strictEqual(await w.locator('.cv-view').count(), 0);
        assert.ok((await w.locator('#route-notice').innerText()).includes('找不到你要開啟的主題'));
        assert.strictEqual(await w.locator('#shelfBody button.pill', { hasText: /^私人主題/ }).count(), 0);
        assert.strictEqual(v.errors.length + w.errors.length, 0, v.errors.concat(w.errors).join('|'));
        await v.close();
        await w.close();
      }
    );

    await t('從全螢幕畫布按卡片右上角開筆記：自動離開全螢幕版面，頁首、書櫃、「回到列表」都在', async () => {
      const p = await newPage(browser, OWNER);
      await p.locator('#shelfBody button.pill', { hasText: '公開主題' }).first().click();
      await p.getByRole('button', { name: '開啟畫布' }).click();
      await p.waitForSelector('.cv-view');
      await p.getByRole('button', { name: '全螢幕' }).click();
      assert.ok(await p.evaluate(() => document.body.classList.contains('cv-full')));
      await p.waitForSelector('.cv-open');
      await p.locator('.cv-open').first().click();
      await p.waitForSelector('.back');
      assert.ok(!(await p.evaluate(() => document.body.classList.contains('cv-full'))));
      assert.ok(await p.locator('.back').first().isVisible());
      assert.ok(await p.locator('.bar').first().isVisible());
      assert.ok(await p.locator('#shelf').isVisible());
      assert.strictEqual(p.errors.length, 0, p.errors.join('|'));
      await p.close();
    });
    await t(
      '連結卡片右上角有 ↗（新分頁開啟原連結）：一般與全螢幕都看得到、點得到；點它不會選取或放大卡片；Notion 卡片標題取自網址',
      async () => {
        for (const who of [OWNER, VISITOR]) {
          const p = await newPage(browser, who);
          await p.locator('#shelfBody button.pill', { hasText: '公開主題' }).first().click();
          await p.getByRole('button', { name: '開啟畫布' }).click();
          await p.waitForSelector('.cv-view');
          for (const full of [false, true]) {
            if (full) await p.getByRole('button', { name: '全螢幕' }).click();
            const a = p.locator('.cv-node[data-id="L1"] a.cv-openext');
            await a.waitFor();
            assert.strictEqual(await a.getAttribute('href'), 'https://example.com/page');
            assert.strictEqual(await a.getAttribute('target'), '_blank');
            assert.ok((await a.getAttribute('rel')).includes('noopener'));
            const bb = await a.boundingBox(),
              vb = await p.locator('.cv-view').boundingBox();
            assert.ok(
              bb.x >= vb.x &&
                bb.x + bb.width <= vb.x + vb.width &&
                bb.y >= vb.y &&
                bb.y + bb.height <= vb.y + vb.height,
              '↗ 在畫布可視範圍內'
            );
            const hit = await p.evaluate(
              ([x, y]) => {
                const e = document.elementFromPoint(x, y);
                return !!(e && e.closest('a.cv-openext'));
              },
              [bb.x + bb.width / 2, bb.y + bb.height / 2]
            );
            assert.ok(hit, '↗ 沒被其他元素蓋住（full=' + full + '）');
            const [pop] = await Promise.all([
              p
                .context()
                .waitForEvent('page', { timeout: 3000 })
                .catch(() => null),
              a.click()
            ]);
            if (pop) await pop.close();
            assert.strictEqual(
              Object.keys(await p.evaluate(() => VaultUI.canvasState().sel || {})).length,
              0,
              '點 ↗ 不選取卡片'
            );
          }
          assert.ok(
            (await p.locator('.cv-node[data-id="L2"] .cv-ttl').innerText()).includes('My Reading Plan')
          );
          assert.ok(!(await p.locator('.cv-node[data-id="L2"]').innerText()).includes('all-in-one'));
          assert.strictEqual(await p.locator('.cv-node[data-id="N1"] a.cv-openext').count(), 0);
          assert.strictEqual(p.errors.length, 0, p.errors.join('|'));
          await p.close();
        }
      }
    );
    await t(
      '主題頁一鍵「改為私人／改為公開」：訪客立刻看不到／看得到；改回公開時有未設定的筆記會先要求確認；畫布頁顯示跟隨主題',
      async () => {
        const p = await newPage(browser, OWNER);
        await p.locator('#shelfBody button.pill', { hasText: '公開主題' }).first().click();
        await p.getByRole('button', { name: '開啟畫布' }).click();
        await p.waitForSelector('#cv-vis');
        assert.ok((await p.locator('#cv-vis').innerText()).includes('公開'));
        await p.locator('.back button').first().click();
        assert.strictEqual(await p.locator('#t-pubtoggle').innerText(), '改為私人');
        await p.locator('#t-pubtoggle').click();
        await p.waitForFunction(
          () =>
            document.getElementById('t-pubtoggle') &&
            document.getElementById('t-pubtoggle').textContent === '改為公開'
        );
        assert.strictEqual(
          J(handle('getBoard', { topic: 'pubt' }, VISITOR, 'RUN', store)).ok,
          false,
          '改成私人後訪客看不到畫布'
        );
        await p.locator('#t-pubtoggle').click();
        await p.waitForSelector('#te-confirm');
        assert.strictEqual(
          J(handle('getBoard', { topic: 'pubt' }, VISITOR, 'RUN', store)).ok,
          false,
          '確認前仍是私人'
        );
        await p.locator('#te-confirm').click();
        await p.waitForSelector('#t-pubtoggle');
        assert.strictEqual(await p.locator('#t-pubtoggle').innerText(), '改為私人');
        assert.strictEqual(J(handle('getBoard', { topic: 'pubt' }, VISITOR, 'RUN', store)).ok, true);
        const v = await newPage(browser, VISITOR);
        await v.locator('#shelfBody button.pill', { hasText: '公開主題' }).first().click();
        assert.strictEqual(await v.locator('#t-pubtoggle').count(), 0);
        assert.strictEqual(await v.locator('#cv-vis').count(), 0);
        assert.strictEqual(p.errors.length + v.errors.length, 0, p.errors.concat(v.errors).join('|'));
        await p.close();
        await v.close();
      }
    );
    await t(
      '備援：伺服器沒帶到網址參數時，改用 google.script.url.getLocation 讀外層網址，仍能開到該筆記／主題／畫布；惡意或不合法參數被忽略',
      async () => {
        const mk = async param => {
          const p = await (
            await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 900 } })
          ).newPage();
          const errors = [];
          p.on('pageerror', e => errors.push(e.message));
          await p.route(/^https?:\/\/(?!localhost|127\.)/, r => r.abort());
          await p.exposeFunction('__api', (a, q) =>
            JSON.stringify(handle(a, JSON.parse(q), VISITOR, 'RUN', store))
          );
          await p.addInitScript(prm => {
            const make = (ok, ng) => ({
              withSuccessHandler: f => make(f, ng),
              withFailureHandler: f => make(ok, f),
              api: (a, q) => {
                window.__api(a, JSON.stringify(q || {})).then(r => ok && ok(JSON.parse(r)));
              }
            });
            window.google = {
              script: {
                run: make(null, null),
                url: { getLocation: cb => setTimeout(() => cb({ parameter: prm, hash: '' }), 50) }
              }
            };
          }, param);
          await p.goto('file://' + tmpHtml('null'));
          await p.waitForFunction(
            () => document.getElementById('who') && document.getElementById('who').textContent !== '載入中…'
          );
          await p.waitForTimeout(500);
          p.errors = errors;
          return p;
        };
        let p = await mk({ note: '20261022-a001' });
        assert.strictEqual(await p.evaluate(() => VaultUI.S.note && VaultUI.S.note.id), '20261022-a001');
        await p.close();
        p = await mk({ topic: 'pubt' });
        assert.strictEqual(await p.evaluate(() => VaultUI.S.f.topic), 'pubt');
        await p.close();
        p = await mk({ topic: 'pubt', board: '1' });
        await p.waitForSelector('.cv-view');
        await p.close();
        p = await mk({ note: '"><script>x', topic: '../x' });
        assert.strictEqual(await p.evaluate(() => VaultUI.S.f.topic + '|' + (VaultUI.S.note ? 1 : 0)), '|0');
        assert.strictEqual(p.errors.length, 0);
        await p.close();
      }
    );
    console.log('\n分享與全螢幕：' + n + ' 項全部通過');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n失敗：', e.message);
  process.exit(1);
});
