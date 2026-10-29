// P5 後端離線測試：自動備份（分段、核對、保留份數、還原一致）與 GitHub 同步（差異、只送公開、不外洩 token）
const vm = require('vm'),
  fs = require('fs'),
  assert = require('assert'),
  path = require('path');
const makeStore = require('./fake_store'),
  makeGh = require('./fake_github');
const ctx = vm.createContext({ console, Logger: { log() {} } });
(process.env.BUNDLE
  ? ['Vault_all.gs']
  : ['Yaml.gs', 'Svg.gs', 'Core.gs', 'Sync.gs', 'Code.gs', 'Store.gs']
).forEach(f => vm.runInContext(fs.readFileSync(require('./paths').gsPath(f), 'utf8'), ctx, { filename: f }));
const g = n => vm.runInContext(n, ctx);
const H = (a, p, c, s) => JSON.parse(JSON.stringify(g('handle_')(a, p, c || OWNER, 'RUN', s)));
const OWNER = { isOwner: true, active: 'me@gmail.com' },
  VISITOR = { isOwner: false, active: '' },
  OTHER = { isOwner: false, active: 'x@gmail.com' };
let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('通過  ' + name);
};

const fm = (id, title, topic, pub, body, extra) =>
  '---\nid: ' +
  id +
  '\ntitle: ' +
  title +
  '\ntopic: ' +
  topic +
  '\ndate: 2026-10-22\n' +
  (pub === undefined ? '' : 'public: ' + pub + '\n') +
  (extra || '') +
  '---\n' +
  body;
function seed(count) {
  const s = makeStore();
  s.saveTopic({ id: 'pub', title: '公開本', defaultPublic: true });
  s.saveTopic({ id: 'priv', title: '機密主題名', defaultPublic: false });
  const save = (id, ...a) => assert.ok(H('saveNote', { id, text: fm(id, ...a) }, OWNER, s).ok);
  assert.ok(H('uploadSvg', { id: '20261022-v001', text: '<svg><rect/></svg>' }, OWNER, s).ok);
  assert.ok(H('uploadSvg', { id: '20261022-v002', text: '<svg><circle/></svg>' }, OWNER, s).ok);
  save(
    '20261022-p001',
    '公開一',
    'pub',
    undefined,
    '公開內文 [[20261022-s001]] ![](assets/20261022-v001.svg)'
  );
  save(
    '20261022-p002',
    'Public Two',
    'pub',
    undefined,
    'english',
    'lang: en\ntranslation_of: 20261022-p001\n'
  );
  save('20261022-s001', '私人標題XYZ', 'priv', undefined, 'SECRET-BODY ![](assets/20261022-v002.svg)');
  for (let i = 0; i < (count || 0); i++)
    save('20261023-m' + String(i).padStart(3, '0'), '批量' + i, 'pub', undefined, '內容' + i);
  assert.ok(
    H(
      'saveBoard',
      {
        topic: 'pub',
        board: {
          nodes: [{ id: 'a', type: 'text', text: '板上', x: 0, y: 0, width: 100, height: 50 }],
          edges: []
        }
      },
      OWNER,
      s
    ).ok
  );
  assert.ok(
    H(
      'saveBoard',
      {
        topic: 'priv',
        board: {
          nodes: [{ id: 'b', type: 'text', text: 'SECRET-BOARD', x: 0, y: 0, width: 100, height: 50 }],
          edges: []
        }
      },
      OWNER,
      s
    ).ok
  );
  return s;
}
const pubStep = (s, budget, fresh) => JSON.parse(JSON.stringify(g('backupStep_')(s, budget, fresh)));
const zipOf = (s, name) => {
  const f = s.listFolder('_backup').find(x => x.name === name);
  return JSON.parse(s.readText(f.fileId));
};
const zipNames = s =>
  s
    .listFolder('_backup')
    .filter(f => /\.zip$/.test(f.name))
    .map(f => f.name)
    .sort();

/* ───── 備份 ───── */
t(
  '備份：一次做完；ZIP 含 notes／assets／topics／boards／manifest，格式與前端 ZIP 相同；已核對；暫存檔清乾淨',
  () => {
    const s = seed();
    const r = pubStep(s, 1e9, true);
    assert.ok(r.ok && r.job.stage === 'done' && r.job.result.verified, JSON.stringify(r));
    const list = zipOf(s, r.job.result.name),
      paths = list.map(x => x.path).sort();
    assert.deepStrictEqual(paths, [
      'assets/20261022-v001.svg',
      'assets/20261022-v002.svg',
      'boards/priv.canvas.json',
      'boards/pub.canvas.json',
      'manifest.json',
      'notes/20261022-p001.md',
      'notes/20261022-p002.md',
      'notes/20261022-s001.md',
      'topics/priv.json',
      'topics/pub.json'
    ]);
    const man = JSON.parse(list.find(x => x.path === 'manifest.json').text);
    assert.strictEqual(man.format, 'vault-backup');
    assert.deepStrictEqual(man.counts, { notes: 3, assets: 2, topics: 2, boards: 2 });
    assert.deepStrictEqual(
      s.listFolder('_backup').filter(f => f.name.indexOf('work-') === 0),
      []
    );
    assert.ok(JSON.parse(s.getProp('LAST_BACKUP')).verified);
  }
);
t(
  '備份：還原到全新的 Vault 後，索引、內文、SVG、畫布、主題與原本逐項一致（驗收：備份 ZIP 可還原整個 Vault）',
  () => {
    const s = seed();
    const r = pubStep(s, 1e9, true),
      list = zipOf(s, r.job.result.name);
    const d = makeStore();
    list
      .filter(x => x.path.startsWith('topics/'))
      .forEach(x => {
        const o = JSON.parse(x.text);
        assert.ok(
          H(
            'saveTopic',
            {
              id: o.id,
              title: o.title,
              category: o.category,
              status: o.status,
              defaultPublic: o.defaultPublic,
              confirmPublic: true
            },
            OWNER,
            d
          ).ok
        );
      });
    list
      .filter(x => x.path.startsWith('assets/'))
      .forEach(x => assert.ok(H('uploadSvg', { id: x.path.slice(7, -4), text: x.text }, OWNER, d).ok));
    list
      .filter(x => x.path.startsWith('notes/'))
      .forEach(x => assert.ok(H('saveNote', { id: x.path.slice(6, -3), text: x.text }, OWNER, d).ok));
    list
      .filter(x => x.path.startsWith('boards/'))
      .forEach(x =>
        assert.ok(H('saveBoard', { topic: x.path.slice(7, -12), board: JSON.parse(x.text) }, OWNER, d).ok)
      );
    const strip = o =>
      JSON.stringify(o, (k, v) =>
        k === 'generatedAt' || k === 'updatedAt' || k === 'driveFileId' ? undefined : v
      );
    assert.strictEqual(strip(H('listIndex', {}, OWNER, d)), strip(H('listIndex', {}, OWNER, s)));
    ['20261022-p001', '20261022-p002', '20261022-s001'].forEach(id =>
      assert.strictEqual(H('getNote', { id }, OWNER, d).body, H('getNote', { id }, OWNER, s).body)
    );
    assert.strictEqual(
      H('getSvg', { id: '20261022-v002' }, OWNER, d).svg,
      H('getSvg', { id: '20261022-v002' }, OWNER, s).svg
    );
    assert.deepStrictEqual(
      H('getBoard', { topic: 'priv' }, OWNER, d).board,
      H('getBoard', { topic: 'priv' }, OWNER, s).board
    );
    assert.strictEqual(strip(H('listIndex', {}, VISITOR, d)), strip(H('listIndex', {}, VISITOR, s))); // 公開／私人設定也一併還原
  }
);
t('備份：時間預算用完就停，下一次接著做；多次呼叫的結果與一次做完相同；進度遞增', () => {
  const s = seed(100);
  s.readCost = 1000;
  const one = makeStore();
  void one;
  let r = pubStep(s, 5000, true),
    calls = 1,
    last = -1;
  assert.ok(r.job.stage === 'read' && r.job.done > 0 && r.job.done < r.job.total, JSON.stringify(r));
  while (r.job.stage !== 'done') {
    assert.ok(r.job.done >= last);
    last = r.job.done;
    r = pubStep(s, 5000, false);
    calls++;
    assert.ok(calls < 200, '不收斂');
  }
  assert.ok(calls > 5, '應分多次完成：' + calls);
  const list = zipOf(s, r.job.result.name);
  assert.strictEqual(list.filter(x => x.path.startsWith('notes/')).length, 103);
  assert.strictEqual(new Set(list.map(x => x.path)).size, list.length, '不可重複');
  assert.deepStrictEqual(
    s.listFolder('_backup').filter(f => f.name.indexOf('work-') === 0),
    []
  );
});
t('備份：某個檔案讀不到不會中斷；列入 manifest.missing', () => {
  const s = seed();
  const row = s.getIndexRows().find(r => r.id === '20261022-p002');
  s.failRead[row.driveFileId] = true;
  const r = pubStep(s, 1e9, true);
  assert.ok(r.job.stage === 'done');
  const man = JSON.parse(zipOf(s, r.job.result.name).find(x => x.path === 'manifest.json').text);
  assert.deepStrictEqual(man.missing, ['20261022-p002']);
  assert.strictEqual(man.counts.notes, 2);
});
t('備份：只保留最近 N 份（BACKUP_KEEP）；舊的移到垃圾桶', () => {
  const s = seed();
  s.cfg.BACKUP_KEEP = '2';
  [
    '2026-10-22T10:00:00.000Z',
    '2026-10-23T10:00:00.000Z',
    '2026-10-24T10:00:00.000Z',
    '2026-10-25T10:00:00.000Z'
  ].forEach(iso => {
    s.nowIso = iso;
    assert.ok(pubStep(s, 1e9, true).job.stage === 'done');
  });
  assert.deepStrictEqual(zipNames(s), [
    'vault-backup-20261024-100000.zip',
    'vault-backup-20261025-100000.zip'
  ]);
  const st = H('backupStatus', {}, OWNER, s);
  assert.deepStrictEqual(
    st.backups.map(b => b.name),
    ['vault-backup-20261025-100000.zip', 'vault-backup-20261024-100000.zip']
  );
  assert.ok(st.backups[0].url.startsWith('https://drive.google.com/file/d/'));
});
t('備份：核對失敗（ZIP 檔案數不對）→ 標示失敗、刪掉壞檔、不計入保留；錯誤可重試', () => {
  const s = seed();
  const ok = s.verifyZip;
  s.verifyZip = (id, p) => ({ ok: false, count: p.length - 1 });
  const r = pubStep(s, 1e9, true);
  assert.strictEqual(r.ok, false);
  assert.ok(r.job.stage === 'failed' && /核對失敗/.test(r.error));
  assert.deepStrictEqual(zipNames(s), []);
  s.verifyZip = ok;
  const r2 = pubStep(s, 1e9, true);
  assert.ok(r2.ok && r2.job.stage === 'done');
});
t('備份：正在進行中（10 分鐘內有動靜）不會重複開始；過了 10 分鐘視為中斷，可接手', () => {
  const s = seed(100);
  s.readCost = 1000;
  pubStep(s, 3000, true);
  const j = JSON.parse(s.getProp('BACKUP_JOB'));
  j.running = true;
  j.touchedMs = s.nowMs();
  s.setProp('BACKUP_JOB', JSON.stringify(j));
  assert.strictEqual(pubStep(s, 3000, false).busy, true);
  s.clockMs += 11 * 60 * 1000;
  assert.ok(!pubStep(s, 3000, false).busy);
});
t('備份：計時器入口做不完會排一個一分鐘後的接力；每月自動備份可開關', () => {
  const s = seed(100);
  s.readCost = 5000;
  g('backupScheduled_')(s, true);
  assert.ok(s.triggerList().indexOf('backupContinue') >= 0);
  while (s.triggerList().indexOf('backupContinue') >= 0) {
    s.triggerRemove('backupContinue');
    g('backupScheduled_')(s, false);
  }
  assert.strictEqual(JSON.parse(s.getProp('LAST_BACKUP')).verified, true);
  assert.deepStrictEqual(H('backupTrigger', { enable: true }, OWNER, s), { ok: true, enabled: true });
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(s.triggers.find(x => x.handler === 'scheduledBackup').spec)),
    { type: 'monthly', day: 1, hour: 3 }
  );
  assert.strictEqual(H('backupStatus', {}, OWNER, s).monthly, true);
  assert.deepStrictEqual(H('backupTrigger', { enable: false }, OWNER, s), { ok: true, enabled: false });
  assert.strictEqual(H('backupTrigger', { enable: 'yes' }, OWNER, s).ok, false);
});

/* ───── 同步到 GitHub ───── */
const setup = count => {
  const s = seed(count),
    gh = makeGh();
  Object.assign(s.cfg, { GITHUB_TOKEN: gh.opts.token, GITHUB_REPO: gh.opts.repo });
  s.httpImpl = r => gh.http(r);
  return { s, gh };
};
const reads = s => {
  let c = 0;
  const o = s.readText;
  s.readText = id => {
    if (s.files[id] && s.files[id].folder === 'notes') c++;
    return o(id);
  };
  return () => c;
};
const SECRETS = [
  '私人標題XYZ',
  'SECRET-BODY',
  'SECRET-BOARD',
  '機密主題名',
  '20261022-s001',
  '20261022-v002',
  'ghp_TESTTOKEN'
];
t('同步：沒設定 token／repo 時明確回報，不丟例外、不連線', () => {
  const s = seed();
  let called = 0;
  s.httpImpl = () => {
    called++;
    return { code: 200, body: '{}' };
  };
  const r = H('syncSite', {}, OWNER, s);
  assert.strictEqual(r.ok, false);
  assert.ok(/GITHUB_TOKEN/.test(r.reasons[0]));
  assert.strictEqual(called, 0);
  s.cfg.GITHUB_TOKEN = 'x';
  s.cfg.GITHUB_REPO = '../evil';
  assert.strictEqual(H('syncSite', {}, OWNER, s).ok, false);
  assert.strictEqual(called, 0);
  const st = H('siteStatus', {}, OWNER, s);
  assert.strictEqual(st.configured.ready, false);
  assert.ok(!JSON.stringify(st).includes('"x"'));
});
t('同步：第一次把公開內容一次提交；repo 內完全沒有任何私人內容、也沒有 token；與訪客看到的逐字相同', () => {
  const { s, gh } = setup();
  const r = H('syncSite', {}, OWNER, s);
  assert.ok(r.ok && !r.unchanged, JSON.stringify(r));
  assert.strictEqual(gh.commitCount(), 1);
  const f = gh.files();
  assert.deepStrictEqual(
    Object.keys(f)
      .filter(k => k.startsWith('content/'))
      .sort(),
    [
      'content/assets/20261022-v001.svg',
      'content/boards/pub.json',
      'content/index.json',
      'content/manifest.json',
      'content/notes/20261022-p001.json',
      'content/notes/20261022-p002.json',
      'content/site-meta.json'
    ]
  );
  const all = Object.values(f).join('\n');
  SECRETS.forEach(k => assert.ok(!all.includes(k), '外洩：' + k));
  const idx = H('listIndex', {}, VISITOR, s);
  assert.deepStrictEqual(JSON.parse(f['content/index.json']), {
    items: idx.items,
    topics: idx.topics,
    order: idx.order
  });
  idx.items.forEach(it => {
    const nv = H('getNote', { id: it.id }, VISITOR, s);
    assert.deepStrictEqual(JSON.parse(f['content/notes/' + it.id + '.json']), {
      meta: nv.meta,
      body: nv.body
    });
  });
  assert.ok(
    JSON.parse(f['content/notes/20261022-p001.json']).body.indexOf('20261022-s001') < 0,
    '連到私人筆記的連結已拿掉'
  );
  assert.ok(!JSON.stringify(r).includes('ghp_'));
});
t('同步：沒有變動就不提交（省 Cloudflare 建置次數），而且不重讀任何筆記', () => {
  const { s, gh } = setup();
  H('syncSite', {}, OWNER, s);
  const c = reads(s);
  const r = H('syncSite', {}, OWNER, s);
  assert.ok(r.ok && r.unchanged === true);
  assert.strictEqual(gh.commitCount(), 1);
  assert.strictEqual(c(), 0, '不該重讀筆記');
});
t('同步：改一則筆記只更新那一則；只重讀那一則；其他檔案內容不動', () => {
  const { s, gh } = setup();
  H('syncSite', {}, OWNER, s);
  const before = gh.files();
  const cur = H('getNote', { id: '20261022-p002' }, OWNER, s);
  assert.ok(
    H(
      'saveNote',
      {
        id: '20261022-p002',
        baseUpdatedAt: cur.updatedAt,
        text: fm(
          '20261022-p002',
          'Public Two',
          'pub',
          undefined,
          'english EDITED',
          'lang: en\ntranslation_of: 20261022-p001\n'
        )
      },
      OWNER,
      s
    ).ok
  );
  const c = reads(s);
  const r = H('syncSite', {}, OWNER, s);
  assert.ok(
    r.ok && r.summary.updated >= 1 && r.summary.added === 0 && r.summary.removed === 0,
    JSON.stringify(r)
  );
  assert.strictEqual(gh.commitCount(), 2);
  const after = gh.files();
  assert.ok(JSON.parse(after['content/notes/20261022-p002.json']).body.includes('EDITED'));
  assert.strictEqual(after['content/notes/20261022-p001.json'], before['content/notes/20261022-p001.json']);
  assert.ok(c() <= 2, '讀取次數：' + c());
});
t('同步：改成私人或刪除 → 從 repo 移除；新增公開筆記 → 加入', () => {
  const { s, gh } = setup();
  H('syncSite', {}, OWNER, s);
  assert.ok(H('updateNotes', { ids: ['20261022-p002'], public: false }, OWNER, s).ok);
  assert.ok(
    H(
      'saveNote',
      { id: '20261024-n001', text: fm('20261024-n001', '新增的', 'pub', undefined, 'new') },
      OWNER,
      s
    ).ok
  );
  const r = H('syncSite', {}, OWNER, s);
  assert.ok(r.ok && r.summary.removed >= 1 && r.summary.added >= 1, JSON.stringify(r));
  const f = gh.files();
  assert.ok(!('content/notes/20261022-p002.json' in f));
  assert.ok('content/notes/20261024-n001.json' in f);
  assert.ok(!JSON.parse(f['content/index.json']).items.some(i => i.id === '20261022-p002'));
  assert.ok(H('deleteNote', { id: '20261024-n001' }, OWNER, s).ok);
  H('syncSite', {}, OWNER, s);
  assert.ok(!('content/notes/20261024-n001.json' in gh.files()));
});
t('同步：主題改私人 → 該主題的筆記、畫布、圖全部從 repo 消失', () => {
  const { s, gh } = setup();
  H('syncSite', {}, OWNER, s);
  assert.ok(H('saveTopic', { id: 'pub', title: '公開本', defaultPublic: false }, OWNER, s).ok);
  const r = H('syncSite', {}, OWNER, s);
  assert.ok(r.ok, JSON.stringify(r));
  const f = gh.files();
  assert.deepStrictEqual(
    Object.keys(f).filter(k => k.startsWith('content/') && /notes|boards|assets/.test(k)),
    []
  );
  assert.deepStrictEqual(JSON.parse(f['content/index.json']).items, []);
});
t('同步：dryRun 只回報差異，不提交；force 重送全部', () => {
  const { s, gh } = setup();
  const d = H('syncSite', { dryRun: true }, OWNER, s);
  assert.ok(d.ok && d.dryRun && d.summary.added >= 5);
  assert.strictEqual(gh.commitCount(), 0);
  H('syncSite', {}, OWNER, s);
  const d2 = H('syncSite', { dryRun: true }, OWNER, s);
  assert.ok(d2.unchanged === true);
  const f = H('syncSite', { force: true }, OWNER, s);
  assert.ok(f.ok && f.summary.added >= 5);
  assert.strictEqual(gh.commitCount(), 2);
});
t('同步：檔案很多時分批建立檔案樹（每批 40），最後一個提交、一次更新分支', () => {
  const { s, gh } = setup(100);
  const r = H('syncSite', {}, OWNER, s);
  assert.ok(r.ok, JSON.stringify(r));
  const trees = gh.log.filter(l => l.startsWith('POST') && l.includes('/git/trees')).length,
    entries = Object.keys(gh.files()).filter(k => k.startsWith('content/')).length;
  assert.strictEqual(trees, Math.ceil(entries / 40));
  assert.strictEqual(gh.commitCount(), 1);
  assert.strictEqual(gh.log.filter(l => l.startsWith('PATCH')).length, 1);
  assert.strictEqual(Object.keys(gh.files()).filter(k => k.startsWith('content/notes/')).length, 102);
});
t('同步：各種 GitHub 錯誤都有中文說明，且訊息與回傳都不含 token', () => {
  [
    [401, /不接受這個 token/],
    [403, /Contents/],
    [404, /找不到 repo/],
    [422, /再按一次/]
  ].forEach(([code, re]) => {
    const { s, gh } = setup();
    gh.fail = { match: /git\/ref\//, code };
    const r = H('syncSite', {}, OWNER, s);
    assert.strictEqual(r.ok, false);
    assert.ok(re.test(r.error), r.error);
    assert.ok(!JSON.stringify(r).includes('ghp_'));
  });
  const a = setup();
  a.s.cfg.GITHUB_TOKEN = 'ghp_WRONG';
  const r = H('syncSite', {}, OWNER, a.s);
  assert.ok(!r.ok && /不接受/.test(r.error) && !JSON.stringify(r).includes('ghp_WRONG'));
  const b = setup();
  b.gh.fail = { match: /git\/refs\/heads/, code: 422 };
  assert.ok(/再按一次/.test(H('syncSite', {}, OWNER, b.s).error));
  assert.strictEqual(b.gh.refs.main, Object.keys(b.gh.commits)[0], '分支沒被改動');
  const c = setup();
  c.gh.fail = { match: /git\/trees/, code: 403 };
  assert.strictEqual(H('syncSite', {}, OWNER, c.s).ok, false);
  assert.strictEqual(c.gh.commitCount(), 0, '建檔失敗不留下提交');
});
t('同步：只允許連 api.github.com 與自己設定的 repo；其他網址、其他 repo 路徑都被擋', () => {
  const s = makeStore();
  assert.throws(() => s.http({ method: 'GET', url: 'https://evil.test/x', headers: {} }));
  const cfg = { repo: 'me/vault-site', token: 't' };
  assert.throws(() => g('gh_')(s, cfg, 'GET', '/repos/other/repo/git/ref/heads/main'), /不允許/);
});
t('同步：每日自動同步可開關；siteStatus 只回報「有沒有設」，不回 token', () => {
  const { s } = setup();
  assert.deepStrictEqual(H('syncTrigger', { enable: true }, OWNER, s), { ok: true, enabled: true });
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(s.triggers.find(x => x.handler === 'scheduledSync').spec)),
    { type: 'daily', hour: 4 }
  );
  H('syncSite', {}, OWNER, s);
  const st = H('siteStatus', {}, OWNER, s);
  assert.ok(
    st.configured.ready && st.daily && st.last.commit && st.repo === 'me/vault-site' && st.publicNotes === 2
  );
  assert.ok(!JSON.stringify(st).includes('ghp_'));
});
t('權限：訪客與陌生人呼叫備份、同步動作一律被拒，且不觸發任何連線或寫入', () => {
  const { s, gh } = setup();
  ['backupStatus', 'backupRun', 'backupTrigger', 'siteStatus', 'syncSite', 'syncTrigger'].forEach(a =>
    [VISITOR, OTHER].forEach(c =>
      assert.deepStrictEqual(H(a, { enable: true, fresh: true }, c, s), { ok: false, error: '無法完成' })
    )
  );
  assert.strictEqual(gh.log.length, 0);
  assert.strictEqual(s.triggers.length, 0);
  assert.strictEqual(s.listFolder('_backup').length, 0);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(g('handle_')('syncSite', {}, OWNER, 'GET', s))), {
    ok: false,
    error: '無法完成'
  });
});
console.log('\nP5 後端：' + n + ' 項全部通過');
