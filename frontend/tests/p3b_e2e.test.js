// P3 批次二端對端：雙語、主題、圖庫、日曆、三種檢視切換
const H = require('./harness');
const { chromium, assert, OWNER, VISITOR, makeEnv, newPage, settle, t } = H;
const env = makeEnv();
env.store.saveTopic({ id: 'dev', title: '程式筆記', defaultPublic: false });
env.store.saveTopic({ id: 'pub', title: '公開主題', defaultPublic: true });
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#c33"/></svg>';
const up = env.call('uploadSvg', { id: '20261001-v001', text: SVG });
assert.ok(up.ok, JSON.stringify(up));
env.saveNote('20261005-a001', '十月五日的筆記', 'dev', undefined, '內文A', {
  date: '2026-10-05',
  cover: '20261001-v001'
});
env.saveNote('20261005-a002', '同一天的第二則', 'dev', undefined, '內文B', { date: '2026-10-05' });
env.saveNote('20261024-b001', '今天寫的', 'pub', true, '內文C', { date: '2026-10-24' });
env.saveNote('20260915-c001', '九月的筆記', 'dev', undefined, '內文D', { date: '2026-09-15' });
const WRITES = ['saveNote', 'saveBoard', 'saveTopic', 'uploadSvg', 'deleteNote', 'rebuildIndex'];
const writes = p => WRITES.filter(a => p.calls[a]);
// 掃出畫面上殘留的中文字（英文介面下不該有；筆記內容與主題名稱等使用者資料除外）
const CJK_SCAN = userTexts => {
  const re = /[　-〿一-鿿＀-￯]/;
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    if (/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName) || n.parentNode.className === 'ph') continue;
    const s = n.nodeValue.trim();
    if (s && re.test(s) && !userTexts.some(u => s.indexOf(u) >= 0)) out.push(s);
  }
  document.querySelectorAll('[placeholder],[aria-label],[title]').forEach(e =>
    ['placeholder', 'aria-label', 'title'].forEach(a => {
      const s = e.getAttribute(a);
      if (s && re.test(s) && !userTexts.some(u => s.indexOf(u) >= 0)) out.push(a + '=' + s);
    })
  );
  return out;
};
const USER = [
  '繁體中文',
  '十月五日的筆記',
  '同一天的第二則',
  '今天寫的',
  '九月的筆記',
  '程式筆記',
  '公開主題',
  '內文',
  '日記'
];

(async () => {
  const browser = await chromium.launch();
  try {
    const mk = () =>
      browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    let bctx = await mk(),
      p = await newPage(bctx, env, OWNER);

    await t('三種檢視：列表／圖庫／日曆切換只改畫面，不呼叫任何寫入 API，資料筆數不變', async () => {
      const before = await p.evaluate(() => VaultUI.S.items.length);
      assert.strictEqual(await p.locator('.vtab').count(), 4);
      await p.getByRole('tab', { name: '圖庫' }).click();
      await p.waitForSelector('.gal .card');
      assert.strictEqual(await p.locator('.gal .card').count(), before);
      await p.getByRole('tab', { name: '日曆' }).click();
      await p.waitForSelector('.cal');
      await p.getByRole('tab', { name: '列表' }).click();
      await p.waitForSelector('#main .list');
      assert.strictEqual(await p.locator('#main .list li').count(), before);
      assert.deepStrictEqual(writes(p), [], '切換檢視不該寫入：' + JSON.stringify(p.calls));
      assert.strictEqual(await p.evaluate(() => VaultUI.S.items.length), before);
    });

    await t('圖庫：有 cover 的顯示縮圖（<img>），沒有的顯示首字佔位；點卡片開啟筆記', async () => {
      await p.getByRole('tab', { name: '圖庫' }).click();
      await p.waitForSelector('.gal .card');
      await p.waitForFunction(() => document.querySelectorAll('.thumb.has img').length === 1, null, {
        timeout: 5000
      });
      const card = p.locator('.gal .card', { hasText: '十月五日的筆記' });
      assert.ok((await card.locator('img').getAttribute('src')).startsWith('data:image/svg+xml'));
      const other = p.locator('.gal .card', { hasText: '同一天的第二則' });
      assert.ok(await other.locator('.ph').isVisible());
      assert.strictEqual(await p.locator('.gal img[hidden]').count(), 3);
      assert.strictEqual(await p.locator('.gal script, .gal svg').count(), 0, '縮圖不得內嵌 SVG');
      await p.screenshot({ path: H.path.join(__dirname, 'shots', '9_gallery.png') });
      await card.click();
      await p.waitForSelector('.md');
      assert.ok((await p.locator('#main h2').textContent()).includes('十月五日的筆記'));
      await p.locator('.back button', { hasText: '回到列表' }).click();
      await p.waitForSelector('.vtabs');
      assert.strictEqual(await p.locator('.vtab.on').textContent(), '圖庫', '回到列表後仍停在圖庫檢視');
    });

    await t('日期範圍與排序：含頭尾；清除日期恢復；排序影響順序', async () => {
      await p.fill('#v-from', '2026-10-05');
      await p.fill('#v-to', '2026-10-05');
      await p.waitForFunction(() => document.querySelectorAll('.gal .card').length === 2);
      await p.getByRole('button', { name: '清除日期' }).click();
      await p.waitForFunction(() => document.querySelectorAll('.gal .card').length === 4);
      await p.selectOption('#v-sort', 'date-asc');
      assert.ok((await p.locator('.gal .card .ct').first().textContent()).includes('九月'));
      await p.selectOption('#v-sort', 'date-desc');
      assert.ok((await p.locator('.gal .card .ct').first().textContent()).includes('今天'));
      await p.selectOption('#v-sort', '');
      await p.getByRole('tab', { name: '列表' }).click();
      await p.fill('#v-from', '2026-10-01');
      await p.waitForFunction(() => document.querySelectorAll('#main .list li').length === 3);
      await p.getByRole('button', { name: '清除日期' }).click();
    });

    await t('日曆：顯示當月、有筆記的日子有數量；點日期列出當天筆記；上個月／今天可切換', async () => {
      await p.getByRole('tab', { name: '日曆' }).click();
      await p.waitForSelector('.cal');
      const title0 = await p.locator('.cal-title').textContent();
      assert.ok(/2026/.test(title0) && /10/.test(title0), title0);
      const d24 = p.locator('.cal-day[data-date="2026-10-24"]');
      assert.strictEqual(await d24.locator('.dc').textContent(), '1');
      assert.strictEqual(await p.locator('.cal-day[data-date="2026-10-05"] .dc').textContent(), '2');
      assert.ok((await p.locator('.cal-day.today').getAttribute('data-date')) !== null);
      await p.locator('.cal-day[data-date="2026-10-05"]').click();
      await p.waitForSelector('.cal-day-list');
      assert.strictEqual(await p.locator('.cal-day-list li').count(), 2);
      await p.getByRole('button', { name: '上個月' }).click();
      assert.ok(/9/.test(await p.locator('.cal-title').textContent()));
      assert.strictEqual(await p.locator('.cal-day[data-date="2026-09-15"] .dc').textContent(), '1');
      await p.getByRole('button', { name: '下個月' }).click();
      await p.getByRole('button', { name: '今天' }).click();
      assert.ok(/10/.test(await p.locator('.cal-title').textContent()));
      assert.deepStrictEqual(writes(p), []);
      await p.screenshot({ path: H.path.join(__dirname, 'shots', '10_calendar.png') });
    });

    await t(
      '日曆：雙擊某天新增筆記 → 編輯器帶入該日期與目前選的主題；沒選主題則為未歸類；取消不寫入',
      async () => {
        await p.locator('#shelfBody button.pill', { hasText: '程式筆記' }).click();
        await p.waitForSelector('.cal');
        await p.locator('.cal-day[data-date="2026-10-12"]').dblclick();
        await p.waitForSelector('#main input');
        const vals = await p.evaluate(() =>
          Array.from(document.querySelectorAll('#main input, #main select')).map(e => e.value)
        );
        assert.ok(vals.includes('2026-10-12'), JSON.stringify(vals));
        assert.ok(vals.includes('dev'), JSON.stringify(vals));
        assert.deepStrictEqual(writes(p), []);
        await p.locator('#main button', { hasText: '捨棄草稿' }).click();
        await p.waitForTimeout(200);
        await p.locator('#shelfBody button.pill', { hasText: '全部' }).first().click();
        await p.getByRole('tab', { name: '日曆' }).click();
        await p.locator('.cal-day[data-date="2026-10-13"]').click();
        await p.locator('#cal-new').click();
        await p.waitForSelector('#main input');
        const v2 = await p.evaluate(() =>
          Array.from(document.querySelectorAll('#main input, #main select')).map(e => e.value)
        );
        assert.ok(v2.includes('2026-10-13'));
        assert.ok(!v2.includes('dev'), '沒選主題應為未歸類：' + JSON.stringify(v2));
        await p.locator('#main button', { hasText: '捨棄草稿' }).click();
        assert.deepStrictEqual(writes(p), []);
      }
    );

    await t('訪客：日曆雙擊不會開編輯器，也沒有「在這天新增筆記」', async () => {
      const v = await newPage(bctx, env, VISITOR);
      await v.getByRole('tab', { name: '日曆' }).click();
      await v.waitForSelector('.cal');
      await v.locator('.cal-day[data-date="2026-10-24"]').dblclick();
      await v.waitForTimeout(200);
      assert.strictEqual(await v.locator('#cal-new').count(), 0);
      assert.strictEqual(await v.locator('.cal-day-list').count(), 1);
      assert.ok(!(await v.locator('#main').textContent()).includes('標題（'));
      assert.deepStrictEqual(writes(v), []);
      await v.close();
    });
    await p.close();

    /* ───── 語言 ───── */
    await t(
      '語言：預設跟隨瀏覽器；英文瀏覽器 → 英文介面；整個畫面沒有殘留中文（使用者資料除外）',
      async () => {
        const bc = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
        const e = await newPage(bc, env, OWNER, { lang: 'en-US' });
        assert.strictEqual(await e.evaluate(() => document.documentElement.lang), 'en');
        assert.strictEqual(await e.locator('#who').textContent(), 'Owner');
        assert.ok(await e.getByRole('button', { name: 'New', exact: true }).count());
        let left = await e.evaluate(CJK_SCAN, USER);
        assert.deepStrictEqual(left, [], '列表殘留中文');
        for (const tab of ['Gallery', 'Calendar', 'List']) {
          await e.getByRole('tab', { name: tab }).click();
          await settle(e);
          left = await e.evaluate(CJK_SCAN, USER);
          assert.deepStrictEqual(left, [], tab + ' 殘留中文');
        }
        await e.locator('#btnSettings').click();
        await e.waitForSelector('#s-lang');
        left = await e.evaluate(CJK_SCAN, USER);
        assert.deepStrictEqual(left, [], '設定頁殘留中文');
        await e.close();
        await bc.close();
      }
    );
    await t('語言：在設定切換 → 立即生效、重新開啟仍記得；切回繁中；訪客身分同樣', async () => {
      const bc = await mk();
      let e = await newPage(bc, env, OWNER);
      assert.strictEqual(await e.evaluate(() => document.documentElement.lang), 'zh-Hant');
      await e.locator('#btnSettings').click();
      await e.selectOption('#s-lang', 'en');
      await e.waitForFunction(() => document.documentElement.lang === 'en');
      assert.strictEqual(await e.locator('#btnSettings').textContent(), 'Settings');
      assert.strictEqual(await e.locator('#who').textContent(), 'Owner');
      await e.waitForTimeout(300);
      await e.close();
      e = await newPage(bc, env, VISITOR);
      await e.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 5000 });
      assert.strictEqual(await e.locator('#who').textContent(), 'Visitor · read-only');
      await e.locator('#btnSettings').click();
      await e.selectOption('#s-lang', 'zh-Hant');
      await e.waitForFunction(() => document.documentElement.lang === 'zh-Hant');
      assert.strictEqual(await e.locator('#who').textContent(), '訪客・唯讀');
      await e.close();
      await bc.close();
    });
    await t(
      '英文介面的流程：開筆記、編輯器、上傳、備份、畫布頁都沒有殘留中文；後端錯誤也翻成英文',
      async () => {
        const bc = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
        const e = await newPage(bc, env, OWNER, { lang: 'en-US' });
        await e.getByText('今天寫的').first().click();
        await e.waitForSelector('.md');
        assert.deepStrictEqual(await e.evaluate(CJK_SCAN, USER), [], '筆記頁');
        await e.getByRole('button', { name: 'Edit', exact: true }).click();
        await e.waitForSelector('#main input');
        assert.deepStrictEqual(await e.evaluate(CJK_SCAN, USER), [], '編輯器');
        await e.locator('#main button', { hasText: 'Discard' }).click();
        await e.locator('#tools button', { hasText: 'Upload' }).click();
        await e.waitForTimeout(200);
        assert.deepStrictEqual(await e.evaluate(CJK_SCAN, USER), [], '上傳頁');
        await e.locator('#tools button', { hasText: /^Backup$/ }).click();
        await e.waitForTimeout(200);
        assert.deepStrictEqual(await e.evaluate(CJK_SCAN, USER), [], '備份頁');
        await e.locator('#shelfBody button.pill', { hasText: '公開主題' }).click();
        await e.getByRole('button', { name: 'Open canvas' }).click();
        await e.waitForSelector('.cv-view');
        await settle(e);
        assert.deepStrictEqual(await e.evaluate(CJK_SCAN, USER), [], '畫布頁（空畫布）');
        const msg = await e.evaluate(() => VaultI18n.T('找不到主題：x'));
        assert.strictEqual(msg, 'Topic not found: x');
        await e.close();
        await bc.close();
      }
    );

    /* ───── 主題 ───── */
    await t('主題：預設「自動」不覆寫變數；選每個內建主題都會改變背景與文字色，並記住', async () => {
      const bc = await mk();
      let e = await newPage(bc, env, OWNER);
      assert.strictEqual(await e.evaluate(() => document.documentElement.getAttribute('data-theme')), null);
      await e.locator('#btnSettings').click();
      await e.waitForSelector('.th');
      assert.strictEqual(await e.locator('.th').count(), 11);
      const TH = require('../themes.js');
      for (const th of TH.LIST) {
        await e.locator('.th[data-theme-id="' + th.id + '"]').click();
        const got = await e.evaluate(() => ({
          bg: getComputedStyle(document.body).backgroundColor,
          fg: getComputedStyle(document.body).color,
          attr: document.documentElement.getAttribute('data-theme')
        }));
        const hex = c => {
          const m = /(\d+), (\d+), (\d+)/.exec(c);
          return '#' + [1, 2, 3].map(i => ('0' + (+m[i]).toString(16)).slice(-2)).join('');
        };
        assert.strictEqual(got.attr, th.id);
        assert.strictEqual(hex(got.bg), th.colors.bg, th.id + ' 背景');
        assert.strictEqual(hex(got.fg), th.colors.fg, th.id + ' 文字');
      }
      await e.locator('.th[data-theme-id="dracula"]').click();
      await e.waitForTimeout(300);
      await e.close();
      e = await newPage(bc, env, OWNER);
      await e.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dracula', null, {
        timeout: 5000
      });
      await e.locator('#btnSettings').click();
      await e.locator('.th[data-theme-id="auto"]').click();
      assert.strictEqual(await e.evaluate(() => document.documentElement.getAttribute('data-theme')), null);
      assert.strictEqual(await e.evaluate(() => document.documentElement.style.getPropertyValue('--bg')), '');
      await e.close();
      await bc.close();
    });
    await t(
      '主題：實際畫面的文字對比（量測計算後的顏色）— 每個主題、列表與筆記內文、Markdown 程式碼，最低 ≥ 4.5',
      async () => {
        const bc = await mk();
        const e = await newPage(bc, env, OWNER);
        const TH = require('../themes.js');
        const body =
          '# 標題\n\n```js\nconst a = "x"; // 註解\nfunction f(n) { return 42; }\n```\n\n一般段落。';
        env.saveNote('20261024-z001', '主題量測用', 'dev', undefined, body);
        await e.reload();
        await e.waitForSelector('#main .list');
        const rows = [];
        for (const th of TH.LIST) {
          await e.locator('#btnSettings').click();
          await e.locator('.th[data-theme-id="' + th.id + '"]').click();
          await e.locator('#s-back').click();
          await e.getByText('主題量測用').first().click();
          await e.waitForSelector('.md pre code .tk-k');
          const min = await e.evaluate(() => {
            const rgb = c => {
              const m = /(\d+), (\d+), (\d+)/.exec(c);
              return [1, 2, 3].map(i => {
                const x = +m[i] / 255;
                return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
              });
            };
            const lum = c => {
              const v = rgb(c);
              return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
            };
            const bgOf = el => {
              for (let n = el; n; n = n.parentElement) {
                const b = getComputedStyle(n).backgroundColor;
                if (!/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b;
              }
              return getComputedStyle(document.body).backgroundColor;
            };
            const ratio = (a, b) => {
              const x = lum(a),
                y = lum(b);
              return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
            };
            let m = 99;
            document
              .querySelectorAll(
                '.md p, .md h2, .md h1, .md pre code .tk-k, .md pre code .tk-s, .md pre code .tk-c, .md pre code .tk-n, .md pre code .tk-f, #main .sub, .back button, .tbtn'
              )
              .forEach(el => {
                if (!el.textContent.trim()) return;
                m = Math.min(m, ratio(getComputedStyle(el).color, bgOf(el)));
              });
            return m;
          });
          rows.push(th.id + ' ' + min.toFixed(2));
          assert.ok(min >= 4.5, th.id + ' 實測最低對比 ' + min.toFixed(2));
          await e.locator('.back button', { hasText: '回到列表' }).click();
        }
        console.log('      實測最低對比：' + rows.join('；'));
        await e.close();
        await bc.close();
      }
    );
    await t('主題：畫布 6 色跟著主題變（卡片邊框、連線、群組標籤都用 --c1~--c6）', async () => {
      const bc = await mk();
      const e = await newPage(bc, env, OWNER);
      env.store.saveTopic({ id: 'cv', title: '畫布主題', defaultPublic: true });
      const cvr = env.call('saveBoard', {
        topic: 'cv',
        board: {
          nodes: [
            { id: 'g1', type: 'group', x: 0, y: 0, width: 300, height: 200, label: '群', color: '1' },
            { id: 't1', type: 'text', x: 20, y: 40, width: 120, height: 60, text: 'A', color: '4' },
            { id: 't2', type: 'text', x: 400, y: 40, width: 120, height: 60, text: 'B' }
          ],
          edges: [{ id: 'e1', fromNode: 't1', toNode: 't2', color: '6' }]
        }
      });
      assert.ok(cvr.ok, JSON.stringify(cvr));
      await e.reload();
      await e.waitForSelector('#main .list');
      await e.locator('#shelfBody button.pill', { hasText: '畫布主題' }).click();
      await e.getByRole('button', { name: '開啟畫布' }).click();
      await e.waitForSelector('.cv-node');
      await settle(e);
      const read = () =>
        e.evaluate(() => ({
          node: getComputedStyle(document.querySelector('.cv-node:not(.t-group)')).borderTopColor,
          edge: getComputedStyle(document.querySelector('.cv-el')).stroke,
          label: getComputedStyle(document.querySelector('.cv-glabel')).backgroundColor
        }));
      const a = await read();
      await e.evaluate(() => {
        document.documentElement.style.setProperty('--c1', '#010203');
        document.documentElement.style.setProperty('--c4', '#040506');
        document.documentElement.style.setProperty('--c6', '#070809');
      });
      const b = await read();
      assert.notDeepStrictEqual(a, b);
      assert.strictEqual(b.node, 'rgb(4, 5, 6)');
      assert.strictEqual(b.edge, 'rgb(7, 8, 9)');
      assert.strictEqual(b.label, 'rgb(1, 2, 3)');
      await e.close();
      await bc.close();
    });
    await t(
      '自訂主題：匯出 JSON → 修改 → 匯入，顯示對比表；對比不足會警告但仍可套用；壞檔顯示錯誤',
      async () => {
        const bc = await mk();
        const e = await newPage(bc, env, OWNER);
        await e.locator('#btnSettings').click();
        await e.locator('.th[data-theme-id="nord"]').click();
        await e.locator('#s-export').click();
        const json = await e.inputValue('#s-json');
        const o = JSON.parse(json);
        assert.strictEqual(o.format, 'vault-theme');
        assert.strictEqual(o.extends, 'nord');
        assert.ok(
          await e
            .locator('#s-dl')
            .getAttribute('href')
            .then(h => h.startsWith('data:application/json'))
        );
        o.name = '我的深藍';
        o.colors.bg = '#0b1020';
        await e.fill('#s-json', JSON.stringify(o));
        await e.locator('#s-import').click();
        await e.waitForSelector('#s-rep');
        assert.ok((await e.locator('#s-rep').textContent()).includes('4.5'));
        assert.ok((await e.locator('.ctab').count()) >= 1);
        await e.locator('#s-apply').click();
        await e.waitForSelector('.th[data-theme-id="custom"].on');
        assert.strictEqual(
          await e.evaluate(() => getComputedStyle(document.body).backgroundColor),
          'rgb(11, 16, 32)'
        );
        o.colors.fg = '#101830';
        await e.fill('#s-json', JSON.stringify(o));
        await e.locator('#s-import').click();
        await e.waitForSelector('#s-rep.err');
        assert.ok((await e.locator('.ctab tr.bad').count()) >= 1);
        assert.ok(await e.locator('#s-apply').isEnabled());
        await e.fill('#s-json', '{壞掉');
        await e.locator('#s-import').click();
        await e.waitForSelector('#s-err');
        assert.ok((await e.locator('#s-err').textContent()).includes('JSON'));
        await e.fill('#s-json', JSON.stringify({ format: 'vault-theme', colors: { bg: 'red' } }));
        await e.locator('#s-import').click();
        assert.ok((await e.locator('#s-err').textContent()).includes('bg'));
        await e.waitForTimeout(300);
        await e.close();
        const e2 = await newPage(bc, env, OWNER);
        await e2.waitForFunction(
          () => document.documentElement.getAttribute('data-theme') === 'custom',
          null,
          { timeout: 5000 }
        );
        assert.strictEqual(
          await e2.evaluate(() => getComputedStyle(document.body).backgroundColor),
          'rgb(11, 16, 32)'
        );
        await e2.close();
        await bc.close();
      }
    );
    await t('主題截圖（Tokyo Night 的列表、畫布設定頁）供目視確認', async () => {
      const bc = await mk();
      const e = await newPage(bc, env, OWNER);
      await e.locator('#btnSettings').click();
      await e.locator('.th[data-theme-id="tokyo-night"]').click();
      await e.locator('#s-contrast summary').click();
      await e.screenshot({ path: H.path.join(__dirname, 'shots', '11_settings_tokyo.png') });
      await e.locator('#s-back').click();
      await e.getByRole('tab', { name: '圖庫' }).click();
      await e.waitForSelector('.gal .card');
      await e.waitForTimeout(300);
      await e.screenshot({ path: H.path.join(__dirname, 'shots', '12_gallery_tokyo.png') });
      await e.close();
      await bc.close();
    });
    await t('沒有 JavaScript 錯誤或未捕捉的例外', async () => {
      assert.deepStrictEqual(p.errors, []);
    });
    console.log('\nP3 批次二端對端：' + H.count() + ' 項全部通過');
  } catch (e) {
    console.error('\n失敗：', e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
