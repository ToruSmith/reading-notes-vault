// P5 端對端：同步與備份頁（擁有者專用）
const H = require('./harness');
const { chromium, assert, OWNER, VISITOR, makeEnv, newPage, t } = H;
const makeGh = require('../../backend/tests/fake_github');
const env = makeEnv();
const s = env.store;
s.saveTopic({ id: 'pub', title: '公開本', defaultPublic: true });
s.saveTopic({ id: 'priv', title: '私人本', defaultPublic: false });
for (let i = 1; i <= 4; i++)
  env.saveNote('20261024-p00' + i, '公開' + i, 'pub', undefined, '內文' + i, { date: '2026-10-0' + i });
env.saveNote('20261024-s001', '私人祕密', 'priv', undefined, 'SECRET', { date: '2026-10-09' });
const gh = makeGh();
s.httpImpl = r => gh.http(r);
const hasCjk = x => /[一-鿿]/.test(x);

(async () => {
  const browser = await chromium.launch();
  try {
    const vctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } });
    const v = await newPage(vctx, env, VISITOR);
    await t('訪客看不到「同步與備份」；後端也拒絕', async () => {
      assert.strictEqual(await v.locator('#btnSync').count(), 0);
      assert.deepStrictEqual(env.call('backupStatus', {}, VISITOR), { ok: false, error: '無法完成' });
    });
    await v.close();
    const octx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } });
    const o = await newPage(octx, env, OWNER);
    await t('尚未設定 GitHub：顯示「未設定」與說明，同步按鈕停用；畫面與回應都沒有 token', async () => {
      await o.locator('#btnSync').click();
      await o.waitForSelector('#sy-site');
      assert.ok((await o.locator('#sy-cfg').textContent()).includes('未設定'));
      assert.ok(await o.locator('#sy-help').count());
      assert.ok(
        (await o.locator('#sy-sync').isDisabled()) &&
          (await o.locator('#sy-dry').isDisabled()) &&
          (await o.locator('#sy-daily').isDisabled())
      );
      assert.ok((await o.locator('#sy-slast').textContent()).includes('還沒有同步過'));
      assert.ok((await o.locator('#sy-last').textContent()).includes('還沒有備份過'));
    });
    s.cfg.GITHUB_TOKEN = gh.opts.token;
    s.cfg.GITHUB_REPO = gh.opts.repo;
    await t(
      '設定後：顯示 repo 名稱（不顯示 token）；預覽變更只列數量、不提交；立即同步後有結果與提交連結',
      async () => {
        await o.locator('#sy-back').click();
        await o.locator('#btnSync').click();
        await o.waitForSelector('#sy-site');
        const cfg = await o.locator('#sy-cfg').textContent();
        assert.ok(
          cfg.includes('me/vault-site') &&
            !cfg.includes('ghp_') &&
            !(await o.locator('body').textContent()).includes('ghp_TESTTOKEN')
        );
        assert.ok(await o.locator('#sy-sync').isEnabled());
        await o.locator('#sy-dry').click();
        await o.waitForSelector('#sy-sres');
        assert.ok(
          (await o.locator('#sy-sres').textContent()).includes('預覽') &&
            (await o.locator('#sy-sres').textContent()).includes('新增')
        );
        assert.strictEqual(gh.commitCount(), 0);
        await o.locator('#sy-sync').click();
        await o.waitForFunction(() =>
          /最近一次：.*新增/.test(document.getElementById('sy-slast').textContent)
        );
        assert.strictEqual(gh.commitCount(), 1);
        assert.ok(await o.locator('#sy-site a[href*="github.com/me/vault-site/commit/"]').count());
        assert.ok(Object.keys(gh.files()).every(k => !/SECRET|私人/.test(gh.files()[k])));
      }
    );
    await t('再按一次：沒有變動就不提交', async () => {
      await o.locator('#sy-sync').click();
      await o.waitForFunction(() => /沒有變動/.test(document.getElementById('sy-slast').textContent));
      assert.strictEqual(gh.commitCount(), 1);
    });
    await t('GitHub 出錯：顯示中文原因，不含 token，也不留下半套提交', async () => {
      gh.fail = { match: /git\/trees/, code: 403 };
      env.saveNote('20261024-p009', '新增一則', 'pub', undefined, 'x');
      await o.locator('#sy-sync').click();
      await o.waitForSelector('#sy-err');
      const e = await o.locator('#sy-err').textContent();
      assert.ok(/Contents/.test(e) && !e.includes('ghp_'), e);
      assert.strictEqual(gh.commitCount(), 1);
      gh.fail = null;
      await o.locator('#sy-sync').click();
      await o.waitForFunction(() => /新增 1/.test(document.getElementById('sy-slast').textContent));
      assert.strictEqual(gh.commitCount(), 2);
    });
    await t('立即備份：顯示完成訊息與清單；ZIP 內容與 Vault 一致且已核對', async () => {
      await o.locator('#sy-bnow').click();
      await o.waitForSelector('#sy-msg');
      assert.ok((await o.locator('#sy-msg').textContent()).includes('備份完成並已核對'));
      assert.ok(
        (await o.locator('#sy-last').textContent()).includes('筆記 6') &&
          (await o.locator('#sy-last').textContent()).includes('已核對')
      );
      assert.strictEqual(await o.locator('#sy-blist li').count(), 1);
      assert.ok(await o.locator('#sy-blist a[href^="https://drive.google.com/file/d/"]').count());
      const st = env.call('backupStatus', {});
      assert.strictEqual(st.backups.length, 1);
    });
    await t('時間不夠時分多次完成：畫面會顯示進度，最後仍完成', async () => {
      s.readCost = 40000;
      s.nowIso = '2026-10-23T09:00:00.000Z'; // 每讀一個檔 40 秒 → 單次預算 150 秒只夠讀幾個
      const before = o.calls.backupRun;
      await o.evaluate(() => {
        window.__prog = [];
        new MutationObserver(() => {
          const n = document.getElementById('sy-prog');
          if (n) window.__prog.push(n.textContent);
        }).observe(document.getElementById('main'), { childList: true, subtree: true, characterData: true });
      });
      await o.locator('#sy-bnow').click();
      await o.waitForFunction(
        () => /備份完成並已核對/.test((document.getElementById('sy-msg') || {}).textContent || ''),
        null,
        { timeout: 20000 }
      );
      assert.ok(o.calls.backupRun - before >= 3, '呼叫次數 ' + (o.calls.backupRun - before));
      s.readCost = 0;
      assert.ok(
        (await o.evaluate(() => window.__prog)).some(x => /讀取檔案 \d+ \/ \d+/.test(x)),
        '要看得到進度'
      );
      assert.strictEqual(env.call('backupStatus', {}).backups.length, 2);
    });
    await t('自動排程：每月備份、每日同步可開關，狀態與後端一致', async () => {
      await o.locator('#sy-bmon').click();
      await o.waitForFunction(() => /已啟用/.test(document.getElementById('sy-bmon').textContent));
      assert.ok(s.triggerList().includes('scheduledBackup'));
      await o.locator('#sy-daily').click();
      await o.waitForFunction(() => /已啟用/.test(document.getElementById('sy-daily').textContent));
      assert.ok(s.triggerList().includes('scheduledSync'));
      await o.locator('#sy-bmon').click();
      await o.waitForFunction(() => /未啟用/.test(document.getElementById('sy-bmon').textContent));
      assert.ok(!s.triggerList().includes('scheduledBackup'));
    });
    await t('離開同步頁：開筆記或回列表都正常；開編輯後不會又彈回同步頁', async () => {
      await o.locator('#sy-back').click();
      assert.ok((await o.locator('#main .list li').count()) > 0);
      await o.locator('#btnSync').click();
      await o.waitForSelector('#sy-site');
      await o.evaluate(() => VaultUI.openEditor(null));
      await o.waitForSelector('#f-title');
      assert.strictEqual(await o.evaluate(() => !!VaultUI.S.sync), false);
    });
    assert.deepStrictEqual(o.errors, []);
    await o.close();

    await t('英文介面：同步與備份頁沒有殘留中文（按鈕、說明、狀態）', async () => {
      const ectx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
      const e = await newPage(ectx, env, OWNER, { lang: 'en-US' });
      await e.locator('#btnSync').click();
      await e.waitForSelector('#sy-site');
      await e.locator('#sy-dry').click();
      await e.waitForSelector('#sy-sres');
      const texts = await e.evaluate(() =>
        Array.from(document.querySelectorAll('#main button, #main p, #main h2, #main h3, #main li')).map(
          n => n.textContent
        )
      );
      const bad = texts.filter(hasCjk);
      assert.deepStrictEqual(bad, [], bad.join(' | '));
      assert.ok(/Sync now/.test(texts.join('|')) && /Back up now/.test(texts.join('|')));
      gh.fail = { match: /git\/ref\//, code: 404 };
      await e.locator('#sy-sync').click();
      await e.waitForSelector('#sy-err');
      assert.ok(!hasCjk(await e.locator('#sy-err').textContent()), await e.locator('#sy-err').textContent());
      gh.fail = null;
      await ectx.close();
    });
    await t('手機 390px：選單裡有「同步與備份」；頁面沒有橫向捲動', async () => {
      const mctx = await browser.newContext({
        locale: 'zh-TW',
        viewport: { width: 390, height: 800 },
        hasTouch: true,
        isMobile: true
      });
      const m = await newPage(mctx, env, OWNER);
      await m.locator('#btnMenu').tap();
      await m.locator('#btnSync').tap();
      await m.waitForSelector('#sy-site');
      assert.ok(
        await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        '橫向捲動 ' + (await m.evaluate(() => document.documentElement.scrollWidth))
      );
      assert.deepStrictEqual(m.errors, []);
      await mctx.close();
    });
  } finally {
    await browser.close();
  }
  console.log('\nP5 端對端：' + H.count() + ' 項全部通過');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
