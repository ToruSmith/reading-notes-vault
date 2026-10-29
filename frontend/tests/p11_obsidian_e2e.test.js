// P11 端對端：[[ 自動完成（含建立新筆記）、Ctrl+K 快速切換、編輯即時預覽、畫布文字卡轉筆記
const H = require('./harness');
const { chromium, assert, OWNER, VISITOR, makeEnv, newPage, settle, t } = H;
const env = makeEnv();
env.store.saveTopic({ id: 'pub', title: '公開本', defaultPublic: true });
env.saveNote('20261020-aa01', '原子習慣', 'pub', true, '關於習慣');
env.saveNote('20261021-aa02', '習慣迴圈', 'pub', true, '提示、渴望');
env.saveNote('20261022-aa03', '深度工作', 'pub', true, '專注');
assert.ok(
  env.call('saveBoard', {
    topic: 'pub',
    board: {
      nodes: [
        { id: 'A', type: 'text', text: '# 便利貼標題\n內容 **重點**', x: 0, y: 0, width: 240, height: 120 },
        { id: 'B', type: 'text', text: '另一張', x: 400, y: 0, width: 240, height: 120 }
      ],
      edges: [{ id: 'E', fromNode: 'A', toNode: 'B' }]
    }
  }).ok
);
const notes = () => env.store.getIndexRows();

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('vault-cvzoomclick', '0');
      } catch (e) {}
    });
    const o = await newPage(ctx, env, OWNER);
    await settle(o);

    await t(
      '[[ 自動完成：打 [[習慣 出現兩則相關筆記（標題開頭的排前面）；↓ Enter 插入 [[id]]；Esc 關閉',
      async () => {
        await o.locator('#tools button', { hasText: /^新增$/ }).click();
        await o.waitForSelector('textarea.body');
        await o.fill('#f-title', '測試筆記');
        await o.locator('textarea.body').click();
        await o.keyboard.type('見 [[習慣');
        await o.waitForSelector('#ac-pop');
        const items = await o.locator('#ac-pop .ac-it .t').allTextContents();
        assert.deepStrictEqual(items.slice(0, 2), ['習慣迴圈', '原子習慣']);
        assert.ok(items[items.length - 1].includes('建立新筆記'));
        await o.keyboard.press('ArrowDown');
        await o.keyboard.press('Enter');
        assert.strictEqual(await o.inputValue('textarea.body'), '見 [[20261020-aa01]]');
        assert.strictEqual(await o.locator('#ac-pop').count(), 0);
        await o.keyboard.type(' [[深');
        await o.waitForSelector('#ac-pop');
        await o.keyboard.press('Escape');
        assert.strictEqual(await o.locator('#ac-pop').count(), 0);
        assert.strictEqual(await o.inputValue('textarea.body'), '見 [[20261020-aa01]] [[深', 'Esc 不改內容');
      }
    );

    await t('[[ 建立新筆記：選「＋ 建立新筆記」→ 雲端多一則同主題筆記，內文插入它的連結', async () => {
      const n0 = notes().length;
      await o.fill('textarea.body', '');
      await o.locator('textarea.body').click();
      await o.keyboard.type('[[全新的想法');
      await o.waitForSelector('#ac-pop');
      await o.locator('#ac-pop .ac-it', { hasText: '建立新筆記' }).click();
      await o.waitForFunction(() =>
        /\[\[\d{8}-[a-z0-9]+\]\]/.test(document.querySelector('textarea.body').value)
      );
      assert.strictEqual(notes().length, n0 + 1);
      const made = notes().find(r => r.title === '全新的想法');
      assert.ok(made);
      assert.strictEqual(await o.inputValue('textarea.body'), '[[' + made.id + ']]');
    });

    await t(
      '即時預覽：寬螢幕預設並排，打字後預覽更新（連結顯示為標題）；可切「只編輯」並被記住',
      async () => {
        await o.fill('textarea.body', '# 大標\n連到 [[20261022-aa03]]');
        await o.waitForFunction(() => /大標/.test(document.querySelector('#f-preview').textContent));
        assert.ok((await o.locator('#f-preview').textContent()).includes('深度工作'));
        assert.ok(await o.locator('#f-preview').isVisible());
        await o.locator('.ed-seg button', { hasText: '只編輯' }).click();
        assert.strictEqual(await o.locator('#f-preview').isVisible(), false);
        assert.strictEqual(await o.evaluate(() => localStorage.getItem('vault-edpv')), 'edit');
        await o.locator('.ed-seg button', { hasText: '並排預覽' }).click();
        assert.ok(await o.locator('#f-preview').isVisible());
        await o.locator('button', { hasText: '捨棄草稿並離開' }).click();
        await settle(o);
      }
    );

    await t('Ctrl+K：開啟後輸入關鍵字找筆記，Enter 開啟；可找主題、畫布與動作；Esc 關閉', async () => {
      await o.keyboard.press('Control+k');
      await o.waitForSelector('#qk-in');
      await o.keyboard.type('深度');
      assert.ok((await o.locator('#qk-list .qk-it').first().textContent()).includes('深度工作'));
      await o.keyboard.press('Enter');
      await o.waitForFunction(() =>
        /深度工作/.test(document.querySelector('#main h2') && document.querySelector('#main h2').textContent)
      );
      assert.strictEqual(await o.locator('#qk').count(), 0);
      await o.keyboard.press('Control+k');
      await o.keyboard.type('公開本 畫布');
      await o.waitForTimeout(50);
      const first = await o.locator('#qk-list .qk-it').first().textContent();
      assert.ok(first.includes('畫布') && first.includes('公開本'), first);
      await o.keyboard.press('Enter');
      await o.waitForSelector('.cv-view');
      await settle(o);
      await o.keyboard.press('Control+k');
      await o.keyboard.type('閱讀模式');
      await o.waitForTimeout(50);
      assert.ok((await o.locator('#qk-list .qk-it').first().textContent()).includes('切換到閱讀模式'));
      await o.keyboard.press('Escape');
      assert.strictEqual(await o.locator('#qk').count(), 0);
      assert.ok(await o.locator('#btnQuick').isVisible(), '頁首也有按鈕');
    });

    await t(
      '文字卡轉筆記：建立同主題筆記（標題取第一個標題、內文原樣），卡片變筆記卡、同一個 id、連線保留，可儲存',
      async () => {
        const n0 = notes().length;
        await o.evaluate(() => {
          const c = VaultUI.canvasState();
          c.sel = { A: 1 };
          c.selEdge = null;
          VaultUI.cv.syncInspector();
          VaultUI.cv.draw();
        });
        await settle(o);
        await o.locator('#cv-tonote').click();
        await o.waitForFunction(
          () => VaultUI.canvasState().board.nodes.find(n => n.id === 'A').type === 'file'
        );
        const made = notes().find(r => r.title === '便利貼標題');
        assert.ok(made && notes().length === n0 + 1 && made.topic === 'pub');
        const nd = await o.evaluate(() => VaultUI.canvasState().board.nodes.find(n => n.id === 'A'));
        assert.strictEqual(nd.file, 'notes/' + made.id + '.md');
        assert.strictEqual(nd.text, undefined);
        assert.strictEqual(await o.evaluate(() => VaultUI.canvasState().board.edges.length), 1);
        const body = env.call('getNote', { id: made.id });
        assert.ok(body.ok && body.body.includes('內容 **重點**'));
        await o.waitForFunction(() =>
          /便利貼標題/.test(document.querySelector('.cv-node[data-id="A"]').textContent)
        );
        await o.locator('.cv-view').focus();
        await o.keyboard.press('Control+s');
        await o.waitForFunction(() => !VaultUI.canvasState().dirty);
      }
    );

    await t('訪客：Ctrl+K 只有公開內容、沒有新增／模式動作；沒有轉成筆記入口', async () => {
      const v = await newPage(ctx, env, VISITOR, { reading: true });
      await settle(v);
      await v.keyboard.press('Control+k');
      await v.waitForSelector('#qk-in');
      const txt = await v.locator('#qk-list').textContent();
      assert.ok(!txt.includes('新增筆記') && !txt.includes('切換到'));
      await v.close();
    });
    console.log('\nP11 端對端：' + H.count() + ' 項全部通過');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n失敗：', e.message);
  process.exit(1);
});
