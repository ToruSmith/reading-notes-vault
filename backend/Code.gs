/**
 * Code.gs — 讀書筆記 Vault 後端入口（P1）
 *
 * 兩個部署共用這份程式碼（規劃書 D15）
 *   讀取部署：執行身分＝我、任何人可存取   → 只回公開內容
 *   編輯部署：執行身分＝使用者、Google 帳號 → 擁有者可讀全部、可寫入
 *
 * 判斷擁有者只靠「登入者 Email ＝ 指令碼屬性 OWNER_EMAIL」，任一邊為空一律視為非擁有者。
 * REST 的 GET 一律以訪客身分處理，不受登入狀態影響（公開網址永遠只給公開內容）。
 */

/* ───────── 身分 ───────── */
function normEmail_(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

function isOwner_(activeEmail, ownerEmail) {
  const a = normEmail_(activeEmail),
    o = normEmail_(ownerEmail);
  return a !== '' && o !== '' && a === o;
}

function buildCtx_(cfg) {
  let active = '';
  try {
    active = Session.getActiveUser().getEmail() || '';
  } catch (e) {}
  return { active: normEmail_(active), isOwner: isOwner_(active, cfg.OWNER_EMAIL) };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function run_(action, payload, method) {
  const cfg = loadConfig_();
  if (!cfg.ROOT_ID || !cfg.SHEET_ID) return { ok: false, error: '尚未完成設定' };
  return handle_(action, payload, buildCtx_(cfg), method, makeStore_(cfg));
}

/* ───────── 入口 ───────── */
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (!action) {
    try {
      let base = String(loadConfig_().PUBLIC_URL || '').trim(); // 可在指令碼屬性設 PUBLIC_URL＝唯讀部署的網址，分享連結才不會指到編輯部署
      if (!base) {
        try {
          base = ScriptApp.getService().getUrl() || '';
        } catch (err2) {}
      }
      const raw = HtmlService.createHtmlOutputFromFile('index').getContent();
      // 把網址參數（?note=、?topic=、?lang=）經驗證後交給前端；不用 template，避免前端程式碼裡的 <? 被誤判
      const page = raw.split('/*__ROUTE__*/null').join(routeJson_(e && e.parameter, base));
      return HtmlService.createHtmlOutput(page)
        .setTitle('讀書筆記 Vault')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    } catch (err) {
      return HtmlService.createHtmlOutput('<p>後端已就緒，但專案裡缺少名為 index 的 HTML 檔案。</p>');
    }
  }
  return json_(run_(action, { id: e.parameter.id, topic: e.parameter.topic }, 'GET'));
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {}
  return json_(run_(body.action, body, 'POST'));
}

/** 給網頁的 google.script.run 使用（結尾無底線才能被前端呼叫）。 */
function api(action, payload) {
  return run_(action, payload || {}, 'RUN');
}

/* ───────── 計時器入口（P5）：由計時器以擁有者身分執行，不對外開放 ───────── */
function scheduledBackup() {
  backupScheduled_(makeStore_(loadConfig_()), true);
}
function backupContinue() {
  const store = makeStore_(loadConfig_());
  store.triggerRemove('backupContinue'); // 一次性接力用完就刪，避免累積計時器
  backupScheduled_(store, false);
}
function scheduledSync() {
  syncSite_({}, makeStore_(loadConfig_()));
}

/* ───────── P5：編輯器內手動執行的輔助函式 ───────── */
/** 貼上新版程式後，在編輯器執行一次：讓 Google 跳出授權視窗（新增「連線到外部服務」與「管理計時器」兩項權限）。 */
function authorizeP5() {
  ScriptApp.getProjectTriggers();
  try {
    UrlFetchApp.fetch('https://api.github.com/zen', { muteHttpExceptions: true });
  } catch (e) {
    /* 只為觸發授權 */
  }
  Logger.log('授權完成。可以回到網頁使用「同步與備份」。');
}
/** 在編輯器直接跑一段備份（約 4 分鐘預算）並把狀態印到執行記錄；做不完就再執行一次或用網頁按鈕。 */
function devBackupNow() {
  Logger.log(JSON.stringify(backupStep_(makeStore_(loadConfig_()), 240000, true)));
}
/** 預覽同步會改哪些檔（不提交）。 */
function devSyncPreview() {
  Logger.log(JSON.stringify(syncSite_({ dryRun: true }, makeStore_(loadConfig_()))));
}

/** 檢查 PUBLIC_URL：把設定值與判斷結果印到執行記錄（分享連結沒出現完整網址時用）。 */
function devCheckPublicUrl() {
  const raw = loadConfig_().PUBLIC_URL;
  const r = JSON.parse(routeJson_({}, String(raw || '').trim()));
  Logger.log('PUBLIC_URL 原始值（含引號可看出前後空白）：' + JSON.stringify(raw === undefined ? null : raw));
  Logger.log(
    r.base
      ? '判斷：可用。分享連結開頭會是 ' + r.base
      : '判斷：不可用（沒設定，或不是 https://script.google.com/ 開頭的網址）。'
  );
}

/* ───────── 一次性設定：由擁有者在編輯器手動執行 ───────── */
function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function setupVault() {
  const props = PropertiesService.getScriptProperties();
  const owner = Session.getEffectiveUser().getEmail();
  if (!owner) throw new Error('取不到你的 Email，請確認已授權後再執行 setupVault');

  const root = getOrCreateFolder_(DriveApp.getRootFolder(), 'Vault');
  VAULT_FOLDERS_.forEach(function (n) {
    getOrCreateFolder_(root, n);
  });

  let sheetId = props.getProperty('SHEET_ID');
  if (!sheetId) {
    const created = SpreadsheetApp.create('Vault 索引');
    DriveApp.getFileById(created.getId()).moveTo(root);
    sheetId = created.getId();
  }
  const ss = SpreadsheetApp.openById(sheetId);
  const first = ss.getSheets()[0];
  if (first.getName() !== 'index' && !ss.getSheetByName('index')) first.setName('index');
  [
    ['index', INDEX_HEADERS_],
    ['topics', TOPIC_HEADERS_]
  ].forEach(function (pair) {
    const s = ss.getSheetByName(pair[0]) || ss.insertSheet(pair[0]);
    s.getRange(1, 1, 1, pair[1].length).setNumberFormat('@').setValues([pair[1]]);
  });

  props.setProperties({
    OWNER_EMAIL: owner,
    ROOT_ID: root.getId(),
    SHEET_ID: sheetId,
    TZ: Session.getScriptTimeZone()
  });

  const store = makeStore_(loadConfig_());
  if (
    !store.getTopics().some(function (t) {
      return t.id === 'journal';
    })
  ) {
    store.saveTopic({
      id: 'journal',
      title: '日記',
      category: '日記',
      status: 'active',
      defaultPublic: true
    }); // 規劃書 4.5：journal 預設公開
  }
  Logger.log('設定完成。擁有者：' + owner + '；資料夾：Vault；索引試算表：' + sheetId);
}

/* ───────── 驗收用示範資料（以擁有者身分，走正式的 handle_ 路徑；可重複執行） ───────── */
function devSeed() {
  const cfg = loadConfig_();
  const results = seedVault_(makeStore_(cfg), { isOwner: true, active: normEmail_(cfg.OWNER_EMAIL) });
  Logger.log(
    JSON.stringify(
      results.map(function (r) {
        return r.ok
          ? r.deduped
            ? 'ok(重送)'
            : 'ok'
          : r.error + (r.reasons ? ' ' + r.reasons.join('、') : '');
      })
    )
  );
}

function seedVault_(store, owner) {
  const call = function (action, payload) {
    return handle_(action, payload, owner, 'RUN', store);
  };

  store.saveTopic({
    id: 'db-design',
    title: '資料庫設計',
    category: '資料庫',
    status: 'reading',
    defaultPublic: false
  });
  store.saveTopic({ id: 'journal', title: '日記', category: '日記', status: 'active', defaultPublic: true });

  const results = [];
  const note = function (id, meta, body) {
    const ex = store.getIndexRows().filter(function (r) {
      return r.id === id;
    })[0];
    const y = ['id: ' + id, 'title: ' + meta.title, 'topic: ' + meta.topic, 'date: 2026-10-22'];
    if (meta.public !== undefined) y.push('public: ' + meta.public);
    results.push(
      call('saveNote', {
        id: id,
        baseUpdatedAt: ex ? ex.updatedAt : undefined,
        text: '---\n' + y.join('\n') + '\n---\n' + body
      })
    );
  };
  note(
    '20261022-p001',
    { title: '私人筆記標題', topic: 'db-design' },
    '# 私人\nSECRET-BODY-1\n![](assets/20261022-v002.svg)\n'
  );
  note(
    '20261022-p002',
    { title: '公開筆記（來自私人主題）', topic: 'db-design', public: true },
    '# 公開\nPUBLIC-BODY-1，參考 [[20261022-p001]] 與 [[20261022-j001]]。\n![圖](assets/20261022-v001.svg)\n'
  );
  note('20261022-j001', { title: '日記（公開）', topic: 'journal' }, '# 日記\nPUBLIC-BODY-2\n');
  note(
    '20261022-j002',
    { title: '日記（私人）', topic: 'journal', public: false },
    '# 日記\nSECRET-BODY-2\n'
  );

  results.push(
    call('uploadSvg', {
      id: '20261022-v001',
      text: '<svg viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10" onclick="x()"/></svg>'
    })
  );
  results.push(
    call('uploadSvg', {
      id: '20261022-v002',
      text: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>'
    })
  );
  results.push(
    call('saveBoard', {
      topic: 'journal',
      baseUpdatedAt: (store.findFileByName('boards', 'journal.canvas.json') || {}).updatedAt,
      board: {
        nodes: [
          {
            id: 'g1',
            type: 'group',
            label: '私人群組',
            x: 0,
            y: 0,
            width: 400,
            height: 300,
            'x-collapsed': false
          },
          {
            id: 'n1',
            type: 'file',
            file: 'notes/20261022-j001.md',
            x: 500,
            y: 0,
            width: 260,
            height: 140,
            'x-custom': 'keep-me'
          },
          {
            id: 'n2',
            type: 'file',
            file: 'notes/20261022-j002.md',
            x: 20,
            y: 30,
            width: 260,
            height: 140,
            'x-parent': 'g1'
          },
          { id: 'n3', type: 'text', text: '便利貼', x: 500, y: 300, width: 200, height: 100 }
        ],
        edges: [
          { id: 'e1', fromNode: 'n1', toNode: 'n2' },
          { id: 'e2', fromNode: 'n1', toNode: 'n3', 'x-style': 'dashed' }
        ],
        'x-unknown-top': { keep: true }
      }
    })
  );
  return results;
}

/** 手動驗收用：清空索引後由 Drive 重建。分批呼叫直到完成。 */
function devRebuild() {
  const cfg = loadConfig_();
  const store = makeStore_(cfg);
  const owner = { isOwner: true, active: normEmail_(cfg.OWNER_EMAIL) };
  let cursor = null,
    rounds = 0,
    added = 0,
    problems = [];
  do {
    const r = handle_('rebuildIndex', { cursor: cursor }, owner, 'RUN', store);
    if (!r.ok) throw new Error(r.error);
    added += r.added;
    problems = problems.concat(r.problems);
    cursor = r.done ? null : r.cursor;
    rounds++;
  } while (cursor);
  Logger.log(
    '重建完成：' +
      added +
      ' 則，分 ' +
      rounds +
      ' 批；待處理 ' +
      problems.length +
      ' 項 ' +
      JSON.stringify(problems)
  );
}

/** 手動驗收用：清空索引內容（保留表頭），用來驗證 devRebuild 能還原。 */
function devClearIndex() {
  const s = SpreadsheetApp.openById(loadConfig_().SHEET_ID).getSheetByName('index');
  if (s.getLastRow() >= 2) s.getRange(2, 1, s.getLastRow() - 1, INDEX_HEADERS_.length).clearContent();
  Logger.log('索引已清空');
}

/** 手動驗收用：試著把 db-design 改為公開但不附確認，應被擋下並回報受影響筆記數；不會改動任何資料。 */
function devTopicDemo() {
  const cfg = loadConfig_();
  const owner = { isOwner: true, active: normEmail_(cfg.OWNER_EMAIL) };
  const r = handle_(
    'saveTopic',
    { id: 'db-design', title: '資料庫設計', category: '資料庫', status: 'reading', defaultPublic: true },
    owner,
    'RUN',
    makeStore_(cfg)
  );
  Logger.log(JSON.stringify(r));
}

/* ───────── 一鍵自我檢查：在編輯器執行 devSelfCheck，只看最後一行 ───────── */
/**
 * 以真實的 Drive 與 Sheets，驗證能在伺服器內自動驗證的所有項目：
 * 示範資料、重複執行不產生重複檔、訪客視角不外洩、清空索引後可重建、檔案是一般檔案、SVG 已清除、主題公開保護。
 * 網頁部署那一層（網址是否跑新版本）不在這裡，要另外用網址測。
 */
function runSelfCheck_(store) {
  const owner = { isOwner: true, active: 'owner@example.com' };
  const visitor = { isOwner: false, active: '' };
  const lines = [];
  let pass = 0,
    fail = 0;
  const check = function (name, cond) {
    if (cond) {
      pass++;
      lines.push('通過  ' + name);
    } else {
      fail++;
      lines.push('失敗  ' + name);
    }
  };
  const V = function (action, payload) {
    return handle_(action, payload || {}, visitor, 'GET', store);
  };
  const O = function (action, payload) {
    return handle_(action, payload || {}, owner, 'RUN', store);
  };
  const J = function (x) {
    return JSON.stringify(x);
  };
  const ids = function (r) {
    return r.items
      .map(function (i) {
        return i.id;
      })
      .sort();
  };

  const seeded = seedVault_(store, owner);
  check(
    '示範資料全部寫入成功',
    seeded.every(function (r) {
      return r.ok;
    })
  );
  const notesBefore = store.countFiles('notes');
  check(
    '重複執行示範資料不會產生重複檔案',
    seedVault_(store, owner).every(function (r) {
      return r.ok;
    }) && store.countFiles('notes') === notesBefore
  );

  const out = [];
  const list = V('listIndex');
  out.push(list);
  check('訪客列表只有 2 則公開筆記', J(ids(list)) === J(['20261022-j001', '20261022-p002']));
  check(
    '訪客主題清單只有公開的 journal',
    J(
      list.topics.map(function (t) {
        return t.id;
      })
    ) === J(['journal'])
  );
  const priv = V('getNote', { id: '20261022-p001' }),
    none = V('getNote', { id: '20261022-zzzz' });
  check('私人筆記與不存在的回應完全相同', J(priv) === J(none) && priv.error === '找不到');
  const p2 = V('getNote', { id: '20261022-p002' });
  out.push(priv, p2);
  check(
    '公開筆記內的私人連結已轉成純文字',
    p2.ok && p2.body.indexOf('（未公開的筆記）') !== -1 && p2.body.indexOf('20261022-p001') === -1
  );
  const jb = V('getBoard', { topic: 'journal' });
  const dbb = V('getBoard', { topic: 'db-design' });
  out.push(jb, dbb);
  check(
    '公開畫布不含私人卡片與其群組，並保留 x- 欄位',
    jb.ok &&
      J(jb).indexOf('j002') === -1 &&
      J(jb).indexOf('私人群組') === -1 &&
      J(jb).indexOf('keep-me') !== -1
  );
  check('私人主題的畫布訪客取不到', dbb.error === '找不到');
  const s1 = V('getSvg', { id: '20261022-v001' }),
    s2 = V('getSvg', { id: '20261022-v002' }),
    s3 = V('getSvg', { id: '20261022-zzzz' });
  out.push(s1, s2);
  check('被公開筆記引用的 SVG 訪客讀得到', s1.ok === true && s1.svg.indexOf('<svg') === 0);
  check('只被私人筆記引用的 SVG 與不存在的回應相同', J(s2) === J(s3));
  const all = J(out);
  [
    '私人筆記標題',
    'SECRET-BODY',
    '日記（私人）',
    '20261022-p001',
    '20261022-j002',
    '20261022-v002',
    'driveFileId',
    '資料庫設計',
    'db-design'
  ].forEach(function (w) {
    check('訪客回應不含：' + w, all.indexOf(w) === -1);
  });
  check(
    '訪客無法執行任何寫入動作',
    ['saveNote', 'saveBoard', 'saveTopic', 'uploadSvg', 'deleteNote', 'rebuildIndex'].every(function (a) {
      return (
        handle_(a, { id: '20261022-j001', text: 'x', topic: 'journal', title: 'x' }, visitor, 'POST', store)
          .ok !== true
      );
    })
  );
  check('擁有者讀得到私人筆記', O('getNote', { id: '20261022-p001' }).body.indexOf('SECRET-BODY-1') !== -1);

  const before = J(
    O('listIndex').items.sort(function (a, b) {
      return a.id < b.id ? -1 : 1;
    })
  );
  store.clearIndex();
  check('清空索引後列表為空', O('listIndex').items.length === 0);
  let cursor = null,
    guard = 0,
    problems = 0;
  do {
    const r = O('rebuildIndex', { cursor: cursor });
    cursor = r.done ? null : r.cursor;
    problems += (r.problems || []).length;
    guard++;
  } while (cursor && guard < 50);
  const after = J(
    O('listIndex').items.sort(function (a, b) {
      return a.id < b.id ? -1 : 1;
    })
  );
  check('由 Drive 重建後索引與原本完全一致', after === before);
  check(
    '重建後 SVG 的公開判斷仍正確',
    V('getSvg', { id: '20261022-v001' }).ok === true && V('getSvg', { id: '20261022-v002' }).ok === false
  );

  const row = O('listIndex').items[0];
  const noteRow = store.getIndexRows().filter(function (r) {
    return r.id === row.id;
  })[0];
  check(
    '筆記是一般檔案，不是 Google 文件',
    String(store.mimeOf(noteRow.driveFileId)).indexOf('application/vnd.google-apps') === -1
  );
  const svgFile = store.findFileByName('assets', '20261022-v001.svg');
  check(
    'Drive 內的 SVG 已清除腳本與事件屬性',
    !!svgFile && !/script|onclick|onload/i.test(store.readText(svgFile.fileId))
  );

  const ex = O('exportBatch', { limit: 100 }),
    exa = O('exportAssets');
  check(
    '匯出：筆記全文與索引筆數一致',
    ex.ok && ex.notes.length === O('listIndex').items.length && ex.missing.length === 0
  );
  check(
    '匯出：SVG 清單含示範圖',
    exa.ok &&
      exa.assets.some(function (a) {
        return a.id === '20261022-v001';
      })
  );
  check('訪客無法匯出', V('exportBatch').ok !== true && V('exportAssets').ok !== true);

  const ask = O('saveTopic', { id: 'db-design', title: '資料庫設計', defaultPublic: true });
  check(
    '私人主題改公開需要確認，且沒確認就不改動',
    ask.error === '需要確認' && V('listIndex').topics.length === 1
  );

  return { pass: pass, fail: fail, lines: lines };
}

function devSelfCheck() {
  const r = runSelfCheck_(makeStore_(loadConfig_()));
  r.lines.forEach(function (l) {
    Logger.log(l);
  });
  const summary = '自我檢查：' + r.pass + ' 項通過，' + r.fail + ' 項失敗';
  Logger.log(summary);
  if (r.fail > 0) throw new Error(summary + '（失敗項目見執行記錄）');
}

/* ───────── 效能量測：在編輯器執行 devPerf，約 2 到 4 分鐘，結束後自動清除測試資料 ───────── */
/**
 * 量測「讀索引」的伺服器端耗時（對應規劃書 8 章「索引載入後 1 秒內可操作」）：
 *  1. 建立 200 則真實筆記檔（每則約 3 KB）→ 量 listIndex、exportBatch
 *  2. 再補到 6,000 列、20,000 列的測試索引列（不建檔）→ 量 listIndex
 *  3. 一律清除（id 以 29990101- 或 29990102- 開頭）。
 * 數字只含伺服器端處理時間，不含網頁應用程式冷啟動與網路傳輸。
 */
function runPerf_(factory, opts) {
  opts = opts || {};
  const REAL = opts.real || 200,
    STEPS = opts.steps || [6000, 20000],
    GUARD_MS = opts.guardMs || 200000;
  const t0 = Date.now(),
    visitor = { isOwner: false, active: '' },
    owner = { isOwner: true, active: 'owner@example.com' };
  const out = { lines: [], ok: true },
    created = [];
  const log = function (s) {
    out.lines.push(s);
  };
  const median = function (a) {
    a = a.slice().sort(function (x, y) {
      return x - y;
    });
    return a[Math.floor(a.length / 2)];
  };
  const measure = function (label, ctx, method, action, payload) {
    const times = [];
    let size = 0,
      n = 0;
    for (let i = 0; i < 3; i++) {
      const store = factory(),
        t = Date.now();
      const r = handle_(action, payload || {}, ctx, method, store);
      times.push(Date.now() - t);
      size = JSON.stringify(r).length;
      n = (r.items || r.notes || []).length;
    }
    log(label + '：' + median(times) + ' ms（回傳 ' + n + ' 列，約 ' + Math.round(size / 1024) + ' KB）');
  };
  const body = new Array(60).join('這是一段用來模擬筆記內容的文字，共約三千位元組。'); // 約 3 KB
  const idOf = function (prefix, i) {
    return prefix + ('00000' + i.toString(36)).slice(-5);
  };
  const row = function (id, fileId, updatedAt) {
    return {
      id: id,
      title: '效能測試筆記 ' + id,
      topic: '',
      date: '2999-01-01',
      tags: ['perf', '測試'],
      lang: '',
      public: null,
      cover: '',
      driveFileId: fileId,
      updatedAt: updatedAt,
      links: [],
      svgs: [],
      source: ''
    };
  };
  const store0 = factory(),
    base = store0.getIndexRows().length;
  try {
    const realRows = [];
    for (let i = 0; i < REAL && Date.now() - t0 < GUARD_MS; i++) {
      const id = idOf('29990101-', i),
        f = store0.createText(
          'notes',
          id + '.md',
          '---\nid: ' + id + '\ntitle: 效能測試筆記 ' + id + '\ndate: 2999-01-01\n---\n' + body
        );
      created.push(f.fileId);
      realRows.push(row(id, f.fileId, f.updatedAt));
    }
    store0.appendRows(realRows);
    log('建立 ' + realRows.length + ' 則真實筆記，用時 ' + (Date.now() - t0) + ' ms');
    measure('訪客 listIndex @ ' + (base + realRows.length) + ' 列', visitor, 'GET', 'listIndex');
    measure('擁有者 listIndex @ ' + (base + realRows.length) + ' 列', owner, 'RUN', 'listIndex');
    measure(
      '擁有者 exportBatch(50) @ ' + (base + realRows.length) + ' 列（含讀 50 個檔）',
      owner,
      'RUN',
      'exportBatch',
      { limit: 50 }
    );
    let have = realRows.length;
    STEPS.forEach(function (target) {
      if (Date.now() - t0 > GUARD_MS + 40000) {
        log('時間不足，略過 ' + target + ' 列');
        return;
      }
      const extra = [];
      for (let i = have; i < target; i++)
        extra.push(row(idOf('29990102-', i), 'x', '2999-01-01T00:00:00.000Z'));
      for (let k = 0; k < extra.length; k += 4000) store0.appendRows(extra.slice(k, k + 4000));
      have = target;
      measure('訪客 listIndex @ ' + (base + target) + ' 列', visitor, 'GET', 'listIndex');
      measure('擁有者 listIndex @ ' + (base + target) + ' 列', owner, 'RUN', 'listIndex');
    });
  } catch (e) {
    out.ok = false;
    log('量測中斷：' + e.message);
  } finally {
    const removed = factory().removeRowsByPrefix('29990101-') + factory().removeRowsByPrefix('29990102-');
    created.forEach(function (id) {
      try {
        store0.trash(id);
      } catch (e) {
        /* 已不存在 */
      }
    });
    const after = factory().getIndexRows().length;
    log(
      '已清除測試資料：移除 ' +
        removed +
        ' 列、' +
        created.length +
        ' 個檔案（移至垃圾桶）；索引列數 ' +
        base +
        ' → ' +
        after
    );
    if (after !== base) {
      out.ok = false;
      log('警告：索引列數與測試前不同，請執行 devRebuild');
    }
  }
  log('總用時 ' + Math.round((Date.now() - t0) / 1000) + ' 秒');
  return out;
}

function devPerf() {
  const cfg = loadConfig_();
  const store = makeStore_(cfg);
  const r = runPerf_(function () {
    return makeStore_(cfg);
  });
  // 除了執行記錄，另外寫一份到 Drive，方便在 Apps Script 編輯器之外讀取結果。
  const stamp = Utilities.formatDate(new Date(), cfg.TZ || Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  const report = (r.ok ? '[通過]\n' : '[未完整]\n') + r.lines.join('\n') + '\n';
  try {
    store.createText('_backup', 'devPerf-' + stamp + '.txt', report);
  } catch (e) {
    Logger.log('（寫入報告檔失敗，仍可看下方執行記錄）' + e.message);
  }
  r.lines.forEach(function (l) {
    Logger.log(l);
  });
  if (!r.ok) throw new Error('量測未完整（見執行記錄，或 Vault/_backup/devPerf-' + stamp + '.txt）');
}
