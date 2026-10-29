// P3 批次一端對端：目錄、語法高亮、全文索引快取
const H = require('./harness');
const { chromium, assert, OWNER, VISITOR, makeEnv, newPage, settle, t } = H;
const env = makeEnv();
env.store.saveTopic({ id: 'dev', title: '程式筆記', defaultPublic: false });
const BODY =
  '# 總覽\n簡介\n\n## SQL 範例\n```sql\nSELECT count(*) FROM t WHERE a = 1;\n```\n\n## JS 範例\n```js\nconst x = "<script>alert(1)</script>";\n```\n\n### 小節\n文字\n\n' +
  Array(60).fill('填充段落。').join('\n\n') +
  '\n\n## 結尾\n完。';
env.saveNote('20261024-d001', '含程式碼與目錄的筆記', 'dev', undefined, BODY);
env.saveNote('20261024-d002', '另一則', 'dev', undefined, '獨特詞彙ZEBRA出現在內文');
env.saveNote('20261024-d003', '第三則', 'dev', undefined, '沒有特別的內容');

(async () => {
  const browser = await chromium.launch();
  try {
    const bctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 800 } });
    let who = OWNER;
    const getWho = () => who;
    let p = await newPage(bctx, env, getWho);
    await t(
      '筆記頁：3 個以上標題出現目錄，點項目會捲到該標題；SQL、JS 區塊上色；程式碼裡的 <script> 只是文字',
      async () => {
        await p.locator('#shelfBody button.pill', { hasText: '程式筆記' }).click();
        await p.getByText('含程式碼與目錄的筆記').first().click();
        await p.waitForSelector('.md');
        assert.ok(await p.locator('details.toc').count());
        await p.locator('details.toc summary').click();
        const items = await p.locator('.toc li button').allTextContents();
        assert.deepStrictEqual(items, ['總覽', 'SQL 範例', 'JS 範例', '小節', '結尾']);
        assert.ok(await p.locator('.toc li.lv1').count());
        const y0 = await p.evaluate(() => window.scrollY);
        await p.locator('.toc li button', { hasText: '結尾' }).click();
        await p.waitForFunction(y => window.scrollY > y + 200, y0, { timeout: 5000 });
        assert.ok(await p.locator('.md pre code.language-sql .tk-k', { hasText: 'SELECT' }).count());
        assert.ok(await p.locator('.md pre code.language-js .tk-s').count());
        assert.strictEqual(await p.locator('.md script').count(), 0);
        assert.ok(
          (await p.locator('.md pre code.language-js').textContent()).includes('<script>alert(1)</script>')
        );
        const colK = await p
            .locator('.md .tk-k')
            .first()
            .evaluate(e => getComputedStyle(e).color),
          colBody = await p
            .locator('.md p')
            .first()
            .evaluate(e => getComputedStyle(e).color);
        assert.notStrictEqual(colK, colBody, '關鍵字顏色應與內文不同');
        await p.screenshot({ path: H.path.join(__dirname, 'shots', '8_toc_highlight.png') });
      }
    );
    await t('全文索引快取：第一次載入整批建立並寫入 IndexedDB', async () => {
      await p.waitForFunction(
        () => VaultUI.FT && !VaultUI.FT.building && Object.keys(VaultUI.FT.bodies).length >= 3,
        null,
        { timeout: 15000 }
      );
      await settle(p);
      await p.waitForTimeout(600);
      const n = await p.evaluate(
        () =>
          new Promise(res => {
            const r = indexedDB.open('vault-ft', 1);
            r.onsuccess = () => {
              const q = r.result.transaction('bodies').objectStore('bodies').count();
              q.onsuccess = () => res(q.result);
            };
            r.onerror = () => res(-1);
          })
      );
      assert.strictEqual(n, 3, 'IndexedDB 內筆記數 ' + n);
      assert.ok(p.calls.exportBatch >= 1);
    });
    await t('重新開啟：全文索引直接從本機讀回，不再呼叫 exportBatch／getNote；搜內文馬上有結果', async () => {
      await p.close();
      p = await newPage(bctx, env, getWho);
      await p.fill('#q', 'ZEBRA');
      await p.waitForFunction(
        () => document.querySelector('#main .list')?.textContent.includes('另一則'),
        null,
        { timeout: 5000 }
      );
      await p.waitForTimeout(500);
      assert.ok(!p.calls.exportBatch && !p.calls.getNote, '不應再讀內文：' + JSON.stringify(p.calls));
      assert.ok(await p.evaluate(() => VaultUI.FT.cacheOk && VaultUI.FT.cached === 3));
    });
    await t(
      '只補抓有變動的筆記：改一則 → 重新開啟只呼叫一次 getNote，新內文可搜；刪除的筆記從快取移除',
      async () => {
        env.updateNote('20261024-d003', '第三則', 'dev', undefined, '改過之後出現LLAMA這個詞');
        await p.close();
        p = await newPage(bctx, env, getWho);
        await p.fill('#q', 'LLAMA');
        await p.waitForFunction(
          () => document.querySelector('#main .list')?.textContent.includes('第三則'),
          null,
          { timeout: 8000 }
        );
        assert.strictEqual(p.calls.getNote, 1, JSON.stringify(p.calls));
        assert.ok(!p.calls.exportBatch);
        env.call('deleteNote', { id: '20261024-d002' });
        await p.close();
        p = await newPage(bctx, env, getWho);
        await p.waitForTimeout(800);
        const ids = await p.evaluate(
          () =>
            new Promise(res => {
              const r = indexedDB.open('vault-ft', 1);
              r.onsuccess = () => {
                const q = r.result.transaction('bodies').objectStore('bodies').getAllKeys();
                q.onsuccess = () => res(q.result.sort());
              };
            })
        );
        assert.deepStrictEqual(ids, ['20261024-d001', '20261024-d003']);
      }
    );
    await t('訪客身分載入時，這個瀏覽器上的全文快取會被清掉，且不會建立全文索引', async () => {
      who = VISITOR;
      await p.close();
      p = await newPage(bctx, env, getWho);
      await p.waitForTimeout(800);
      const n = await p.evaluate(
        () =>
          new Promise(res => {
            const r = indexedDB.open('vault-ft', 1);
            r.onsuccess = () => {
              const q = r.result.transaction('bodies').objectStore('bodies').count();
              q.onsuccess = () => res(q.result);
            };
          })
      );
      assert.strictEqual(n, 0);
      assert.ok(!p.calls.exportBatch);
    });
    assert.deepStrictEqual(p.errors, [], p.errors.join('|'));
  } finally {
    await browser.close();
  }
  console.log('\nP3 批次一端對端：' + H.count() + ' 項全部通過');
})().catch(e => {
  console.error('\n失敗：', (e && e.stack) || e);
  process.exit(1);
});
