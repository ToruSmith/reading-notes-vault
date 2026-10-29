// P4 端對端：公開閱讀、語言、路由、發布檢查（個資掃描）、批次刪除、手機版
const H = require('./harness');
const { chromium, assert, OWNER, VISITOR, makeEnv, newPage, t } = H;
const env = makeEnv();
env.store.saveTopic({ id: 'pub', title: '公開本', defaultPublic: true });
env.store.saveTopic({ id: 'priv', title: '私人本', defaultPublic: false });
const ID = { a: '20261001-p1', b: '20261002-p2', c: '20261003-p3', s: '20261004-s1', x: '20261005-x1' };
env.saveNote(ID.a, '資料庫入門', 'pub', undefined, '# 正文\n內容 A [[' + ID.s + ']]', {
  date: '2026-10-01',
  lang: 'zh-Hant'
});
env.saveNote(ID.b, 'Database Basics', 'pub', undefined, 'English body', {
  date: '2026-10-02',
  lang: 'en',
  translation_of: ID.a
});
env.saveNote(
  ID.c,
  '聯絡方式',
  'pub',
  undefined,
  '電話 0912-345-678，信箱 test@example.com。\n```\n另一個 dev@example.org\n```',
  { date: '2026-10-03', lang: 'zh-Hant' }
);
env.saveNote(ID.s, '機密日記', 'priv', undefined, '只有我能看的祕密 0922-111-222', { date: '2026-10-04' });
env.saveNote(ID.x, '待刪一', 'pub', undefined, 'x', { date: '2026-10-05' });
env.saveNote('20261006-x2', '待刪二', 'pub', undefined, 'y', { date: '2026-10-06' });
assert.ok(
  env.call('saveBoard', {
    topic: 'pub',
    board: {
      nodes: [{ id: 'n1', type: 'text', text: '節點', x: 0, y: 0, width: 200, height: 80 }],
      edges: []
    }
  }).ok
);
const rowOf = id => env.store.getIndexRows().find(r => r.id === id);
const hasCjk = s => /[一-鿿]/.test(s);

(async () => {
  const browser = await chromium.launch();
  try {
    const vctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } });
    const v = await newPage(vctx, env, VISITOR);
    await t('訪客：列表只有公開筆記；私人標題完全不在畫面與資料中；沒有發布檢查、新增按鈕', async () => {
      const txt = await v.locator('#main').textContent();
      assert.ok(txt.includes('資料庫入門') && txt.includes('聯絡方式'));
      assert.ok(!txt.includes('機密日記'));
      assert.ok(
        !(
          await v.evaluate(() => JSON.stringify(VaultUI.S.items) + JSON.stringify(VaultUI.S.topics))
        ).includes('機密') && !(await v.evaluate(() => JSON.stringify(VaultUI.S.topics))).includes('私人本')
      );
      assert.strictEqual(await v.locator('#btnPublish').count(), 0);
      assert.strictEqual(await v.getByRole('button', { name: '新增' }).count(), 0);
    });
    await t(
      '內容語言篩選：中文隱藏英文筆記、English 隱藏中文、全部都顯示；未指定語言的永遠顯示；書櫃數量跟著變',
      async () => {
        await v.selectOption('#clang', 'zh');
        let txt = await v.locator('#main').textContent();
        assert.ok(txt.includes('資料庫入門') && !txt.includes('Database Basics'));
        await v.selectOption('#clang', 'en');
        txt = await v.locator('#main').textContent();
        assert.ok(txt.includes('Database Basics') && !txt.includes('資料庫入門') && txt.includes('待刪一'));
        await v.selectOption('#clang', '');
        txt = await v.locator('#main').textContent();
        assert.ok(txt.includes('Database Basics') && txt.includes('資料庫入門'));
      }
    );
    await t(
      '開筆記：網址換成 #/note/ID；訪客閱讀版型（窄欄）；翻譯連結雙向；點翻譯後「上一頁」回到原筆記',
      async () => {
        await v.locator('#main a.item', { hasText: '資料庫入門' }).click();
        await v.waitForSelector('#main .md');
        assert.strictEqual(await v.evaluate(() => location.hash), '#/note/' + ID.a);
        assert.ok(await v.evaluate(() => document.getElementById('main').classList.contains('public-read')));
        assert.ok(
          await v.evaluate(
            () => document.querySelector('#main .md').getBoundingClientRect().width <= 40 * 16 + 2
          )
        );
        await v.locator('.trans button', { hasText: 'Database Basics' }).click();
        await v.waitForFunction(
          id => VaultUI.S.note && VaultUI.S.note.id === id && VaultUI.S.note.data,
          ID.b
        );
        assert.strictEqual(await v.evaluate(() => location.hash), '#/note/' + ID.b);
        assert.ok(await v.locator('.trans button', { hasText: '資料庫入門' }).count());
        await v.goBack();
        await v.waitForFunction(id => VaultUI.S.note && VaultUI.S.note.id === id, ID.a);
        assert.ok((await v.locator('#main').textContent()).includes('內容 A'));
        await v.goForward();
        await v.waitForFunction(id => VaultUI.S.note && VaultUI.S.note.id === id, ID.b);
      }
    );
    await t('指向私人筆記的連結：訪客只看到純文字，沒有連結、沒有私人標題', async () => {
      await v.locator('.trans button', { hasText: '資料庫入門' }).click();
      await v.waitForSelector('#main .md');
      const html = await v.locator('#main .md').innerHTML();
      assert.ok(!html.includes(ID.s) && !html.includes('機密'));
    });
    await t('上一篇／下一篇：同主題依日期；點了會換筆記；語言篩選套用', async () => {
      await v.waitForSelector('#pn-next');
      await v.locator('#pn-next').click();
      await v.waitForFunction(id => VaultUI.S.note && VaultUI.S.note.id === id && VaultUI.S.note.data, ID.b);
      assert.ok(await v.locator('#pn-prev').count());
      await v.selectOption('#clang', 'zh');
      await v.locator('#pn-prev').click();
      await v.waitForFunction(id => VaultUI.S.note && VaultUI.S.note.id === id, ID.a);
      assert.ok(
        await v
          .locator('#pn-next')
          .textContent()
          .then(s => s.includes('聯絡方式')),
        '中文篩選下一篇應跳過英文'
      );
      await v.selectOption('#clang', '');
    });
    await t('網址 hash 直接指定：改 hash 能開筆記、開主題、回列表；不合法 id 被忽略', async () => {
      await v.evaluate(id => {
        location.hash = '#/note/' + id;
      }, ID.c);
      await v.waitForFunction(id => VaultUI.S.note && VaultUI.S.note.id === id && VaultUI.S.note.data, ID.c);
      await v.evaluate(() => {
        location.hash = '#/topic/pub';
      });
      await v.waitForFunction(() => !VaultUI.S.note && VaultUI.S.f.topic === 'pub');
      await v.evaluate(() => {
        location.hash = '#/';
      });
      await v.waitForFunction(() => !VaultUI.S.note && !VaultUI.S.f.topic);
      await v.evaluate(() => {
        location.hash = '#/note/not-an-id';
      });
      await v.waitForTimeout(100);
      assert.ok(await v.evaluate(() => !VaultUI.S.note));
    });
    await v.close();

    await t(
      '伺服器注入的分享參數（?note=&lang=）：直接開該筆記、語言篩選生效；有分享連結面板可複製',
      async () => {
        const p = await newPage(vctx, env, VISITOR, {
          route: { note: ID.a, topic: '', lang: 'zh', base: 'https://script.google.com/macros/s/AKxyz/exec' }
        });
        await p.waitForFunction(
          id => VaultUI.S.note && VaultUI.S.note.id === id && VaultUI.S.note.data,
          ID.a
        );
        assert.strictEqual(await p.locator('#clang').inputValue(), 'zh');
        await p.locator('#share-btn').click();
        const url = await p.locator('#share-url').inputValue();
        assert.strictEqual(url, 'https://script.google.com/macros/s/AKxyz/exec?note=' + ID.a + '&lang=zh');
        assert.deepStrictEqual(p.errors, []);
        await p.close();
      }
    );
    await t('分享參數指向私人筆記：只顯示「找不到」，與不存在的筆記相同，不洩漏存在與否', async () => {
      const p = await newPage(vctx, env, VISITOR, { route: { note: ID.s, topic: '', lang: '', base: '' } });
      await p.waitForFunction(() => VaultUI.S.note && (VaultUI.S.note.error || VaultUI.S.note.data));
      const a = await p.locator('#main').textContent();
      const q = await newPage(vctx, env, VISITOR, {
        route: { note: '20269999-zz', topic: '', lang: '', base: '' }
      });
      await q.waitForFunction(() => VaultUI.S.note && (VaultUI.S.note.error || VaultUI.S.note.data));
      assert.strictEqual(a, await q.locator('#main').textContent());
      assert.ok(!a.includes('機密') && !a.includes('祕密'));
      assert.strictEqual(await p.locator('#share-btn').count(), 0);
      await p.close();
      await q.close();
    });

    const octx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } });
    const o = await newPage(octx, env, OWNER);
    await t('發布檢查：摘要與訪客一致（不含私人筆記）；公開主題數正確', async () => {
      await o.locator('#btnPublish').click();
      await o.waitForSelector('#pub-sum');
      const s = await o.locator('#pub-sum').textContent();
      assert.ok(s.includes('共 6 則') && s.includes('5 則'), s);
      const list = await o.locator('#pub-list').textContent();
      assert.ok(list.includes('聯絡方式') && !list.includes('機密日記'));
      assert.ok(o.calls.previewPublic >= 1);
    });
    await t(
      '個資掃描：列出測試手機與 Email（含程式碼區塊標記）；私人筆記內容不被掃描；只顯示警告可篩選',
      async () => {
        await o.locator('#pub-scan').click();
        await o.waitForFunction(() => /掃描完成/.test(document.getElementById('pub-prog').textContent));
        const row = o.locator('.pubrow', { hasText: '聯絡方式' });
        const badges = await row.locator('.pii-badge').allTextContents();
        assert.ok(
          badges.some(b => b.includes('手機')) && badges.some(b => b.includes('Email ×2')),
          badges.join('|')
        );
        await row.locator('[data-act=detail]').click();
        const d = await row.locator('.pii-list').textContent();
        assert.ok(
          d.includes('0912-345-678') &&
            d.includes('test@example.com') &&
            d.includes('dev@example.org') &&
            d.includes('程式碼區塊'),
          d
        );
        assert.strictEqual(
          await o.locator('.pubrow', { hasText: '資料庫入門' }).locator('.pii-badge').count(),
          0
        );
        assert.strictEqual(o.calls.previewNote, 5); // 5 則公開；私人那則沒被讀
        await o.locator('#pub-only').check();
        assert.strictEqual(await o.locator('.pubrow').count(), 1);
        await o.locator('#pub-only').uncheck();
      }
    );
    await t('訪客視角預覽：顯示的是訪客版內容（私人連結已去除）', async () => {
      const row = o.locator('.pubrow', { hasText: '資料庫入門' });
      await row.locator('[data-act=prev]').click();
      await o.waitForSelector('#vprev .md');
      const html = await o.locator('#vprev').innerHTML();
      assert.ok(html.includes('內容 A') && !html.includes(ID.s) && !html.includes('機密'));
      assert.ok(o.calls.previewNote >= 6);
      await row.locator('[data-act=prev]').click();
      assert.strictEqual(await o.locator('#vprev').count(), 0);
    });
    await t('設為私人：立刻從清單消失，訪客真的看不到；其他筆記不受影響', async () => {
      await o.locator('.pubrow', { hasText: '聯絡方式' }).locator('[data-act=priv]').click();
      await o.waitForSelector('#pub-msg');
      assert.strictEqual(rowOf(ID.c).public, false);
      assert.strictEqual(env.call('getNote', { id: ID.c }, VISITOR).ok, false);
      assert.strictEqual(await o.locator('.pubrow', { hasText: '聯絡方式' }).count(), 0);
      assert.ok(await o.locator('.pubrow', { hasText: '資料庫入門' }).count());
    });
    await t('在編輯器開啟：能看到語言與 translation_of 欄位，存檔後保留', async () => {
      await o.locator('.pubrow', { hasText: 'Database Basics' }).locator('[data-act=edit]').click();
      await o.waitForSelector('#f-tr');
      assert.strictEqual(await o.locator('#f-tr').inputValue(), ID.a);
      assert.strictEqual(await o.locator('#f-lang').inputValue(), 'en');
      await o.locator('#f-title').fill('Database Basics 2');
      await o.getByRole('button', { name: '儲存' }).first().click();
      await o.waitForFunction(() => !VaultUI.S.edit || VaultUI.S.note);
      await o.waitForTimeout(200);
      assert.strictEqual(rowOf(ID.b).translationOf, ID.a);
      assert.strictEqual(rowOf(ID.b).title, 'Database Basics 2');
    });
    await t('translation_of 填錯：後端拒絕並說明原因', async () => {
      const r = env.call('saveNote', {
        id: ID.x,
        text: H.fm(ID.x, '待刪一', 'pub', undefined, 'x', { translation_of: 'bad id' }),
        baseUpdatedAt: env.call('getNote', { id: ID.x }).updatedAt
      });
      assert.strictEqual(r.ok, false);
    });
    await t('批次刪除：未確認不送出；確認後移到垃圾桶、索引移除、失敗者保留選取', async () => {
      await o.evaluate(() => {
        const S = VaultUI.S;
        S.pub = null;
        S.edit = null;
        S.note = null;
        S.f.topic = '';
        VaultUI.render();
      });
      await o.waitForSelector('#b-toggle');
      await o.locator('#b-toggle').click();
      await o.locator('#main .list li', { hasText: '待刪一' }).locator('a').click();
      await o.locator('#main .list li', { hasText: '待刪二' }).locator('a').click();
      await o.locator('#b-del').click();
      await o.waitForSelector('#b-del-confirm');
      const c = await o.locator('#b-del-confirm').textContent();
      assert.ok(c.includes('2 則') && c.includes('待刪一') && c.includes('垃圾桶'), c);
      assert.ok(!o.calls.deleteNotes);
      await o.getByRole('button', { name: '取消' }).last().click();
      assert.strictEqual(await o.locator('#b-del-confirm').count(), 0);
      assert.ok(!o.calls.deleteNotes);
      await o.locator('#b-del').click();
      await o.locator('#b-del-ok').click();
      await o.waitForSelector('#b-msg');
      assert.ok((await o.locator('#b-msg').textContent()).includes('已刪除 2 則'));
      assert.strictEqual(o.calls.deleteNotes, 1);
      assert.ok(!rowOf(ID.x) && !rowOf('20261006-x2'));
      assert.strictEqual(await o.locator('#main .list li', { hasText: '待刪一' }).count(), 0);
      assert.strictEqual(await o.locator('#b-sum').textContent(), '已選 0 則');
      assert.strictEqual(await o.locator('#b-del').isDisabled(), true);
    });
    assert.deepStrictEqual(o.errors, []);
    await o.close();

    await t('英文介面：發布檢查與批次刪除的按鈕、說明都沒有殘留中文（筆記標題除外）', async () => {
      const ectx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
      const e = await newPage(ectx, env, OWNER, { lang: 'en-US' });
      await e.locator('#btnPublish').click();
      await e.waitForSelector('#pub-sum');
      await e.locator('#pub-scan').click();
      await e.waitForFunction(() => /Scan complete/.test(document.getElementById('pub-prog').textContent));
      const texts = await e.evaluate(() =>
        Array.from(document.querySelectorAll('#main button, #main p, #main h2, #main label')).map(
          n => n.textContent
        )
      );
      const bad = texts.filter(s => hasCjk(s));
      assert.deepStrictEqual(bad, [], bad.join('|'));
      await e.locator('#pub-back').click();
      await e.locator('#b-toggle').click();
      await e.locator('#main .list li a').first().click();
      await e.locator('#b-del').click();
      const c = await e.locator('#b-del-confirm').textContent();
      assert.ok(/Delete these notes/.test(c) && /Drive trash/.test(c), c);
      const sel = await e.evaluate(() =>
        Array.from(document.querySelectorAll('#clang option')).map(o => o.textContent)
      );
      assert.deepStrictEqual(sel, ['All languages', 'Chinese', 'English']);
      assert.deepStrictEqual(e.errors, []);
      await ectx.close();
    });

    await t('手機 390px：三種檢視都能讀；沒有橫向捲動；公開畫布唯讀（沒有編輯工具）', async () => {
      const mctx = await browser.newContext({
        locale: 'zh-TW',
        viewport: { width: 390, height: 800 },
        hasTouch: true,
        isMobile: true
      });
      const m = await newPage(mctx, env, VISITOR);
      const noScroll = async what =>
        assert.ok(
          await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
          what + ' 橫向捲動 ' + (await m.evaluate(() => document.documentElement.scrollWidth))
        );
      await noScroll('列表');
      const tabs = m.locator('[role=tab], .vtab');
      const names = await tabs.allTextContents();
      assert.ok(names.length >= 3, names.join('|'));
      for (let i = 0; i < names.length; i++) {
        await tabs.nth(i).click();
        await m.waitForTimeout(150);
        await noScroll(names[i]);
        assert.ok((await m.locator('#main').textContent()).length > 10, names[i]);
      }
      await m.evaluate(id => VaultUI.openNote(id), ID.a);
      await m.waitForSelector('#main .md');
      await noScroll('筆記');
      await m.evaluate(() => {
        VaultUI.S.note = null;
        VaultUI.openCanvas('pub');
      });
      await m.waitForSelector('.cv-view');
      await m.waitForSelector('.cv-node', { state: 'attached' });
      await noScroll('畫布');
      assert.strictEqual(await m.locator('.cv-view.edit').count(), 0, '訪客畫布唯讀'); // 觸控平移／縮放另由 canvas_e2e 的 390px 案例驗證
      assert.strictEqual(env.call('getBoard', { topic: 'pub' }, VISITOR).board.nodes.length, 1);
      assert.deepStrictEqual(m.errors, []);
      await mctx.close();
    });
  } finally {
    await browser.close();
  }
  console.log('\nP4 端對端：' + H.count() + ' 項全部通過');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
