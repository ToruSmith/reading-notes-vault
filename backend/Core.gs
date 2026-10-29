/**
 * Core.gs — 讀書筆記 Vault 核心邏輯（P1）
 *
 * 所有函式都不直接碰 Drive 或 Sheets，儲存層由參數 store 傳入（正式版見 Store.gs），
 * 因此可在離線環境用假儲存層完整測試。
 *
 * 安全原則（規劃書 4.5、6.2、6.6）
 *  - 公開與否一律在這裡判斷，前端不負責隱藏。
 *  - 寫入類動作先驗證擁有者，再處理內容；失敗只回通用錯誤。
 *  - 訪客讀不到私人筆記時，回應與「不存在」完全相同。
 */

/* ───────── 常數 ───────── */
var NOT_FOUND = { ok: false, error: '找不到' };
var DENY = { ok: false, error: '無法完成' };

/** 大小只做「提醒」，不擋存檔（使用者決定）；HARD_BYTES 是避免單次請求拖垮 Apps Script 的技術防線。 */
var LIMITS = {
  WARN_MD_BYTES: 100 * 1024,
  WARN_SVG_BYTES: 100 * 1024,
  WARN_IMG_BYTES: 1024 * 1024,
  HTML_BYTES: 500 * 1024,
  HARD_BYTES: 5 * 1024 * 1024,
  MAX_TITLE: 200,
  REBUILD_PAGE: 150
};

var ID_RE = /^\d{8}-[a-z0-9]{2,8}$/;
var TOPIC_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
var LANGS = ['zh-Hant', 'en'];
var LINK_RE = /\[\[([^\[\]\n]+?)\]\]/g;
var UNPUBLISHED_TEXT = '（未公開的筆記）';

/* ───────── 小工具 ───────── */
function utf8Bytes_(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

function sizeWarning_(label, bytes, warnBytes) {
  if (bytes <= warnBytes) return null;
  return (
    label +
    '大小約 ' +
    Math.round(bytes / 1024) +
    ' KB，超過建議的 ' +
    Math.round(warnBytes / 1024) +
    ' KB。仍已存檔，建議拆分。'
  );
}

function isRealDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function asBool_(v) {
  if (v === true || v === false) return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}

/* ───────── front matter ───────── */
function parseFrontMatter_(text) {
  const t = String(text)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
  const m = /^---\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/.exec(t);
  if (!m) return { ok: true, meta: {}, body: t, hasFrontMatter: false };
  let obj;
  try {
    obj = jsyaml.load(m[1] || '', { schema: jsyaml.JSON_SCHEMA });
  } catch (e) {
    return { ok: false, reason: 'front matter 不是有效的 YAML：' + String(e.message).split('\n')[0] };
  }
  if (obj === null || obj === undefined) obj = {};
  if (typeof obj !== 'object' || Array.isArray(obj))
    return { ok: false, reason: 'front matter 必須是「鍵: 值」的形式' };
  return { ok: true, meta: obj, body: t.slice(m[0].length), hasFrontMatter: true };
}

/** 正規化已知欄位，未知欄位原樣保留。回傳 {ok, meta} 或 {ok:false, errors}。 */
function normalizeMeta_(raw, ctx) {
  const errors = [];
  const meta = {};
  const str = function (v) {
    return v === undefined || v === null ? '' : String(v).trim();
  };

  const title = str(raw.title);
  if (!title) errors.push('缺少 title');
  else if (title.length > LIMITS.MAX_TITLE) errors.push('title 超過 ' + LIMITS.MAX_TITLE + ' 字');
  meta.title = title;

  const topic = str(raw.topic);
  if (topic) {
    if (!TOPIC_RE.test(topic)) errors.push('topic 必須是主題 id（小寫英數與連字號）：' + topic);
    else if (!ctx.topicIds[topic]) errors.push('找不到主題：' + topic);
  }
  meta.topic = topic;

  let date = str(raw.date);
  if (!date) date = ctx.today;
  else if (!isRealDate_(date)) errors.push('date 必須是 YYYY-MM-DD：' + date);
  meta.date = date;

  let tags = raw.tags;
  if (tags === undefined || tags === null || tags === '') tags = [];
  else if (typeof tags === 'string') tags = tags.split(',');
  if (!Array.isArray(tags)) {
    errors.push('tags 必須是清單');
    tags = [];
  }
  const seen = {};
  meta.tags = tags
    .map(function (x) {
      return str(x);
    })
    .filter(function (x) {
      if (!x || seen[x]) return false;
      seen[x] = true;
      return true;
    });

  const cover = str(raw.cover);
  if (cover && !ID_RE.test(cover)) errors.push('cover 必須是 SVG 的 id：' + cover);
  meta.cover = cover;

  const lang = str(raw.lang);
  if (lang && LANGS.indexOf(lang) === -1) errors.push('lang 只能是 zh-Hant 或 en：' + lang);
  meta.lang = lang;

  if (raw.public !== undefined && raw.public !== null && raw.public !== '') {
    const b = asBool_(raw.public);
    if (b === undefined) errors.push('public 必須是 true 或 false');
    else meta.public = b;
  }

  const source = str(raw.source);
  if (source) meta.source = source.slice(0, 255);

  const tof = str(raw.translation_of); // 另一語言版本的筆記 id（選填）
  if (tof && !ID_RE.test(tof)) errors.push('translation_of 必須是筆記的 id：' + tof);
  else if (tof && ctx.selfId && tof === ctx.selfId) errors.push('translation_of 不能指向自己');
  else if (tof) meta.translation_of = tof;

  const known = {
    id: 1,
    title: 1,
    topic: 1,
    date: 1,
    tags: 1,
    cover: 1,
    lang: 1,
    public: 1,
    source: 1,
    translation_of: 1
  };
  Object.keys(raw).forEach(function (k) {
    if (!known[k] && raw[k] !== undefined) meta[k] = raw[k];
  });

  return errors.length ? { ok: false, errors: errors } : { ok: true, meta: meta };
}

function serializeNote_(id, meta, body) {
  const ordered = { id: id };
  ['title', 'topic', 'date', 'tags', 'cover', 'lang', 'public', 'source', 'translation_of'].forEach(
    function (k) {
      const v = meta[k];
      if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return; // 空值不寫進 front matter
      ordered[k] = v;
    }
  );
  Object.keys(meta).forEach(function (k) {
    if (!(k in ordered) && meta[k] !== undefined) ordered[k] = meta[k];
  });
  const y = jsyaml.dump(ordered, {
    schema: jsyaml.JSON_SCHEMA,
    lineWidth: -1,
    noRefs: true,
    skipInvalid: true
  });
  return '---\n' + y + '---\n' + body;
}

function extractLinks_(body) {
  const ids = [],
    seen = {};
  let m;
  const re = new RegExp(LINK_RE.source, 'g');
  while ((m = re.exec(body)) !== null) {
    const id = m[1].trim();
    if (ID_RE.test(id) && !seen[id]) {
      seen[id] = true;
      ids.push(id);
    }
  }
  return ids;
}

/** 內文以標準 Markdown 圖片語法引用 SVG：![說明](assets/<id>.svg)。回傳被引用的 SVG id。 */
function extractSvgRefs_(body) {
  const ids = [],
    seen = {};
  const re = /assets\/(\d{8}-[a-z0-9]{2,8})\.svg/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (!seen[m[1]]) {
      seen[m[1]] = true;
      ids.push(m[1]);
    }
  }
  return ids;
}

/* ───────── 公開規則（規劃書 4.5） ───────── */
function topicMap_(topics) {
  const m = {};
  topics.forEach(function (t) {
    m[t.id] = t;
  });
  return m;
}
function isTopicPublic_(topic) {
  return !!topic && topic.defaultPublic === true;
}

/** 筆記有 public 就用筆記的；沒填用主題的 defaultPublic；主題也沒設視為私人。 */
function isNotePublic_(row, tmap) {
  if (row.public === true) return true;
  if (row.public === false) return false;
  return isTopicPublic_(tmap[row.topic]);
}

function publicIdSet_(rows, tmap) {
  const s = {};
  rows.forEach(function (r) {
    if (isNotePublic_(r, tmap)) s[r.id] = true;
  });
  return s;
}

/** 訪客看到的列：只含公開欄位；私人主題名稱一律隱藏（D18）；links 只留公開目標。 */
function visitorRow_(row, tmap, pubIds) {
  return {
    id: row.id,
    title: row.title,
    topic: isTopicPublic_(tmap[row.topic]) ? row.topic : '',
    date: row.date,
    tags: row.tags,
    lang: row.lang,
    cover: row.cover,
    public: true,
    updatedAt: row.updatedAt,
    translationOf: row.translationOf && pubIds[row.translationOf] === true ? row.translationOf : '', // 指向私人筆記的翻譯關聯不外洩
    links: row.links.filter(function (id) {
      return pubIds[id] === true;
    })
  };
}

function ownerRow_(row) {
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    date: row.date,
    tags: row.tags,
    lang: row.lang,
    cover: row.cover,
    public: row.public,
    updatedAt: row.updatedAt,
    links: row.links,
    source: row.source || '',
    translationOf: row.translationOf || ''
  };
}

function rewriteLinksForVisitor_(body, pubIds) {
  return body.replace(new RegExp(LINK_RE.source, 'g'), function (whole, inner) {
    const id = inner.trim();
    if (!ID_RE.test(id)) return whole;
    return pubIds[id] === true ? whole : UNPUBLISHED_TEXT;
  });
}

/* ───────── 畫布（規劃書 4.4、6.6） ───────── */
function noteIdFromPath_(p) {
  const m = /^notes\/(\d{8}-[a-z0-9]{2,8})\.md$/.exec(String(p || ''));
  return m ? m[1] : null;
}
function isAssetPath_(p) {
  return /^assets\/\d{8}-[a-z0-9]{2,8}\.(svg|img|html)$/.test(String(p || ''));
}

/**
 * 訪客版畫布：移除指向私人筆記的卡片、連到這些卡片的連線，以及因此變空的群組。
 * 只過濾陣列，不改寫保留下來的節點，所以 x- 自訂欄位與不認得的欄位都原樣保留。
 * 無法辨識的 file 路徑一律移除（失敗即拒絕）。
 */
function filterBoardForVisitor_(board, pubIds) {
  const nodes = Array.isArray(board.nodes) ? board.nodes : [];
  const edges = Array.isArray(board.edges) ? board.edges : [];

  const originalChildren = {};
  nodes.forEach(function (n) {
    const p = n['x-parent'];
    if (p) originalChildren[p] = (originalChildren[p] || 0) + 1;
  });

  let alive = nodes.filter(function (n) {
    if (n.type !== 'file') return true;
    const nid = noteIdFromPath_(n.file);
    if (nid) return pubIds[nid] === true;
    return isAssetPath_(n.file);
  });

  let changed = true;
  while (changed) {
    changed = false;
    const aliveChildren = {};
    alive.forEach(function (n) {
      const p = n['x-parent'];
      if (p) aliveChildren[p] = (aliveChildren[p] || 0) + 1;
    });
    const next = alive.filter(function (n) {
      if (n.type === 'group' && originalChildren[n.id] > 0 && !aliveChildren[n.id]) {
        changed = true;
        return false;
      }
      return true;
    });
    alive = next;
  }

  const ids = {};
  alive.forEach(function (n) {
    ids[n.id] = true;
  });
  const keptEdges = edges.filter(function (e) {
    return ids[e.fromNode] === true && ids[e.toNode] === true;
  });

  const out = {};
  Object.keys(board).forEach(function (k) {
    out[k] = board[k];
  });
  out.nodes = alive;
  out.edges = keptEdges;
  return out;
}

function validateBoard_(board) {
  const errors = [];
  if (!board || typeof board !== 'object' || Array.isArray(board)) return ['畫布必須是 JSON 物件'];
  if (board.nodes !== undefined && !Array.isArray(board.nodes)) errors.push('nodes 必須是陣列');
  if (board.edges !== undefined && !Array.isArray(board.edges)) errors.push('edges 必須是陣列');
  if (errors.length) return errors;
  const ids = {};
  (board.nodes || []).forEach(function (n, i) {
    if (!n || typeof n.id !== 'string' || !n.id || typeof n.type !== 'string') {
      errors.push('第 ' + (i + 1) + ' 個節點缺少 id 或 type');
      return;
    }
    if (ids[n.id]) errors.push('節點 id 重複：' + n.id);
    ids[n.id] = true;
  });
  (board.edges || []).forEach(function (e, i) {
    if (!e || typeof e.id !== 'string' || !ids[e.fromNode] || !ids[e.toNode])
      errors.push('第 ' + (i + 1) + ' 條連線指向不存在的節點');
  });
  return errors;
}

/** PUBLIC_URL（指令碼屬性）→ 分享連結的網址開頭；格式不符一律回空字串。 */
function publicBase_(v) {
  const u = String(v || '').trim();
  return /^https:\/\/script\.google\.com\/[A-Za-z0-9_\/.-]+$/.test(u) ? u : '';
}

/**
 * 網址參數 → 前端的初始路由。只接受格式正確的值（筆記 id、主題 id、語言），其餘一律丟棄；
 * 輸出的 JSON 把 < > & 與行分隔字元跳脫，放進 <script> 內是安全的。
 * 例：?note=20261024-a1&lang=en
 */
function routeJson_(params, baseUrl) {
  params = params || {};
  const r = {
    base: /^https:\/\/script\.google\.com\/[A-Za-z0-9_\/.-]+$/.test(String(baseUrl || ''))
      ? String(baseUrl)
      : ''
  };
  const note = String(params.note || ''),
    topic = String(params.topic || ''),
    lang = String(params.lang || '');
  if (ID_RE.test(note)) r.note = note;
  if (TOPIC_RE.test(topic)) {
    r.topic = topic;
    if (String(params.board || '') === '1') r.board = true;
  } // board=1：直接開啟該主題的畫布
  if (lang === 'zh' || lang === 'en') r.lang = lang;
  return JSON.stringify(r)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/* ───────── 端點分派 ───────── */
/**
 * action 與 payload 來自網路，不可信。
 * method：'GET'（REST，一律以訪客處理）、'POST'、'RUN'（google.script.run，由網頁呼叫）。
 * ctx：{ isOwner, active }。
 */
/** 需要擁有者身分的動作（寫入，以及會一次讀出大量全文的匯出）。訪客與 REST GET 一律拒絕。 */
var WRITE_ACTIONS_ = {
  saveNote: 1,
  saveBoard: 1,
  saveTopic: 1,
  uploadSvg: 1,
  deleteNote: 1,
  deleteTopic: 1,
  updateNotes: 1,
  previewPublic: 1,
  previewNote: 1,
  previewSvg: 1,
  deleteNotes: 1,
  deleteBoard: 1,
  fetchPreview: 1,
  backupStatus: 1,
  backupRun: 1,
  backupTrigger: 1,
  siteStatus: 1,
  syncSite: 1,
  syncTrigger: 1,
  rebuildIndex: 1,
  exportBatch: 1,
  exportAssets: 1,
  uploadImage: 1,
  exportImages: 1,
  saveOrder: 1,
  uploadHtml: 1,
  exportHtml: 1,
  scanAssets: 1,
  trashAssets: 1
};

function handle_(action, payload, ctx, method, store) {
  payload = payload || {};
  const isWrite = WRITE_ACTIONS_[action] === 1;
  if (isWrite && (method === 'GET' || ctx.isOwner !== true)) return DENY; // 先驗證，再處理
  const owner = ctx.isOwner === true && method !== 'GET'; // REST 讀取一律當訪客

  switch (action) {
    case 'whoami':
      return {
        ok: true,
        loggedIn: !!ctx.active,
        isOwner: owner,
        serverTime: store.now(),
        publicUrl: publicBase_(store.getProp('PUBLIC_URL'))
      };
    case 'listIndex':
      return listIndex_(owner, store);
    case 'getNote':
      return getNote_(payload, owner, store);
    case 'getBoard':
      return getBoard_(payload, owner, store);
    case 'getSvg':
      return getSvg_(payload, owner, store);
    case 'getImage':
      return getImage_(payload, owner, store);
    case 'uploadImage':
      return uploadImage_(payload, store);
    case 'exportImages':
      return exportImages_(payload, store);
    case 'getHtml':
      return getHtml_(payload, owner, store);
    case 'uploadHtml':
      return uploadHtml_(payload, store);
    case 'exportHtml':
      return exportHtml_(payload, store);
    case 'scanAssets':
      return scanAssets_(store);
    case 'trashAssets':
      return trashAssets_(payload, store);
    case 'saveTopic':
      return saveTopic_(payload, store);
    case 'exportBatch':
      return exportBatch_(payload, store);
    case 'exportAssets':
      return exportAssets_(payload, store);
    case 'saveNote':
      return saveNote_(payload, store);
    case 'saveBoard':
      return saveBoard_(payload, store);
    case 'uploadSvg':
      return uploadSvg_(payload, store);
    case 'deleteNote':
      return deleteNote_(payload, store);
    case 'deleteTopic':
      return deleteTopic_(payload, store);
    case 'saveOrder':
      return saveOrder_(payload, store);
    case 'updateNotes':
      return updateNotes_(payload, store);
    case 'deleteNotes':
      return deleteNotes_(payload, store);
    case 'deleteBoard':
      return deleteBoard_(payload, store);
    case 'fetchPreview':
      return fetchPreview_(payload, store);
    case 'previewPublic':
      return listIndex_(false, store); // 擁有者預覽：與訪客完全相同的程式路徑與結果
    case 'previewNote':
      return getNote_(payload, false, store);
    case 'previewSvg':
      return getSvg_(payload, false, store);
    case 'backupStatus':
      return backupStatus_(store);
    case 'backupRun':
      return backupRun_(payload, store);
    case 'backupTrigger':
      return triggerToggle_(payload, store, 'scheduledBackup', { type: 'monthly', day: 1, hour: 3 });
    case 'siteStatus':
      return siteStatus_(store);
    case 'syncSite':
      return syncSite_(payload, store);
    case 'syncTrigger':
      return triggerToggle_(payload, store, 'scheduledSync', { type: 'daily', hour: 4 });
    case 'rebuildIndex':
      return rebuildIndex_(payload, store);
    default:
      return DENY;
  }
}

function topicOut_(t, owner) {
  const o = { id: t.id, title: t.title, category: t.category, status: t.status };
  if (owner) o.defaultPublic = t.defaultPublic === true;
  return o;
}

/** 回傳索引與主題清單。訪客只拿到公開主題；私人主題的名稱、分類、數量一律不出現（D18）。 */
function listIndex_(owner, store) {
  const rows = store.getIndexRows();
  const topics = store.getTopics();
  if (owner)
    return {
      ok: true,
      items: rows.map(ownerRow_),
      topics: topics.map(function (t) {
        return topicOut_(t, true);
      }),
      order: readOrder_(store, null),
      generatedAt: store.now()
    };
  const tmap = topicMap_(topics);
  const pub = publicIdSet_(rows, tmap);
  const items = rows
    .filter(function (r) {
      return pub[r.id] === true;
    })
    .map(function (r) {
      return visitorRow_(r, tmap, pub);
    });
  const pubTopics = topics.filter(isTopicPublic_).map(function (t) {
    return topicOut_(t, false);
  });
  return {
    ok: true,
    items: items,
    topics: pubTopics,
    order: readOrder_(store, pubTopics),
    generatedAt: store.now()
  };
}

/* ───── 書櫃／分類頁簽的順序（P14）─────
 * 存在 Script Properties 的 VAULT_ORDER：{ cats: [分類名…], topics: [主題 id…] }，兩個部署共用。
 * 沒列到的分類／主題由前端排在後面（依標題）。訪客只拿到公開主題與其分類，私人名稱不外洩。 */
var ORDER_PROP_ = 'VAULT_ORDER';
function readOrder_(store, visibleTopics) {
  let o = { cats: [], topics: [] };
  try {
    const j = JSON.parse(store.getProp(ORDER_PROP_) || '{}');
    if (j && Array.isArray(j.cats) && Array.isArray(j.topics)) o = { cats: j.cats, topics: j.topics };
  } catch (e) {
    /* 壞掉就當沒有 */
  }
  if (!visibleTopics) return o;
  const ids = {},
    cats = {};
  visibleTopics.forEach(function (t) {
    ids[t.id] = true;
    if (t.category) cats[t.category] = true;
  });
  return {
    cats: o.cats.filter(function (c) {
      return cats[c];
    }),
    topics: o.topics.filter(function (i) {
      return ids[i];
    })
  };
}
/** 擁有者儲存順序；格式不對就整份拒絕（不做部分寫入）。 */
function saveOrder_(payload, store) {
  const cats = payload.cats,
    topics = payload.topics;
  if (!Array.isArray(cats) || !Array.isArray(topics) || cats.length > 200 || topics.length > 400)
    return { ok: false, error: '順序格式不符' };
  const okCat = cats.every(function (c) {
    return typeof c === 'string' && c.length > 0 && c.length <= 50;
  });
  const okId = topics.every(function (i) {
    return typeof i === 'string' && TOPIC_RE.test(i);
  });
  if (!okCat || !okId) return { ok: false, error: '順序格式不符' };
  const text = JSON.stringify({ cats: cats, topics: topics });
  if (text.length > 8000) return { ok: false, error: '順序格式不符' };
  store.setProp(ORDER_PROP_, text);
  return { ok: true };
}

function getNote_(payload, owner, store) {
  const id = String(payload.id || '');
  if (!ID_RE.test(id)) return NOT_FOUND;
  const rows = store.getIndexRows();
  const row = rows.filter(function (r) {
    return r.id === id;
  })[0];
  if (!row) return NOT_FOUND;
  const tmap = topicMap_(store.getTopics());
  const pub = publicIdSet_(rows, tmap);
  if (!owner && pub[id] !== true) return NOT_FOUND; // 私人與不存在無法區分

  const text = store.readText(row.driveFileId);
  const fm = parseFrontMatter_(text);
  const body = fm.ok ? fm.body : text;
  if (owner) {
    return {
      ok: true,
      meta: ownerRow_(row),
      source: fm.ok ? fm.meta.source || '' : '',
      body: body,
      text: text,
      updatedAt: row.updatedAt
    };
  }
  return {
    ok: true,
    meta: visitorRow_(row, tmap, pub),
    body: rewriteLinksForVisitor_(body, pub),
    updatedAt: row.updatedAt
  };
}

function getBoard_(payload, owner, store) {
  const topic = String(payload.topic || '');
  if (!TOPIC_RE.test(topic)) return NOT_FOUND;
  const tmap = topicMap_(store.getTopics());
  if (!tmap[topic]) return NOT_FOUND;
  if (!owner && !isTopicPublic_(tmap[topic])) return NOT_FOUND; // 畫布隨主題

  const f = store.findFileByName('boards', topic + '.canvas.json');
  if (!f) return { ok: true, board: { nodes: [], edges: [] }, updatedAt: null };
  let board;
  try {
    board = JSON.parse(store.readText(f.fileId));
  } catch (e) {
    return owner ? { ok: false, error: '畫布檔不是有效的 JSON' } : NOT_FOUND;
  }
  if (owner) return { ok: true, board: board, updatedAt: f.updatedAt };

  const rows = store.getIndexRows();
  const pub = publicIdSet_(rows, tmap);
  return { ok: true, board: filterBoardForVisitor_(board, pub), updatedAt: f.updatedAt };
}

function newId_(datePart, rows, store) {
  const used = {};
  rows.forEach(function (r) {
    used[r.id] = true;
  });
  const d = datePart.replace(/-/g, '');
  for (let k = 0; k < 20; k++) {
    const id = d + '-' + store.newCode();
    if (!used[id]) return id;
  }
  return d + '-' + store.newCode() + store.newCode();
}

function saveNote_(payload, store) {
  const text = payload.text;
  if (typeof text !== 'string') return { ok: false, error: '內容不符規則', reasons: ['text 必須是字串'] };
  const bytes = utf8Bytes_(text);
  if (bytes > LIMITS.HARD_BYTES)
    return { ok: false, error: '內容不符規則', reasons: ['單則筆記超過 5 MB 的技術上限'] };

  const fm = parseFrontMatter_(text);
  if (!fm.ok) return { ok: false, error: '內容不符規則', reasons: [fm.reason] };

  const wanted =
    payload.id !== undefined && payload.id !== null && payload.id !== ''
      ? String(payload.id)
      : fm.meta.id !== undefined
        ? String(fm.meta.id)
        : '';
  if (wanted && !ID_RE.test(wanted))
    return { ok: false, error: '內容不符規則', reasons: ['id 格式必須是「日期-短碼」，例如 20261022-a1'] };

  return store.lock(function () {
    const rows = store.getIndexRows();
    const topics = store.getTopics();
    const topicIds = {};
    topics.forEach(function (t) {
      topicIds[t.id] = true;
    });

    const norm = normalizeMeta_(fm.meta, { topicIds: topicIds, today: store.today(), selfId: wanted });
    if (!norm.ok) return { ok: false, error: '內容不符規則', reasons: norm.errors };

    const existing = wanted
      ? rows.filter(function (r) {
          return r.id === wanted;
        })[0]
      : null;
    const id = wanted || newId_(norm.meta.date, rows, store);
    const finalText = serializeNote_(id, norm.meta, fm.body);

    const warnings = [];
    const w = sizeWarning_('這則筆記', bytes, LIMITS.WARN_MD_BYTES);
    if (w) warnings.push(w);

    const links = extractLinks_(fm.body);
    const row = {
      id: id,
      title: norm.meta.title,
      topic: norm.meta.topic,
      date: norm.meta.date,
      tags: norm.meta.tags,
      lang: norm.meta.lang,
      public: norm.meta.public === undefined ? null : norm.meta.public,
      cover: norm.meta.cover,
      driveFileId: '',
      updatedAt: '',
      links: links,
      svgs: extractSvgRefs_(fm.body),
      source: norm.meta.source || '',
      translationOf: norm.meta.translation_of || ''
    };

    if (existing) {
      if (payload.baseUpdatedAt !== existing.updatedAt) {
        if (store.readText(existing.driveFileId) === finalText) {
          // 重送：內容相同，視為成功，不重複寫入
          return { ok: true, id: id, updatedAt: existing.updatedAt, deduped: true, warnings: warnings };
        }
        return {
          ok: false,
          error: '衝突',
          code: 409,
          server: { updatedAt: existing.updatedAt, text: store.readText(existing.driveFileId) }
        };
      }
      row.driveFileId = existing.driveFileId;
      row.updatedAt = store.updateText(existing.driveFileId, finalText);
    } else {
      if (payload.baseUpdatedAt) return { ok: false, error: '衝突', code: 409, server: null }; // 附了版本卻找不到原筆記
      const created = store.createText('notes', id + '.md', finalText);
      row.driveFileId = created.fileId;
      row.updatedAt = created.updatedAt;
    }
    store.upsertRow(row);
    return { ok: true, id: id, updatedAt: row.updatedAt, created: !existing, warnings: warnings };
  });
}

function deleteNote_(payload, store) {
  const id = String(payload.id || '');
  if (!ID_RE.test(id)) return NOT_FOUND;
  return store.lock(function () {
    const row = store.getIndexRows().filter(function (r) {
      return r.id === id;
    })[0];
    if (!row) return NOT_FOUND;
    store.trash(row.driveFileId); // 移到垃圾桶，不做永久刪除
    store.removeRow(id);
    return { ok: true, id: id };
  });
}

/** 批次刪除：逐則移到垃圾桶（不永久刪除）並移出索引；一次最多 BATCH_MAX 則，逐則回報。 */
function deleteNotes_(payload, store) {
  const ids = [],
    seen = {};
  (Array.isArray(payload.ids) ? payload.ids : []).forEach(function (x) {
    const id = String(x);
    if (!seen[id]) {
      seen[id] = true;
      ids.push(id);
    }
  });
  if (!ids.length) return { ok: false, error: '內容不符規則', reasons: ['沒有指定筆記'] };
  if (ids.length > BATCH_MAX)
    return { ok: false, error: '內容不符規則', reasons: ['一次最多 ' + BATCH_MAX + ' 則'] };
  if (
    !ids.every(function (id) {
      return ID_RE.test(id);
    })
  )
    return { ok: false, error: '內容不符規則', reasons: ['id 格式必須是「日期-短碼」'] };
  return store.lock(function () {
    const byId = {};
    store.getIndexRows().forEach(function (r) {
      byId[r.id] = r;
    });
    const deleted = [],
      failed = [];
    ids.forEach(function (id) {
      const r = byId[id];
      if (!r) {
        failed.push({ id: id, reason: '找不到' });
        return;
      }
      try {
        store.trash(r.driveFileId);
        store.removeRow(id);
        deleted.push(id);
      } catch (e) {
        failed.push({ id: id, reason: '讀不到檔案' });
      }
    });
    return { ok: true, deleted: deleted, failed: failed };
  });
}

/**
 * 批次修改筆記的「主題」與「公開」（只動這兩個欄位，內文與其他欄位原樣保留）。
 * payload：ids（最多 BATCH_MAX 則）、topic（''＝未歸類；省略＝不改）、public（true／false／null＝依主題預設；省略＝不改）。
 * 保守規則：只要這個批次會讓任何一則筆記「實際變成公開」（含移到公開主題），沒附 confirmPublic: true 就整批拒絕、什麼都不改。
 * 逐則處理、逐則回報（updated／unchanged／failed），單則失敗不影響其他則。
 */
var BATCH_MAX = 30;
function updateNotes_(payload, store) {
  const ids = [],
    seen = {};
  (Array.isArray(payload.ids) ? payload.ids : []).forEach(function (x) {
    const id = String(x);
    if (!seen[id]) {
      seen[id] = true;
      ids.push(id);
    }
  });
  if (!ids.length) return { ok: false, error: '內容不符規則', reasons: ['沒有指定筆記'] };
  if (ids.length > BATCH_MAX)
    return { ok: false, error: '內容不符規則', reasons: ['一次最多 ' + BATCH_MAX + ' 則'] };
  if (
    !ids.every(function (id) {
      return ID_RE.test(id);
    })
  )
    return { ok: false, error: '內容不符規則', reasons: ['id 格式必須是「日期-短碼」'] };
  const hasTopic = Object.prototype.hasOwnProperty.call(payload, 'topic');
  const hasPub = Object.prototype.hasOwnProperty.call(payload, 'public');
  if (!hasTopic && !hasPub) return { ok: false, error: '內容不符規則', reasons: ['沒有要修改的欄位'] };
  let newTopic = '';
  if (hasTopic) {
    newTopic = payload.topic === null || payload.topic === undefined ? '' : String(payload.topic);
    if (newTopic && !TOPIC_RE.test(newTopic))
      return { ok: false, error: '內容不符規則', reasons: ['topic 不合法'] };
  }
  let newPub = null;
  if (hasPub) {
    if (payload.public === null) newPub = null;
    else {
      newPub = asBool_(payload.public);
      if (newPub === undefined)
        return { ok: false, error: '內容不符規則', reasons: ['public 必須是 true 或 false'] };
    }
  }

  return store.lock(function () {
    const tmap = topicMap_(store.getTopics());
    if (hasTopic && newTopic && !tmap[newTopic])
      return { ok: false, error: '內容不符規則', reasons: ['找不到主題：' + newTopic] };
    const byId = {};
    store.getIndexRows().forEach(function (r) {
      byId[r.id] = r;
    });
    const after = function (r) {
      return { topic: hasTopic ? newTopic : r.topic, public: hasPub ? newPub : r.public };
    };
    let becoming = 0;
    ids.forEach(function (id) {
      const r = byId[id];
      if (!r) return;
      if (!isNotePublic_(r, tmap) && isNotePublic_(after(r), tmap)) becoming++;
    });
    if (becoming > 0 && payload.confirmPublic !== true) {
      return {
        ok: false,
        error: '需要確認',
        affectedNotes: becoming,
        message: '此批次有 ' + becoming + ' 則筆記會變成公開。確認請附 confirmPublic: true。'
      };
    }
    const updated = [],
      unchanged = [],
      failed = [];
    ids.forEach(function (id) {
      const r = byId[id];
      if (!r) {
        failed.push({ id: id, reason: '找不到' });
        return;
      }
      const a = after(r);
      if ((r.topic || '') === (a.topic || '') && (r.public === undefined ? null : r.public) === a.public) {
        unchanged.push(id);
        return;
      }
      try {
        const fm = parseFrontMatter_(store.readText(r.driveFileId));
        if (!fm.ok) {
          failed.push({ id: id, reason: fm.reason });
          return;
        }
        const meta = fm.meta;
        if (hasTopic) {
          if (newTopic) meta.topic = newTopic;
          else delete meta.topic;
        }
        if (hasPub) {
          if (newPub === null) delete meta.public;
          else meta.public = newPub;
        }
        const updatedAt = store.updateText(r.driveFileId, serializeNote_(id, meta, fm.body));
        const row = Object.assign({}, r, {
          topic: a.topic || '',
          public: a.public === undefined ? null : a.public,
          updatedAt: updatedAt
        });
        store.upsertRow(row);
        updated.push(id);
      } catch (e) {
        failed.push({ id: id, reason: '讀不到檔案' });
      }
    });
    return { ok: true, updated: updated, unchanged: unchanged, failed: failed };
  });
}

/** 刪除主題：只有主題內沒有任何筆記時才允許（避免筆記變成孤兒）；檔案移到垃圾桶。 */
function deleteTopic_(payload, store) {
  const id = String(payload.id || '');
  if (!TOPIC_RE.test(id)) return NOT_FOUND;
  return store.lock(function () {
    if (!topicMap_(store.getTopics())[id]) return NOT_FOUND;
    const n = store.getIndexRows().filter(function (r) {
      return r.topic === id;
    }).length;
    if (n > 0) return { ok: false, error: '主題內還有 ' + n + ' 則筆記，請先移動或刪除', noteCount: n };
    store.removeTopic(id);
    return { ok: true, id: id };
  });
}

/** 刪除某主題的畫布檔（移到垃圾桶，不永久刪除）。主題與筆記不受影響；沒有畫布檔也算成功。 */
function deleteBoard_(payload, store) {
  const topic = String(payload.topic || '');
  if (!TOPIC_RE.test(topic)) return NOT_FOUND;
  return store.lock(function () {
    if (!topicMap_(store.getTopics())[topic]) return NOT_FOUND;
    const f = store.findFileByName('boards', topic + '.canvas.json');
    if (!f) return { ok: true, topic: topic, existed: false };
    store.trash(f.fileId);
    return { ok: true, topic: topic, existed: true };
  });
}

/* ───────── 連結預覽（P6）：擁有者加入連結卡片時由後端代抓一次，結果存進卡片的 x-preview ───────── */
/** 只接受公開網站的 https 網址：不含帳密、不指定連接埠、不是 IP 或內網名稱。 */
function previewUrlOk_(u) {
  u = String(u || '');
  if (u.length > 2000 || /[\s\u0000-\u001f]/.test(u)) return false;
  const m = /^https:\/\/([^\/?#]+)(?:[\/?#].*)?$/i.exec(u);
  if (!m) return false;
  const host = m[1].toLowerCase();
  if (host.indexOf('@') !== -1 || host.indexOf(':') !== -1) return false;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(host)) return false;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(host)) return false;
  return true;
}

function htmlDecode_(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, function (all, g) {
    const k = g.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    if (k === 'nbsp') return ' ';
    const c = k.charAt(1) === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return c > 31 && c < 1114112 && !(c >= 55296 && c <= 57343) ? String.fromCodePoint(c) : '';
  });
}

/** 從 HTML 取出標題、描述、封面圖、站名。純文字處理，不執行任何內容；輸出一律是純文字（前端用 textContent 顯示）。 */
function parsePreview_(html, pageUrl) {
  html = String(html || '').slice(0, 300000);
  const metas = {};
  const re = /<meta\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = {};
    const ar = /([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let a;
    while ((a = ar.exec(m[1])) !== null) attrs[a[1].toLowerCase()] = a[2] !== undefined ? a[2] : a[3];
    const key = String(attrs.property || attrs.name || '').toLowerCase();
    if (key && attrs.content !== undefined && metas[key] === undefined) metas[key] = attrs.content;
  }
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const clean = function (v, n) {
    return htmlDecode_(v)
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, n);
  };
  let image = String(metas['og:image'] || metas['og:image:url'] || metas['twitter:image'] || '').trim();
  image = htmlDecode_(image);
  if (image && !/^https:\/\//i.test(image)) {
    const o = /^(https:\/\/[^\/?#]+)(\/[^?#]*)?/i.exec(pageUrl);
    if (o && /^\/(?!\/)/.test(image)) image = o[1] + image;
    else if (o && /^\/\//.test(image)) image = 'https:' + image;
    else image = '';
  }
  if (!previewUrlOk_(image) || image.length > 500) image = '';
  const out = {
    title: clean(metas['og:title'] || metas['twitter:title'] || (t ? t[1] : ''), 120),
    description: clean(
      metas['og:description'] || metas['twitter:description'] || metas['description'] || '',
      240
    ),
    image: image,
    site: clean(metas['og:site_name'] || '', 60)
  };
  return out;
}

function fetchPreview_(payload, store) {
  const url = String(payload.url || '').trim();
  if (!previewUrlOk_(url)) return { ok: false, error: '只能擷取公開網站的 https 網址' };
  let res;
  try {
    res = store.fetchPage(url);
  } catch (e) {
    return { ok: false, error: '無法連線到這個網址' };
  }
  if (!res || res.code < 200 || res.code >= 300) return { ok: false, error: '網站沒有回應成功' };
  if (res.contentType && !/html|xml/i.test(res.contentType)) return { ok: false, error: '這個網址不是網頁' };
  const p = parsePreview_(res.text, url);
  if (!p.title && !p.description && !p.image) return { ok: false, error: '這個網頁沒有可用的預覽資訊' };
  p.fetchedAt = store.now();
  return { ok: true, preview: p };
}

function uploadSvg_(payload, store) {
  const text = payload.text;
  if (typeof text !== 'string') return { ok: false, error: '內容不符規則', reasons: ['text 必須是字串'] };
  const bytes = utf8Bytes_(text);
  if (bytes > LIMITS.HARD_BYTES)
    return { ok: false, error: '內容不符規則', reasons: ['SVG 超過 5 MB 的技術上限'] };
  const clean = sanitizeSvg_(text);
  if (!clean.ok) return { ok: false, error: '內容不符規則', reasons: [clean.reason] };

  const wanted = payload.id ? String(payload.id) : '';
  if (wanted && !ID_RE.test(wanted))
    return { ok: false, error: '內容不符規則', reasons: ['id 格式必須是「日期-短碼」'] };
  const warnings = [];
  const w = sizeWarning_('這個 SVG', bytes, LIMITS.WARN_SVG_BYTES);
  if (w) warnings.push(w);

  return store.lock(function () {
    const id = wanted || newId_(store.today(), store.getIndexRows(), store);
    const name = id + '.svg';
    const f = store.findFileByName('assets', name);
    if (f)
      store.updateText(f.fileId, clean.svg); // 覆寫同一個檔案
    else store.createText('assets', name, clean.svg);
    return { ok: true, id: id, removed: clean.removed, warnings: warnings, created: !f };
  });
}

function saveBoard_(payload, store) {
  const topic = String(payload.topic || '');
  if (!TOPIC_RE.test(topic)) return { ok: false, error: '內容不符規則', reasons: ['topic 不合法'] };
  let board = payload.board;
  if (typeof board === 'string') {
    try {
      board = JSON.parse(board);
    } catch (e) {
      return { ok: false, error: '內容不符規則', reasons: ['畫布不是有效的 JSON'] };
    }
  }
  const errs = validateBoard_(board);
  if (errs.length) return { ok: false, error: '內容不符規則', reasons: errs };
  if (!board.nodes) board.nodes = [];
  if (!board.edges) board.edges = [];
  const text = JSON.stringify(board);
  const bytes = utf8Bytes_(text);
  if (bytes > LIMITS.HARD_BYTES)
    return { ok: false, error: '內容不符規則', reasons: ['畫布超過 5 MB 的技術上限'] };

  return store.lock(function () {
    if (!topicMap_(store.getTopics())[topic])
      return { ok: false, error: '內容不符規則', reasons: ['找不到主題：' + topic] };
    const name = topic + '.canvas.json';
    const f = store.findFileByName('boards', name);
    if (f) {
      if (payload.baseUpdatedAt !== f.updatedAt) {
        return {
          ok: false,
          error: '衝突',
          code: 409,
          server: { updatedAt: f.updatedAt, board: JSON.parse(store.readText(f.fileId)) }
        };
      }
      return { ok: true, updatedAt: store.updateText(f.fileId, text) };
    }
    if (payload.baseUpdatedAt) return { ok: false, error: '衝突', code: 409, server: null };
    return { ok: true, updatedAt: store.createText('boards', name, text).updatedAt };
  });
}

/**
 * 由 Drive 掃描重建索引（規劃書 4.3）。分批、可續傳：回傳 done:false 與 cursor，
 * 呼叫端帶著 cursor 再呼叫，直到 done:true。不修改任何筆記檔。
 */
function rebuildIndex_(payload, store) {
  const cursor = payload.cursor || null;
  if (!cursor) {
    store.beginRebuild();
    store.rebuildTopics();
  }
  const page = store.listFilesPage('notes', cursor, LIMITS.REBUILD_PAGE);
  const rows = [],
    problems = [];
  page.files.forEach(function (f) {
    let fm;
    try {
      fm = parseFrontMatter_(store.readText(f.fileId));
    } catch (e) {
      problems.push({ file: f.name, problem: '讀不到檔案' });
      return;
    }
    if (!fm.ok) {
      problems.push({ file: f.name, problem: fm.reason });
      return;
    }
    const fid = f.name.replace(/\.md$/, '');
    const id = fm.meta.id !== undefined ? String(fm.meta.id) : '';
    if (!ID_RE.test(id)) {
      problems.push({ file: f.name, problem: 'front matter 缺少合法的 id，未收錄' });
      return;
    }
    if (fid !== id)
      problems.push({ file: f.name, problem: '檔名與 front matter 的 id 不一致，以 front matter 為準' });
    const pub = asBool_(fm.meta.public);
    rows.push({
      id: id,
      title: String(fm.meta.title || ''),
      topic: String(fm.meta.topic || ''),
      date: String(fm.meta.date || ''),
      tags: Array.isArray(fm.meta.tags) ? fm.meta.tags.map(String) : [],
      lang: String(fm.meta.lang || ''),
      public: pub === undefined ? null : pub,
      cover: String(fm.meta.cover || ''),
      driveFileId: f.fileId,
      updatedAt: f.updatedAt,
      links: extractLinks_(fm.body),
      svgs: extractSvgRefs_(fm.body),
      source: String(fm.meta.source || ''),
      translationOf: ID_RE.test(String(fm.meta.translation_of || '')) ? String(fm.meta.translation_of) : ''
    });
  });
  const dup = store.appendRebuildRows(rows);
  dup.forEach(function (id) {
    problems.push({ file: id, problem: 'id 重複，已略過後者' });
  });
  if (!page.cursor) {
    store.finishRebuild();
    return { ok: true, done: true, added: rows.length - dup.length, problems: problems };
  }
  return { ok: true, done: false, cursor: page.cursor, added: rows.length - dup.length, problems: problems };
}

/**
 * SVG 沒有自己的開關：被任何公開筆記（封面或內文引用）或公開主題的畫布引用，即視為公開（規劃書 4.5）。
 * 先用索引判斷（不讀檔）；找不到才去讀公開主題的畫布。
 */
function isSvgPublic_(id, rows, pub, store) {
  const viaNote = rows.some(function (r) {
    return pub[r.id] === true && (r.cover === id || (r.svgs || []).indexOf(id) !== -1);
  });
  if (viaNote) return true;
  const target = 'assets/' + id + '.svg';
  return store.getTopics().some(function (t) {
    if (!isTopicPublic_(t)) return false;
    const f = store.findFileByName('boards', t.id + '.canvas.json');
    if (!f) return false;
    try {
      return (JSON.parse(store.readText(f.fileId)).nodes || []).some(function (n) {
        if (!n) return false;
        if (n.type === 'file') return n.file === target;
        if (n.type === 'text' && typeof n.text === 'string')
          return extractSvgRefs_(n.text).indexOf(id) !== -1; // 便利貼內的 ![](assets/…svg)
        return false;
      });
    } catch (e) {
      return false;
    }
  });
}

/** 回傳 SVG 文字，前端用 Blob 或 data URL 放進 <img>，不內嵌進 DOM。私人與不存在無法區分。 */
function getSvg_(payload, owner, store) {
  const id = String(payload.id || '');
  if (!ID_RE.test(id)) return NOT_FOUND;
  const f = store.findFileByName('assets', id + '.svg');
  if (!f) return NOT_FOUND;
  if (!owner) {
    const rows = store.getIndexRows();
    const pub = publicIdSet_(rows, topicMap_(store.getTopics()));
    if (!isSvgPublic_(id, rows, pub, store)) return NOT_FOUND;
  }
  return { ok: true, id: id, svg: store.readText(f.fileId), updatedAt: f.updatedAt };
}

/**
 * 建立或更新主題。把主題由私人改為公開時，所有「未明確設定 public」的筆記會一併公開，
 * 為避免靜默擴大公開範圍，這種情況必須附 confirmPublic: true 才會執行。
 */
function saveTopic_(payload, store) {
  const reasons = [];
  const id = String(payload.id || '');
  if (!TOPIC_RE.test(id)) reasons.push('id 必須是小寫英數與連字號（最多 40 字）');
  const clean = function (v) {
    return v === undefined || v === null ? '' : String(v).trim();
  };
  const title = clean(payload.title),
    category = clean(payload.category),
    status = clean(payload.status);
  if (!title || title.length > 100) reasons.push('title 必須是 1 到 100 字');
  if (category.length > 50) reasons.push('category 最多 50 字');
  if (status.length > 30) reasons.push('status 最多 30 字');
  const dp = payload.defaultPublic === undefined ? false : asBool_(payload.defaultPublic);
  if (dp === undefined) reasons.push('defaultPublic 必須是 true 或 false');
  if (reasons.length) return { ok: false, error: '內容不符規則', reasons: reasons };

  return store.lock(function () {
    const existing = topicMap_(store.getTopics())[id];
    const wasPublic = !!existing && existing.defaultPublic === true;
    if (dp === true && !wasPublic) {
      const affected = store.getIndexRows().filter(function (r) {
        return r.topic === id && r.public === null;
      }).length;
      if (affected > 0 && payload.confirmPublic !== true) {
        return {
          ok: false,
          error: '需要確認',
          affectedNotes: affected,
          message:
            '此主題有 ' +
            affected +
            ' 則筆記沒有明確設定 public，改為公開後它們會一併公開。確認請附 confirmPublic: true。'
        };
      }
    }
    store.saveTopic({ id: id, title: title, category: category, status: status, defaultPublic: dp });
    return { ok: true, id: id, created: !existing };
  });
}

/**
 * 匯出（擁有者專用，分批可續傳）。一次回傳最多 100 則筆記全文，用「最後一個 id」當游標，
 * 匯出期間有新增或刪除也不會漏讀或重複。供 ZIP 備份與全文搜尋使用。
 */
function exportBatch_(payload, store) {
  const limit = Math.max(1, Math.min(100, parseInt(payload.limit, 10) || 50));
  const after = String(payload.cursor || '');
  const all = store.getIndexRows().sort(function (a, b) {
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const rest = all.filter(function (r) {
    return r.id > after;
  });
  const page = rest.slice(0, limit),
    notes = [],
    missing = [];
  page.forEach(function (r) {
    try {
      notes.push({ id: r.id, text: store.readText(r.driveFileId), updatedAt: r.updatedAt });
    } catch (e) {
      missing.push(r.id);
    } // 索引有、檔案讀不到：列出而不中斷
  });
  return {
    ok: true,
    notes: notes,
    missing: missing,
    total: all.length,
    cursor: rest.length > limit ? page[page.length - 1].id : null
  };
}

/** 匯出全部 SVG（含沒被任何筆記引用的孤兒檔）。檔案本來就是清除過的。 */
function exportAssets_(payload, store) {
  const page = store.listFilesPage('assets', payload.cursor || null, 50, '.svg');
  const assets = [];
  page.files.forEach(function (f) {
    const id = f.name.replace(/\.svg$/, '');
    if (ID_RE.test(id)) assets.push({ id: id, svg: store.readText(f.fileId), updatedAt: f.updatedAt });
  });
  return { ok: true, assets: assets, cursor: page.cursor };
}

/**
 * 圖片卡：圖片以 data URL 文字存成 assets/<id>.img（Drive 內為純文字檔，備份與 ZIP 不需特別處理二進位）。
 * 只收 PNG / JPEG / WebP（以檔頭魔術位元組驗證，不信任宣稱的 mime）。大小只提醒，5 MB 為技術上限。
 */
function b64Head_(b64, n) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const out = [];
  let acc = 0,
    bits = 0;
  for (let i = 0; i < b64.length && out.length < n; i++) {
    const v = A.indexOf(b64.charAt(i));
    if (v < 0) break;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
      acc &= (1 << bits) - 1;
    }
  }
  return out;
}
function imageKind_(b64) {
  const h = b64Head_(String(b64), 12);
  const is = function (off, str) {
    for (let i = 0; i < str.length; i++) if (h[off + i] !== str.charCodeAt(i)) return false;
    return true;
  };
  if (h.length >= 8 && h[0] === 0x89 && is(1, 'PNG')) return 'image/png';
  if (h.length >= 3 && h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return 'image/jpeg';
  if (h.length >= 12 && is(0, 'RIFF') && is(8, 'WEBP')) return 'image/webp';
  return null;
}

function uploadImage_(payload, store) {
  const d = payload.data;
  if (typeof d !== 'string') return { ok: false, error: '內容不符規則', reasons: ['data 必須是字串'] };
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+\/]+={0,2})$/.exec(d);
  if (!m) return { ok: false, error: '內容不符規則', reasons: ['只接受 PNG、JPEG、WebP 圖片'] };
  const kind = imageKind_(m[2]);
  if (!kind || kind !== m[1]) return { ok: false, error: '內容不符規則', reasons: ['圖片內容與格式不符'] };
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes > LIMITS.HARD_BYTES)
    return { ok: false, error: '內容不符規則', reasons: ['圖片超過 5 MB 的技術上限'] };
  const wanted = payload.id ? String(payload.id) : '';
  if (wanted && !ID_RE.test(wanted))
    return { ok: false, error: '內容不符規則', reasons: ['id 格式必須是「日期-短碼」'] };
  const warnings = [];
  const w = sizeWarning_('這張圖片', bytes, LIMITS.WARN_IMG_BYTES);
  if (w) warnings.push(w);
  return store.lock(function () {
    const id = wanted || newId_(store.today(), store.getIndexRows(), store);
    const name = id + '.img';
    const f = store.findFileByName('assets', name);
    if (f) store.updateText(f.fileId, d);
    else store.createText('assets', name, d);
    return { ok: true, id: id, bytes: bytes, warnings: warnings, created: !f };
  });
}

/** 被公開主題的畫布引用的圖片才算公開（圖片不會出現在筆記內文）。 */
function isImagePublic_(id, store) {
  return isAssetReferencedPublic_('assets/' + id + '.img', store);
}
function isAssetReferencedPublic_(target, store) {
  return store.getTopics().some(function (t) {
    if (!isTopicPublic_(t)) return false;
    const f = store.findFileByName('boards', t.id + '.canvas.json');
    if (!f) return false;
    try {
      return (JSON.parse(store.readText(f.fileId)).nodes || []).some(function (n) {
        return n && n.type === 'file' && n.file === target;
      });
    } catch (e) {
      return false;
    }
  });
}

function getImage_(payload, owner, store) {
  const id = String(payload.id || '');
  if (!ID_RE.test(id)) return NOT_FOUND;
  const f = store.findFileByName('assets', id + '.img');
  if (!f) return NOT_FOUND;
  if (!owner && !isImagePublic_(id, store)) return NOT_FOUND;
  return { ok: true, id: id, data: store.readText(f.fileId), updatedAt: f.updatedAt };
}

/* ───── HTML 卡片（P15）─────
 * HTML 檔以純文字存成 assets/<id>.html。後端不解析、不改寫內容：安全由前端的沙箱 iframe 負責
 * （預設不執行腳本、不給 allow-same-origin）。只有擁有者能上傳；訪客只拿得到公開畫布引用的檔案。 */
function utf8Len_(s) {
  return unescape(encodeURIComponent(s)).length;
}
function uploadHtml_(payload, store) {
  const text = payload.text;
  if (typeof text !== 'string' || !text.trim())
    return { ok: false, error: '內容不符規則', reasons: ['HTML 內容不可為空'] };
  if (text.indexOf('\u0000') >= 0)
    return { ok: false, error: '內容不符規則', reasons: ['HTML 含有不合法字元'] };
  const bytes = utf8Len_(text);
  if (bytes > LIMITS.HTML_BYTES)
    return { ok: false, error: '內容不符規則', reasons: ['HTML 檔超過 500 KB 上限'] };
  const wanted = payload.id ? String(payload.id) : '';
  if (wanted && !ID_RE.test(wanted))
    return { ok: false, error: '內容不符規則', reasons: ['id 格式必須是「日期-短碼」'] };
  return store.lock(function () {
    const id = wanted || newId_(store.today(), store.getIndexRows(), store);
    const name = id + '.html';
    const f = store.findFileByName('assets', name);
    if (f) store.updateText(f.fileId, text);
    else store.createText('assets', name, text);
    return { ok: true, id: id, bytes: bytes, created: !f };
  });
}
function getHtml_(payload, owner, store) {
  const id = String(payload.id || '');
  if (!ID_RE.test(id)) return NOT_FOUND;
  const f = store.findFileByName('assets', id + '.html');
  if (!f) return NOT_FOUND;
  if (!owner && !isAssetReferencedPublic_('assets/' + id + '.html', store)) return NOT_FOUND;
  return { ok: true, id: id, text: store.readText(f.fileId), updatedAt: f.updatedAt };
}
function exportHtml_(payload, store) {
  const page = store.listFilesPage('assets', payload.cursor || null, 8, '.html');
  const htmls = [];
  page.files.forEach(function (f) {
    const id = f.name.replace(/\.html$/, '');
    if (ID_RE.test(id)) htmls.push({ id: id, text: store.readText(f.fileId), updatedAt: f.updatedAt });
  });
  return { ok: true, htmls: htmls, cursor: page.cursor };
}

function exportImages_(payload, store) {
  const page = store.listFilesPage('assets', payload.cursor || null, 8, '.img');
  const images = [];
  page.files.forEach(function (f) {
    const id = f.name.replace(/\.img$/, '');
    if (ID_RE.test(id)) images.push({ id: id, data: store.readText(f.fileId), updatedAt: f.updatedAt });
  });
  return { ok: true, images: images, cursor: page.cursor };
}

/* ───── 清理未使用的圖片／HTML 檔（P16）─────
 * 「未使用」＝沒有任何一張畫布（公開、私人都算）的卡片引用它，且建立超過 ASSET_GRACE_DAYS 天。
 * 掃描只讀；移除只是移到 Drive 垃圾桶（30 天內可救回）。移除時伺服器會重算一次，
 * 所以過期的清單不可能讓「現在還被引用」的檔案被移走。任何一張畫布讀不了就整個中止（寧可不清）。 */
const ASSET_GRACE_DAYS = 7;
const ASSET_NAME_RE = /^(\d{8}-[a-z0-9]{2,8})\.(img|html)$/;

function unusedAssets_(store) {
  const used = {};
  store.listFolder('boards').forEach(function (f) {
    let b;
    try {
      b = JSON.parse(store.readText(f.fileId));
    } catch (e) {
      throw new Error('BOARD_UNREADABLE');
    }
    (Array.isArray(b.nodes) ? b.nodes : []).forEach(function (n) {
      if (n && n.type === 'file' && typeof n.file === 'string') used[n.file] = true;
    });
  });
  const limit = Date.parse(store.now()) - ASSET_GRACE_DAYS * 86400000;
  const out = { items: [], recent: 0 };
  store.listFolder('assets').forEach(function (f) {
    if (!ASSET_NAME_RE.test(f.name) || used['assets/' + f.name]) return;
    if (Date.parse(f.updatedAt) > limit) {
      out.recent++;
      return;
    }
    out.items.push({ fileId: f.fileId, name: f.name, size: f.size || 0, updatedAt: f.updatedAt });
  });
  return out;
}

function scanAssets_(store) {
  let r;
  try {
    r = unusedAssets_(store);
  } catch (e) {
    return { ok: false, error: '有畫布讀取失敗，已停止掃描' };
  }
  r.items.sort(function (a, b) {
    return a.updatedAt < b.updatedAt ? -1 : 1;
  });
  return {
    ok: true,
    items: r.items.map(function (x) {
      return { name: x.name, size: x.size, updatedAt: x.updatedAt };
    }),
    recent: r.recent,
    graceDays: ASSET_GRACE_DAYS
  };
}

function trashAssets_(payload, store) {
  const names = Array.isArray(payload.names) ? payload.names : null;
  if (!names || !names.length || names.length > 200) return { ok: false, error: '清單格式不符' };
  let r;
  try {
    r = unusedAssets_(store);
  } catch (e) {
    return { ok: false, error: '有畫布讀取失敗，已停止掃描' };
  }
  const ok = {};
  r.items.forEach(function (x) {
    ok[x.name] = x.fileId;
  });
  let trashed = 0;
  names.forEach(function (nm) {
    if (typeof nm === 'string' && ok[nm]) {
      store.trash(ok[nm]);
      delete ok[nm];
      trashed++;
    }
  });
  return { ok: true, trashed: trashed, skipped: names.length - trashed };
}
