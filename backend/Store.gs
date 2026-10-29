/**
 * Store.gs — 正式儲存層：Drive 存檔、Sheets 存索引
 *
 * 約定（規劃書 4.1、4.3）
 *  - 檔名一律用 id；更新一律覆寫同一個檔案，檔案 ID 不變。
 *  - 筆記本體是 Drive 內的一般檔案（不轉成 Google 文件）。
 *  - Sheets 只是目錄，損毀時可由 rebuildIndex 從 Drive 重建。
 *  - 指令碼屬性每次請求只讀一次（見 loadConfig_），避免耗盡每日讀寫額度。
 */

var INDEX_HEADERS_ = [
  'id',
  'title',
  'topic',
  'date',
  'tags',
  'lang',
  'public',
  'cover',
  'driveFileId',
  'updatedAt',
  'links',
  'svgs',
  'source',
  'translationOf'
];
var TOPIC_HEADERS_ = ['id', 'title', 'category', 'status', 'defaultPublic', 'driveFileId'];
var VAULT_FOLDERS_ = ['notes', 'assets', 'topics', 'boards', 'themes', '_backup'];

function loadConfig_() {
  return PropertiesService.getScriptProperties().getProperties();
}

function mimeFor_(name) {
  if (/\.md$/.test(name)) return 'text/markdown';
  if (/\.svg$/.test(name)) return 'image/svg+xml';
  if (/\.json$/.test(name)) return 'application/json';
  return 'text/plain';
}

function rowToArray_(r) {
  return [
    r.id,
    r.title,
    r.topic,
    r.date,
    JSON.stringify(r.tags || []),
    r.lang,
    r.public === true ? 'TRUE' : r.public === false ? 'FALSE' : '',
    r.cover,
    r.driveFileId,
    r.updatedAt,
    (r.links || []).join(','),
    (r.svgs || []).join(','),
    r.source || '',
    r.translationOf || ''
  ];
}

function cellText_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'UTC', 'yyyy-MM-dd'); // 防止 Sheets 把日期字串自動轉成日期
  return v === null || v === undefined ? '' : String(v);
}

function arrayToRow_(a) {
  let tags = [];
  try {
    const t = JSON.parse(cellText_(a[4]) || '[]');
    if (Array.isArray(t)) tags = t.map(String);
  } catch (e) {}
  const pub = cellText_(a[6]).toUpperCase();
  return {
    id: cellText_(a[0]),
    title: cellText_(a[1]),
    topic: cellText_(a[2]),
    date: cellText_(a[3]),
    tags: tags,
    lang: cellText_(a[5]),
    public: pub === 'TRUE' ? true : pub === 'FALSE' ? false : null,
    cover: cellText_(a[7]),
    driveFileId: cellText_(a[8]),
    updatedAt: cellText_(a[9]),
    links: cellText_(a[10])
      .split(',')
      .filter(function (x) {
        return x;
      }),
    svgs: cellText_(a[11])
      .split(',')
      .filter(function (x) {
        return x;
      }), // 舊版索引沒有這欄時為空，執行 devRebuild 即可補齊
    source: cellText_(a[12]),
    translationOf: cellText_(a[13]) // 舊版索引沒有這欄時為空
  };
}

function ensureRows_(sheet, n) {
  const max = sheet.getMaxRows();
  if (max < n) sheet.insertRowsAfter(max, n - max);
}

function writeRows_(sheet, startRow, arrays, width) {
  if (!arrays.length) return;
  ensureRows_(sheet, startRow + arrays.length - 1);
  sheet.getRange(startRow, 1, arrays.length, width).setNumberFormat('@').setValues(arrays);
}

function makeStore_(cfg) {
  let rootFolder = null,
    ss = null,
    memoRows = null,
    memoTopics = null;
  const folders = {};

  function root() {
    return rootFolder || (rootFolder = DriveApp.getFolderById(cfg.ROOT_ID));
  }
  function folder(name) {
    if (!folders[name]) {
      const it = root().getFoldersByName(name);
      folders[name] = it.hasNext() ? it.next() : root().createFolder(name);
    }
    return folders[name];
  }
  function sheet(name) {
    ss = ss || SpreadsheetApp.openById(cfg.SHEET_ID);
    const s = ss.getSheetByName(name) || ss.insertSheet(name);
    const w =
      name === 'index' || name === 'index_tmp'
        ? INDEX_HEADERS_.length
        : name === 'topics'
          ? TOPIC_HEADERS_.length
          : 0;
    if (w && s.getMaxColumns() < w) s.insertColumnsAfter(s.getMaxColumns(), w - s.getMaxColumns());
    return s;
  }
  function iso(file) {
    return file.getLastUpdated().toISOString();
  }
  function findRowIndex(id) {
    const s = sheet('index');
    const last = s.getLastRow();
    if (last < 2) return -1;
    const ids = s.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) if (cellText_(ids[i][0]) === id) return i + 2;
    return -1;
  }

  return {
    now: function () {
      return new Date().toISOString();
    },
    today: function () {
      return Utilities.formatDate(new Date(), cfg.TZ || Session.getScriptTimeZone(), 'yyyy-MM-dd');
    },
    newCode: function () {
      return Utilities.getUuid().replace(/-/g, '').slice(0, 4);
    },

    lock: function (fn) {
      const l = LockService.getScriptLock();
      l.waitLock(10000);
      try {
        memoRows = null;
        memoTopics = null;
        return fn();
      } finally {
        l.releaseLock();
      }
    },

    getIndexRows: function () {
      if (memoRows) return memoRows;
      const s = sheet('index');
      const last = s.getLastRow();
      memoRows =
        last < 2
          ? []
          : s
              .getRange(2, 1, last - 1, INDEX_HEADERS_.length)
              .getValues()
              .map(arrayToRow_)
              .filter(function (r) {
                return r.id;
              });
      return memoRows;
    },
    upsertRow: function (row) {
      const s = sheet('index');
      const at = findRowIndex(row.id);
      writeRows_(
        s,
        at === -1 ? Math.max(s.getLastRow(), 1) + 1 : at,
        [rowToArray_(row)],
        INDEX_HEADERS_.length
      );
      memoRows = null;
    },
    removeRow: function (id) {
      const at = findRowIndex(id);
      if (at !== -1) sheet('index').deleteRow(at);
      memoRows = null;
    },

    getTopics: function () {
      if (memoTopics) return memoTopics;
      const s = sheet('topics');
      const last = s.getLastRow();
      memoTopics =
        last < 2
          ? []
          : s
              .getRange(2, 1, last - 1, TOPIC_HEADERS_.length)
              .getValues()
              .map(function (a) {
                return {
                  id: cellText_(a[0]),
                  title: cellText_(a[1]),
                  category: cellText_(a[2]),
                  status: cellText_(a[3]),
                  defaultPublic: cellText_(a[4]).toUpperCase() === 'TRUE',
                  driveFileId: cellText_(a[5])
                };
              })
              .filter(function (t) {
                return t.id;
              });
      return memoTopics;
    },
    /** 建立或更新主題：寫 topics/<id>.json 與 Sheets（規劃書未列對外端點，目前只供編輯器內的維護函式使用）。 */
    saveTopic: function (t) {
      const name = t.id + '.json';
      const text = JSON.stringify(
        {
          id: t.id,
          title: t.title,
          category: t.category || '',
          status: t.status || '',
          defaultPublic: t.defaultPublic === true
        },
        null,
        2
      );
      let f = this.findFileByName('topics', name),
        fileId;
      if (f) {
        this.updateText(f.fileId, text);
        fileId = f.fileId;
      } else {
        fileId = this.createText('topics', name, text).fileId;
      }
      const s = sheet('topics');
      const ids = s.getLastRow() < 2 ? [] : s.getRange(2, 1, s.getLastRow() - 1, 1).getValues();
      let at = -1;
      for (let i = 0; i < ids.length; i++) if (cellText_(ids[i][0]) === t.id) at = i + 2;
      writeRows_(
        s,
        at === -1 ? Math.max(s.getLastRow(), 1) + 1 : at,
        [
          [
            t.id,
            t.title,
            t.category || '',
            t.status || '',
            t.defaultPublic === true ? 'TRUE' : 'FALSE',
            fileId
          ]
        ],
        TOPIC_HEADERS_.length
      );
      memoTopics = null;
    },

    /** 刪除主題：主題檔與該主題的畫布檔移到垃圾桶，並移除 Sheets 列（呼叫前已確認主題內沒有筆記）。 */
    removeTopic: function (id) {
      const f = this.findFileByName('topics', id + '.json');
      if (f) this.trash(f.fileId);
      const b = this.findFileByName('boards', id + '.canvas.json');
      if (b) this.trash(b.fileId);
      const s = sheet('topics'),
        last = s.getLastRow();
      if (last >= 2) {
        const ids = s.getRange(2, 1, last - 1, 1).getValues();
        for (let i = ids.length - 1; i >= 0; i--) if (cellText_(ids[i][0]) === id) s.deleteRow(i + 2);
      }
      memoTopics = null;
    },

    /* ───── P5：備份、同步所需 ───── */
    nowMs: function () {
      return Date.now();
    },
    config: function () {
      return PropertiesService.getScriptProperties().getProperties();
    },
    getProp: function (k) {
      return PropertiesService.getScriptProperties().getProperty(k);
    },
    setProp: function (k, v) {
      PropertiesService.getScriptProperties().setProperty(k, v);
    },
    hash: function (text) {
      return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text, Utilities.Charset.UTF_8)
        .map(function (b) {
          return ('0' + (b & 255).toString(16)).slice(-2);
        })
        .join('');
    },
    http: function (req) {
      if (String(req.url).indexOf('https://api.github.com/') !== 0)
        throw new Error('只允許連線到 api.github.com');
      const o = {
        method: String(req.method || 'get').toLowerCase(),
        headers: req.headers || {},
        muteHttpExceptions: true,
        followRedirects: false
      };
      if (req.body !== undefined) {
        o.payload = req.body;
        o.contentType = 'application/json';
      }
      const r = UrlFetchApp.fetch(req.url, o);
      return { code: r.getResponseCode(), body: r.getContentText() };
    },
    /** 擷取公開網頁（P6 連結預覽）：只讀前 300 KB，視為 UTF-8；呼叫端須先用 previewUrlOk_ 檢查網址。 */
    fetchPage: function (url) {
      const r = UrlFetchApp.fetch(url, {
        method: 'get',
        muteHttpExceptions: true,
        followRedirects: true,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'Mozilla/5.0 (compatible; VaultPreview/1.0)'
        }
      });
      const bytes = r.getContent();
      const text = Utilities.newBlob(bytes.length > 300000 ? bytes.slice(0, 300000) : bytes).getDataAsString(
        'UTF-8'
      );
      const h = r.getHeaders();
      const ct = String(h['Content-Type'] || h['content-type'] || '');
      return { code: r.getResponseCode(), contentType: ct, text: text };
    },
    listFolder: function (folderName) {
      const it = folder(folderName).getFiles(),
        out = [];
      while (it.hasNext()) {
        const f = it.next();
        if (!f.isTrashed())
          out.push({ fileId: f.getId(), name: f.getName(), updatedAt: iso(f), size: f.getSize() });
      }
      return out;
    },
    createZip: function (folderName, name, files) {
      const blobs = files.map(function (x) {
        return Utilities.newBlob(x.text, 'text/plain', x.path);
      });
      const zip = Utilities.zip(blobs, name),
        f = folder(folderName).createFile(zip);
      return { fileId: f.getId(), size: f.getSize() };
    },
    verifyZip: function (fileId, paths) {
      const names = Utilities.unzip(DriveApp.getFileById(fileId).getBlob()).map(function (b) {
        return b.getName();
      });
      const have = {};
      names.forEach(function (n) {
        have[n] = true;
      });
      return {
        ok:
          names.length === paths.length &&
          paths.every(function (p) {
            return have[p];
          }),
        count: names.length
      };
    },
    triggerList: function () {
      return ScriptApp.getProjectTriggers().map(function (t) {
        return t.getHandlerFunction();
      });
    },
    triggerEnsure: function (handler, spec) {
      if (this.triggerList().indexOf(handler) >= 0) return;
      const b = ScriptApp.newTrigger(handler).timeBased();
      if (spec.type === 'monthly') b.onMonthDay(spec.day).atHour(spec.hour).create();
      else b.everyDays(1).atHour(spec.hour).create();
    },
    triggerRemove: function (handler) {
      ScriptApp.getProjectTriggers().forEach(function (t) {
        if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t);
      });
    },
    scheduleOnce: function (handler, ms) {
      this.triggerRemove(handler);
      ScriptApp.newTrigger(handler).timeBased().after(ms).create();
    },

    readText: function (fileId) {
      return DriveApp.getFileById(fileId).getBlob().getDataAsString('UTF-8');
    },
    createText: function (folderName, name, text) {
      const f = folder(folderName).createFile(name, text, mimeFor_(name));
      return { fileId: f.getId(), updatedAt: iso(f) };
    },
    updateText: function (fileId, text) {
      const f = DriveApp.getFileById(fileId);
      f.setContent(text);
      return iso(f);
    },
    findFileByName: function (folderName, name) {
      const it = folder(folderName).getFilesByName(name);
      while (it.hasNext()) {
        const f = it.next();
        if (!f.isTrashed()) return { fileId: f.getId(), updatedAt: iso(f) };
      }
      return null;
    },
    trash: function (fileId) {
      DriveApp.getFileById(fileId).setTrashed(true);
    },
    mimeOf: function (fileId) {
      return DriveApp.getFileById(fileId).getMimeType();
    },
    countFiles: function (folderName) {
      const it = folder(folderName).getFiles();
      let n = 0;
      while (it.hasNext()) {
        it.next();
        n++;
      }
      return n;
    },
    /** 效能量測用：一次寫入多列索引、依 id 前綴一次移除多列（只供 devPerf 使用）。 */
    appendRows: function (rows) {
      const s = sheet('index');
      writeRows_(s, Math.max(s.getLastRow(), 1) + 1, rows.map(rowToArray_), INDEX_HEADERS_.length);
      memoRows = null;
    },
    removeRowsByPrefix: function (prefix) {
      const s = sheet('index'),
        last = s.getLastRow();
      if (last < 2) return 0;
      const vals = s.getRange(2, 1, last - 1, INDEX_HEADERS_.length).getValues();
      const keep = vals.filter(function (r) {
        return cellText_(r[0]).indexOf(prefix) !== 0;
      });
      s.getRange(2, 1, last - 1, INDEX_HEADERS_.length).clearContent();
      writeRows_(s, 2, keep, INDEX_HEADERS_.length);
      memoRows = null;
      return vals.length - keep.length;
    },
    clearIndex: function () {
      const s = sheet('index');
      if (s.getLastRow() >= 2) s.getRange(2, 1, s.getLastRow() - 1, INDEX_HEADERS_.length).clearContent();
      memoRows = null;
    },

    /* ───── 重建索引：先寫暫存工作表，完成後一次換上，中斷不會留下半份索引 ───── */
    beginRebuild: function () {
      const s = sheet('index_tmp');
      s.clear();
      s.getRange(1, 1, 1, INDEX_HEADERS_.length).setNumberFormat('@').setValues([INDEX_HEADERS_]);
    },
    listFilesPage: function (folderName, cursor, limit, ext) {
      ext = ext || '.md';
      const it = cursor ? DriveApp.continueFileIterator(cursor) : folder(folderName).getFiles();
      const files = [];
      while (files.length < limit && it.hasNext()) {
        const f = it.next();
        if (f.getName().slice(-ext.length) === ext)
          files.push({ fileId: f.getId(), name: f.getName(), updatedAt: iso(f) });
      }
      return { files: files, cursor: it.hasNext() ? it.getContinuationToken() : null };
    },
    appendRebuildRows: function (rows) {
      const s = sheet('index_tmp');
      const last = s.getLastRow();
      const have = {};
      if (last >= 2)
        s.getRange(2, 1, last - 1, 1)
          .getValues()
          .forEach(function (r) {
            have[cellText_(r[0])] = true;
          });
      const dup = [],
        fresh = [];
      rows.forEach(function (r) {
        if (have[r.id]) dup.push(r.id);
        else {
          have[r.id] = true;
          fresh.push(rowToArray_(r));
        }
      });
      writeRows_(s, last + 1, fresh, INDEX_HEADERS_.length);
      return dup;
    },
    finishRebuild: function () {
      const tmp = sheet('index_tmp'),
        idx = sheet('index');
      const last = tmp.getLastRow();
      const data = last < 2 ? [] : tmp.getRange(2, 1, last - 1, INDEX_HEADERS_.length).getValues();
      if (idx.getLastRow() >= 2)
        idx.getRange(2, 1, idx.getLastRow() - 1, INDEX_HEADERS_.length).clearContent();
      writeRows_(idx, 2, data, INDEX_HEADERS_.length);
      ss.deleteSheet(tmp);
      memoRows = null;
    },
    rebuildTopics: function () {
      const it = folder('topics').getFiles();
      const rows = [];
      while (it.hasNext()) {
        const f = it.next();
        if (!/\.json$/.test(f.getName())) continue;
        try {
          const t = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
          if (t && TOPIC_RE.test(String(t.id)) && f.getName() === t.id + '.json') {
            rows.push([
              t.id,
              String(t.title || ''),
              String(t.category || ''),
              String(t.status || ''),
              t.defaultPublic === true ? 'TRUE' : 'FALSE',
              f.getId()
            ]);
          }
        } catch (e) {
          /* 壞掉的主題檔略過，主題一律預設私人 */
        }
      }
      const s = sheet('topics');
      if (s.getLastRow() >= 2) s.getRange(2, 1, s.getLastRow() - 1, TOPIC_HEADERS_.length).clearContent();
      writeRows_(s, 2, rows, TOPIC_HEADERS_.length);
      memoTopics = null;
    }
  };
}
