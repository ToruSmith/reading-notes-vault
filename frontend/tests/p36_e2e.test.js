// P3.6 端對端：多選與批次修改主題／公開
const H = require('./harness');
const { chromium, assert, OWNER, VISITOR, makeEnv, newPage, t } = H;
const env = makeEnv();
env.store.saveTopic({ id: 'priv', title: '私人本', defaultPublic: false });
env.store.saveTopic({ id: 'pub', title: '公開本', defaultPublic: true });
env.store.saveTopic({ id: 'misc', title: '雜項', defaultPublic: false });
for (let i = 1; i <= 5; i++)
  env.saveNote('20261024-m00' + i, '批次' + i, 'priv', undefined, '內文' + i + ' [[20261024-m001]]', {
    date: '2026-10-0' + i
  });
env.saveNote('20261024-m006', '已公開的', 'pub', undefined, 'x');
const rowOf = id => env.store.getIndexRows().find(r => r.id === id);
const visitorSees = id => env.call('getNote', { id }, VISITOR).ok;

(async () => {
  const browser = await chromium.launch();
  try {
    const bctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } });
    const p = await newPage(bctx, env, OWNER);
    const row = txt => p.locator('#main .list li', { hasText: txt });
    await t(
      '多選：開啟後點列不會開筆記而是勾選；顯示已選數；全選、清除選取可用；套用在未選取或未選動作時停用',
      async () => {
        await p.locator('#b-toggle').click();
        await p.waitForSelector('.selbar');
        assert.ok(await p.locator('#b-go').isDisabled());
        await row('批次1').locator('a').click();
        await row('批次2').locator('a').click();
        assert.ok(await p.locator('#main .back, #main h2').first().isVisible());
        assert.strictEqual(await p.locator('#b-sum').textContent(), '已選 2 則');
        assert.ok(await p.locator('#b-go').isDisabled(), '還沒選動作');
        await p.selectOption('#b-topic', 'misc');
        assert.ok(await p.locator('#b-go').isEnabled());
        await p.locator('#b-none').click();
        assert.strictEqual(await p.locator('#b-sum').textContent(), '已選 0 則');
        assert.ok(await p.locator('#b-go').isDisabled());
        await p.locator('#b-all').click();
        assert.strictEqual(await p.locator('#b-sum').textContent(), '已選 6 則');
        await p.locator('#b-none').click();
        assert.ok(!p.calls.updateNotes);
      }
    );
    await t(
      '批次移到「雜項」（私人→私人）：不需確認，直接完成；內文與連結保留；列表即時更新並取消已處理的選取',
      async () => {
        await row('批次1').locator('a').click();
        await row('批次2').locator('a').click();
        await p.selectOption('#b-topic', 'misc');
        await p.locator('#b-go').click();
        await p.waitForSelector('#b-msg');
        assert.ok((await p.locator('#b-msg').textContent()).includes('已更新 2 則'));
        assert.strictEqual(p.calls.updateNotes, 1);
        assert.strictEqual(rowOf('20261024-m001').topic, 'misc');
        assert.strictEqual(rowOf('20261024-m002').topic, 'misc');
        assert.ok(env.call('getNote', { id: '20261024-m001' }).body.includes('內文1'));
        assert.strictEqual(await p.locator('#b-sum').textContent(), '已選 0 則');
        assert.strictEqual(await p.evaluate(() => VaultUI.S.byId['20261024-m001'].topic), 'misc');
      }
    );
    await t(
      '設為公開：先出現確認（列出數量與標題）；取消不送出任何請求；確認後才公開，訪客真的看得到',
      async () => {
        await row('批次3').locator('a').click();
        await row('批次4').locator('a').click();
        await p.selectOption('#b-pub', 'true');
        await p.locator('#b-go').click();
        await p.waitForSelector('#b-confirm');
        const txt = await p.locator('#b-confirm').textContent();
        assert.ok(txt.includes('2 則') && txt.includes('批次3'), txt);
        assert.strictEqual(p.calls.updateNotes, 1, '確認前不可送出');
        assert.strictEqual(visitorSees('20261024-m003'), false);
        await p.getByRole('button', { name: '取消' }).click();
        assert.strictEqual(await p.locator('#b-confirm').count(), 0);
        assert.strictEqual(p.calls.updateNotes, 1);
        await p.locator('#b-go').click();
        await p.locator('#b-confirm-ok').click();
        await p.waitForSelector('#b-msg');
        assert.strictEqual(p.calls.updateNotes, 2);
        assert.strictEqual(rowOf('20261024-m003').public, true);
        assert.strictEqual(visitorSees('20261024-m003'), true);
        assert.strictEqual(visitorSees('20261024-m005'), false);
        await p.selectOption('#b-pub', '');
      }
    );
    await t('移到公開主題也算變成公開，同樣要確認；已經公開的不計入數量', async () => {
      await p.locator('#b-toggle').click();
      await p.locator('#b-toggle').click(); // 重置選取
      await row('批次5').locator('a').click();
      await row('已公開的').locator('a').click();
      await p.selectOption('#b-topic', 'pub');
      await p.locator('#b-go').click();
      await p.waitForSelector('#b-confirm');
      assert.ok((await p.locator('#b-confirm').textContent()).includes('1 則'));
      await p.locator('#b-confirm-ok').click();
      await p.waitForSelector('#b-msg');
      assert.strictEqual(rowOf('20261024-m005').topic, 'pub');
      assert.strictEqual(visitorSees('20261024-m005'), true);
      assert.ok((await p.locator('#b-msg').textContent()).includes('本來就一樣'));
    });
    await t('設為私人與「依主題預設」：不需確認；公開立即收回，訪客看不到', async () => {
      await p.locator('#b-toggle').click();
      await p.locator('#b-toggle').click();
      await p.selectOption('#b-topic', '');
      await p.selectOption('#b-pub', 'false');
      await row('批次3').locator('a').click();
      await p.locator('#b-go').click();
      await p.waitForSelector('#b-msg');
      assert.strictEqual(await p.locator('#b-confirm').count(), 0);
      assert.strictEqual(rowOf('20261024-m003').public, false);
      assert.strictEqual(visitorSees('20261024-m003'), false);
      await p.selectOption('#b-pub', 'null');
      await row('批次3').locator('a').click();
      await p.locator('#b-go').click();
      await p.waitForFunction(() => VaultUI.S.byId['20261024-m003'].public === null);
      assert.strictEqual(rowOf('20261024-m003').public, null);
    });
    await t('移到「未歸類」；部分失敗時：成功的取消選取，失敗的留在選取中並顯示原因，可重試', async () => {
      await p.locator('#b-toggle').click();
      await p.locator('#b-toggle').click();
      await p.selectOption('#b-pub', '');
      await p.selectOption('#b-topic', '__none__');
      await row('批次4').locator('a').click();
      await row('批次1').locator('a').click();
      env.call('deleteNote', { id: '20261024-m004' }); // 另一個視窗刪掉了它（前端索引還沒更新）
      await p.locator('#b-go').click();
      await p.waitForSelector('#b-err');
      assert.strictEqual(rowOf('20261024-m001').topic, '');
      assert.ok((await p.locator('#b-msg').textContent()).includes('已更新 1 則'));
      assert.ok((await p.locator('#b-err').textContent()).includes('1 則沒有成功'));
      assert.strictEqual(
        await p.evaluate(() => VaultUI.S.byId['20261024-m004'] === undefined),
        true,
        '重新載入後，已刪除的筆記不在索引'
      );
    });
    await t('多選在圖庫也能用；結束多選後恢復點擊開啟筆記；日曆沒有多選', async () => {
      await p.getByRole('tab', { name: '圖庫' }).click();
      await p.waitForSelector('.gal .card .selbox');
      await p.locator('.gal .card', { hasText: '批次2' }).click();
      assert.strictEqual(await p.locator('#b-sum').textContent(), '已選 1 則');
      await p.getByRole('tab', { name: '日曆' }).click();
      await p.waitForSelector('.cal');
      assert.strictEqual(await p.locator('#b-toggle').count(), 0);
      await p.getByRole('tab', { name: '列表' }).click();
      await p.locator('#b-toggle').click();
      await p.getByText('批次2').first().click();
      await p.waitForSelector('.md');
    });
    await t('訪客：沒有多選按鈕；硬呼叫 updateNotes 被拒絕且不改資料', async () => {
      const v = await newPage(bctx, env, VISITOR);
      await v.waitForSelector('#main');
      assert.strictEqual(await v.locator('#b-toggle').count(), 0);
      const before = JSON.stringify(env.store.getIndexRows());
      const r = await v.evaluate(
        () =>
          new Promise(res =>
            google.script.run
              .withSuccessHandler(res)
              .api('updateNotes', { ids: ['20261024-m002'], public: true, confirmPublic: true })
          )
      );
      assert.strictEqual(r.ok, false);
      assert.strictEqual(JSON.stringify(env.store.getIndexRows()), before);
      await v.close();
    });
    await t('英文介面：多選列與確認沒有殘留中文', async () => {
      const bc = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
      const e = await newPage(bc, env, OWNER, { lang: 'en-US' });
      await e.locator('#b-toggle').click();
      await e.locator('#b-all').click();
      await e.selectOption('#b-pub', 'true');
      await e.locator('#b-go').click();
      await e.waitForSelector('#b-confirm');
      const left = await e.evaluate(() => {
        const re = /[　-〿一-鿿＀-￯]/,
          out = [];
        document.querySelectorAll('.selbar *').forEach(x => {
          if (x.children.length === 0 && re.test(x.textContent)) out.push(x.textContent);
        });
        document.querySelectorAll('.selbar [aria-label]').forEach(x => {
          if (re.test(x.getAttribute('aria-label'))) out.push(x.getAttribute('aria-label'));
        });
        document.querySelectorAll('.selbar option').forEach(x => {
          if (re.test(x.textContent) && !/雜項|公開本|私人本/.test(x.textContent)) out.push(x.textContent);
        });
        return out;
      });
      const user = ['批次', '已公開的', '雜項', '公開本', '私人本'];
      assert.deepStrictEqual(
        left.filter(s => !user.some(u => s.indexOf(u) >= 0)),
        []
      );
      await e.close();
      await bc.close();
    });
    await t('沒有 JavaScript 錯誤', async () => {
      assert.deepStrictEqual(p.errors, []);
    });
    console.log('\nP3.6 端對端：' + H.count() + ' 項全部通過');
  } catch (e) {
    console.error(
      '\n失敗：',
      e.stack
        .split('\n')
        .filter(l => /p36|Error|^\s*[+-]/.test(l))
        .slice(0, 8)
        .join('\n')
    );
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
