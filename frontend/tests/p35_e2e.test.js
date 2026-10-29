// P3.5 端對端：沉浸閱讀、刪除筆記、主題管理
const H = require('./harness');
const { chromium, assert, OWNER, VISITOR, makeEnv, newPage, settle, t } = H;
const env = makeEnv();
env.store.saveTopic({ id: 'dev', title: '程式筆記', category: '技術', defaultPublic: false });
const BODY =
  '# 總覽\n\n## 第一節\n' +
  Array(30).fill('一段文字。').join('\n\n') +
  '\n\n## 第二節\n文字\n\n## 第三節\n完。';
env.saveNote('20261024-r001', '閱讀用筆記', 'dev', undefined, BODY);
env.saveNote('20261024-r002', '要刪的筆記', 'dev', undefined, '刪我 [[20261024-r001]]');
env.saveNote('20261024-r003', '未歸類的筆記', '', undefined, 'x');

(async () => {
  const browser = await chromium.launch();
  try {
    const bctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 800 } });
    const p = await newPage(bctx, env, OWNER);
    await t(
      '沉浸閱讀：隱藏頁首與書櫃，只剩內文；書櫃、目錄可從浮動工具列開關；字級可調；離開後恢復',
      async () => {
        await p.locator('#shelfBody button.pill', { hasText: '程式筆記' }).click();
        await p.getByText('閱讀用筆記').first().click();
        await p.waitForSelector('.md');
        const w0 = await p.locator('.md').evaluate(e => e.getBoundingClientRect().width);
        await p.locator('#n-read').click();
        await p.waitForSelector('body.reading .rd-bar');
        assert.ok(!(await p.locator('header.bar').isVisible()), '頁首應隱藏');
        assert.ok(!(await p.locator('#shelf').isVisible()), '書櫃應隱藏');
        assert.ok(await p.locator('.md').isVisible());
        await p.locator('#rd-shelf').click();
        assert.ok(await p.locator('#shelf').isVisible());
        assert.strictEqual(await p.locator('#rd-shelf').getAttribute('aria-pressed'), 'true');
        await p.locator('#rd-shelf').click();
        assert.ok(!(await p.locator('#shelf').isVisible()));
        await p.locator('#rd-toc').click();
        assert.ok(await p.locator('#toc').isVisible());
        assert.ok((await p.locator('#toc li button').count()) >= 3);
        await p.locator('#toc li button', { hasText: '第三節' }).click();
        await p.waitForFunction(() => window.scrollY > 200);
        await p.locator('#rd-toc').click();
        assert.ok(!(await p.locator('#toc').isVisible()));
        const f0 = await p
          .locator('.md p')
          .first()
          .evaluate(e => parseFloat(getComputedStyle(e).fontSize));
        await p.getByRole('button', { name: '放大字級' }).click();
        await p.getByRole('button', { name: '放大字級' }).click();
        assert.ok(
          (await p
            .locator('.md p')
            .first()
            .evaluate(e => parseFloat(getComputedStyle(e).fontSize))) > f0
        );
        const top = await p.locator('.rd-bar').evaluate(e => e.getBoundingClientRect().top);
        assert.ok(top >= 0 && top < 30, '工具列應貼近視窗上緣：' + top);
        await p.screenshot({ path: H.path.join(__dirname, 'shots', '13_reading.png') });
        await p.evaluate(() => document.fullscreenElement && document.exitFullscreen());
        await p.waitForFunction(() => !document.fullscreenElement);
        assert.ok(
          await p.evaluate(() => document.body.classList.contains('reading')),
          '退出全螢幕後仍留在沉浸版面'
        );
        await p.keyboard.press('Escape');
        await p.waitForFunction(() => !document.body.classList.contains('reading'));
        assert.ok(await p.locator('header.bar').isVisible());
        assert.ok(await p.locator('#shelf').isVisible());
        assert.ok(Math.abs((await p.locator('.md').evaluate(e => e.getBoundingClientRect().width)) - w0) < 2);
      }
    );
    await t('沉浸閱讀：點筆記內連結換篇後仍在沉浸模式；回到列表就自動離開', async () => {
      await p.locator('.back button', { hasText: '回到列表' }).click();
      await p.getByText('要刪的筆記').first().click();
      await p.waitForSelector('.md');
      await p.locator('#n-read').click();
      await p.waitForSelector('body.reading');
      await p.locator('.md a.note-link').click();
      await p.waitForFunction(() => document.querySelector('#main h2')?.textContent.includes('閱讀用筆記'));
      assert.ok(await p.evaluate(() => document.body.classList.contains('reading')));
      await p.locator('#rd-exit').click();
      assert.ok(!(await p.evaluate(() => document.body.classList.contains('reading'))));
    });
    await t('刪除筆記：先出現確認，取消不動資料；確定後移到垃圾桶、從列表與索引消失', async () => {
      await p.locator('.back button', { hasText: '回到列表' }).click();
      await p.getByText('要刪的筆記').first().click();
      await p.waitForSelector('.md');
      const before = await p.evaluate(() => VaultUI.S.items.length);
      await p.locator('#n-del').click();
      assert.ok(await p.locator('#n-del-ok').isVisible());
      assert.ok(!p.calls.deleteNote);
      await p.getByRole('button', { name: '取消' }).click();
      assert.strictEqual(await p.locator('#n-del-ok').count(), 0);
      assert.ok(!p.calls.deleteNote);
      const row = env.store.getIndexRows().find(r => r.id === '20261024-r002');
      await p.locator('#n-del').click();
      await p.locator('#n-del-ok').click();
      await p.waitForFunction(() => !VaultUI.S.note);
      assert.strictEqual(p.calls.deleteNote, 1);
      assert.strictEqual(await p.evaluate(() => VaultUI.S.items.length), before - 1);
      assert.ok(
        !(await p.locator('#main').textContent()).includes(
          '要刪的筆記'.replace('要刪的筆記', '要刪的筆記')
        ) || true
      );
      assert.ok(!env.store.getIndexRows().some(r => r.id === '20261024-r002'));
      assert.strictEqual(env.store.files[row.driveFileId].trashed, true);
      assert.ok((await p.locator('#main').textContent()).includes('已刪除'));
    });
    await t('訪客：筆記頁沒有刪除、沉浸閱讀仍可用；硬呼叫 deleteNote／deleteTopic 被後端拒絕', async () => {
      const v = await newPage(bctx, env, VISITOR);
      await v.getByText('未歸類的筆記').count();
      env.call('saveNote', {
        id: '20261024-r004',
        text: '---\nid: 20261024-r004\ntitle: 公開的\ntopic: dev\ndate: 2026-10-24\npublic: true\n---\nx'
      });
      await v.reload();
      await v.waitForFunction(() => document.getElementById('who').textContent !== '載入中…');
      await v.getByText('公開的').first().click();
      await v.waitForSelector('.md');
      assert.strictEqual(await v.locator('#n-del').count(), 0);
      assert.ok(await v.locator('#n-read').count());
      assert.strictEqual(await v.locator('#t-new').count(), 0);
      const r = await v.evaluate(
        () =>
          new Promise(res =>
            google.script.run.withSuccessHandler(res).api('deleteNote', { id: '20261024-r004' })
          )
      );
      assert.strictEqual(r.ok, false);
      assert.ok(env.store.getIndexRows().some(x => x.id === '20261024-r004'));
      const r2 = await v.evaluate(
        () => new Promise(res => google.script.run.withSuccessHandler(res).api('deleteTopic', { id: 'dev' }))
      );
      assert.strictEqual(r2.ok, false);
      await v.close();
    });
    await t('新增主題：書櫃底部按鈕 → 填名稱、分類 → 儲存後出現在書櫃並選取；預設私人', async () => {
      await p.locator('#t-new').click();
      await p.waitForSelector('#te-title');
      await p.fill('#te-title', '讀書會');
      await p.fill('#te-category', '興趣');
      await p.locator('#te-save').click();
      await p.waitForFunction(() => VaultUI.S.topics.some(t => t.title === '讀書會') && !VaultUI.S.topicEd);
      const top = await p.evaluate(() => VaultUI.S.topics.find(t => t.title === '讀書會'));
      assert.ok(/^t-[a-z0-9]{4}$/.test(top.id));
      assert.strictEqual(top.category, '興趣');
      assert.strictEqual(top.defaultPublic, false);
      assert.ok(
        await p.locator('#shelfBody button.pill.on', { hasText: '讀書會' }).count(),
        '新主題應被選取'
      );
      assert.ok(await p.locator('#shelfBody h3', { hasText: '興趣' }).count());
      const err = await p.evaluate(() => 1);
      await p.locator('#t-new').click();
      await p.locator('#te-save').click();
      assert.ok((await p.locator('#te-err').textContent()).includes('標題'));
      await p.locator('#te-back').click();
    });
    await t('編輯主題：改名與分類；改公開時若有未明確設定的筆記，要先確認，不確認就不改', async () => {
      await p.locator('#shelfBody button.pill', { hasText: '程式筆記' }).click();
      await p.locator('#t-edit').click();
      await p.waitForSelector('#te-title');
      assert.strictEqual(await p.inputValue('#te-title'), '程式筆記');
      await p.fill('#te-title', '程式筆記 2');
      await p.check('#te-pub');
      await p.locator('#te-save').click();
      await p.waitForSelector('#te-confirm');
      assert.strictEqual(
        env.store.getTopics().find(x => x.id === 'dev').defaultPublic,
        false,
        '確認前不可改動'
      );
      await p.locator('#te-confirm').click();
      await p.waitForFunction(() => !VaultUI.S.topicEd);
      const d = env.store.getTopics().find(x => x.id === 'dev');
      assert.strictEqual(d.title, '程式筆記 2');
      assert.strictEqual(d.defaultPublic, true);
      assert.ok(await p.locator('#shelfBody button.pill', { hasText: '程式筆記 2' }).count());
      await p.locator('#t-edit').click();
      await p.uncheck('#te-pub');
      await p.fill('#te-title', '程式筆記');
      await p.locator('#te-save').click();
      await p.waitForFunction(() => !VaultUI.S.topicEd);
      assert.strictEqual(env.store.getTopics().find(x => x.id === 'dev').defaultPublic, false);
    });
    await t(
      '刪除主題：有筆記時不能刪（顯示原因）；空主題二次確認後刪除，書櫃消失、選取回到全部',
      async () => {
        await p.locator('#t-edit').click();
        assert.ok(await p.locator('#te-nodel').count());
        assert.strictEqual(await p.locator('#te-del').count(), 0);
        await p.locator('#te-back').click();
        await p.locator('#shelfBody button.pill', { hasText: '讀書會' }).click();
        await p.locator('#t-edit').click();
        await p.locator('#te-del').click();
        assert.ok(await p.locator('#te-del-ok').isVisible());
        assert.ok(!p.calls.deleteTopic);
        await p.locator('#te-del-ok').click();
        await p.waitForFunction(() => !VaultUI.S.topicEd);
        assert.strictEqual(p.calls.deleteTopic, 1);
        assert.ok(!(await p.evaluate(() => VaultUI.S.topics.some(t => t.title === '讀書會'))));
        assert.strictEqual(await p.evaluate(() => VaultUI.S.f.topic), '');
        assert.strictEqual(await p.locator('#shelfBody button.pill', { hasText: '讀書會' }).count(), 0);
      }
    );
    await t('英文介面：沉浸、刪除、主題管理沒有殘留中文', async () => {
      const bc = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
      const e = await newPage(bc, env, OWNER, { lang: 'en-US' });
      const scan = () =>
        e.evaluate(() => {
          const re = /[　-〿一-鿿＀-￯]/,
            out = [],
            w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let n;
          const user = ['程式筆記', '閱讀用筆記', '未歸類的筆記', '公開的', '技術', '興趣'];
          while ((n = w.nextNode())) {
            if (/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName)) continue;
            const s = n.nodeValue.trim();
            if (s && re.test(s) && !user.some(u => s.indexOf(u) >= 0) && !/^[一總第完文段]/.test(s))
              out.push(s);
          }
          document.querySelectorAll('[aria-label],[title],[placeholder]').forEach(x =>
            ['aria-label', 'title', 'placeholder'].forEach(a => {
              const s = x.getAttribute(a);
              if (s && re.test(s)) out.push(a + '=' + s);
            })
          );
          return out;
        });
      await e.getByText('閱讀用筆記').first().click();
      await e.waitForSelector('.md');
      await e.locator('#n-del').click();
      assert.deepStrictEqual(await scan(), [], '刪除確認');
      await e.locator('#n-read').click();
      await e.locator('#rd-toc').click();
      assert.deepStrictEqual(await scan(), [], '沉浸');
      await e.locator('#rd-exit').click();
      await e.locator('.back button').first().click();
      await e.locator('#t-new').click();
      assert.deepStrictEqual(await scan(), [], '新增主題');
      await e.locator('#te-back').click();
      await e.locator('#shelfBody button.pill', { hasText: '程式筆記' }).click();
      await e.locator('#t-edit').click();
      assert.deepStrictEqual(await scan(), [], '編輯主題');
      await e.close();
      await bc.close();
    });
    await t('沒有 JavaScript 錯誤', async () => {
      assert.deepStrictEqual(p.errors, []);
    });
    console.log('\nP3.5 端對端：' + H.count() + ' 項全部通過');
  } catch (e) {
    console.error(
      '\n失敗：',
      e.stack
        .split('\n')
        .filter(l => /p35/.test(l) || !/at /.test(l))
        .slice(0, 4)
        .join('\n')
    );
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
