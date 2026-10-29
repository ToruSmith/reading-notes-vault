// 記憶體版儲存層，介面與 Store.gs 的 makeStore_ 相同，僅供離線測試
module.exports = function makeFakeStore() {
  let clock = 0,
    codeN = 0,
    fileN = 0;
  const files = {}; // fileId -> {folder,name,text,updatedAt,trashed}
  let rows = [],
    topics = [],
    tmp = null;
  const stamp = () => new Date(Date.UTC(2026, 9, 22, 0, 0, ++clock)).toISOString();
  const s = {
    files,
    calls: { createText: 0, updateText: 0 },
    nowIso: '2026-10-22T12:00:00.000Z',
    now: () => s.nowIso,
    today: () => '2026-10-22',
    newCode: () => 'c' + (++codeN).toString(36).padStart(2, '0'),
    lock: fn => fn(),
    getIndexRows: () => JSON.parse(JSON.stringify(rows)),
    upsertRow(r) {
      const i = rows.findIndex(x => x.id === r.id);
      const c = JSON.parse(JSON.stringify(r));
      if (i === -1) rows.push(c);
      else rows[i] = c;
    },
    removeRow(id) {
      rows = rows.filter(r => r.id !== id);
    },
    getTopics: () => JSON.parse(JSON.stringify(topics)),
    saveTopic(t) {
      topics = topics.filter(x => x.id !== t.id);
      topics.push({
        id: t.id,
        title: t.title,
        category: t.category || '',
        status: t.status || '',
        defaultPublic: t.defaultPublic === true
      });
      const name = t.id + '.json';
      const f = s.findFileByName('topics', name);
      const text = JSON.stringify(t);
      if (f) s.updateText(f.fileId, text);
      else s.createText('topics', name, text);
    },
    removeTopic(id) {
      topics = topics.filter(x => x.id !== id);
      [
        ['topics', id + '.json'],
        ['boards', id + '.canvas.json']
      ].forEach(([fo, nm]) => {
        const f = s.findFileByName(fo, nm);
        if (f) s.trash(f.fileId);
      });
    },
    readText(id) {
      if (!files[id] || s.failRead[id]) throw new Error('no file');
      s.clockMs += s.readCost;
      return files[id].text;
    },
    createText(folder, name, text) {
      s.calls.createText++;
      const fileId = 'F' + ++fileN;
      files[fileId] = { folder, name, text, updatedAt: stamp(), trashed: false };
      return { fileId, updatedAt: files[fileId].updatedAt };
    },
    updateText(id, text) {
      s.calls.updateText++;
      files[id].text = text;
      files[id].updatedAt = stamp();
      return files[id].updatedAt;
    },
    findFileByName(folder, name) {
      const id = Object.keys(files).find(
        k => files[k].folder === folder && files[k].name === name && !files[k].trashed
      );
      return id ? { fileId: id, updatedAt: files[id].updatedAt } : null;
    },
    trash(id) {
      files[id].trashed = true;
    },
    untrash(folder, name) {
      const id = Object.keys(files).find(
        k => files[k].folder === folder && files[k].name === name && files[k].trashed
      );
      if (id) files[id].trashed = false;
      return !!id;
    },
    beginRebuild() {
      tmp = [];
    },
    listFilesPage(folder, cursor, limit, ext) {
      ext = ext || '.md';
      const all = Object.keys(files).filter(
        k => files[k].folder === folder && !files[k].trashed && files[k].name.endsWith(ext)
      );
      const start = cursor ? parseInt(cursor, 10) : 0;
      const slice = all.slice(start, start + limit);
      return {
        files: slice.map(k => ({ fileId: k, name: files[k].name, updatedAt: files[k].updatedAt })),
        cursor: start + limit < all.length ? String(start + limit) : null
      };
    },
    appendRebuildRows(rs) {
      const dup = [];
      rs.forEach(r => {
        if (tmp.some(x => x.id === r.id)) dup.push(r.id);
        else tmp.push(JSON.parse(JSON.stringify(r)));
      });
      return dup;
    },
    finishRebuild() {
      rows = tmp;
      tmp = null;
    },
    rebuildTopics() {
      /* 假儲存層的主題不從檔案重建 */
    },
    appendRows(rs) {
      rs.forEach(r => rows.push(JSON.parse(JSON.stringify(r))));
    },
    removeRowsByPrefix(p) {
      const n = rows.length;
      rows = rows.filter(r => r.id.indexOf(p) !== 0);
      return n - rows.length;
    },
    _clearIndex() {
      rows = [];
    },
    clearIndex() {
      rows = [];
    },
    mimeOf: () => 'text/markdown',
    /* ───── P5 ───── */
    clockMs: 1760000000000,
    readCost: 0,
    props: {},
    cfg: {},
    triggers: [],
    once: [],
    httpImpl: null,
    failRead: {},
    nowMs() {
      return s.clockMs;
    },
    config() {
      return JSON.parse(JSON.stringify(s.cfg));
    },
    getProp(k) {
      return Object.prototype.hasOwnProperty.call(s.props, k) ? s.props[k] : null;
    },
    setProp(k, v) {
      s.props[k] = String(v);
    },
    hash(text) {
      return require('crypto').createHash('md5').update(text, 'utf8').digest('hex');
    },
    http(req) {
      if (!s.httpImpl) throw new Error('no http');
      if (String(req.url).indexOf('https://api.github.com/') !== 0)
        throw new Error('只允許連線到 api.github.com');
      return s.httpImpl(req);
    },
    fetchPage(url) {
      s.fetched = (s.fetched || []).concat(url);
      if (!s.pages || !s.pages[url]) throw new Error('連不到');
      return s.pages[url];
    },
    listFolder(folder) {
      return Object.keys(files)
        .filter(k => files[k].folder === folder && !files[k].trashed)
        .map(k => ({
          fileId: k,
          name: files[k].name,
          updatedAt: files[k].updatedAt,
          size: (files[k].text || '').length
        }));
    },
    createZip(folder, name, list) {
      const fileId = 'Z' + ++fileN;
      files[fileId] = {
        folder,
        name,
        text: JSON.stringify(list),
        zip: true,
        updatedAt: stamp(),
        trashed: false
      };
      return { fileId, size: files[fileId].text.length };
    },
    verifyZip(id, paths) {
      const list = JSON.parse(files[id].text);
      const have = new Set(list.map(x => x.path));
      return { ok: list.length === paths.length && paths.every(p => have.has(p)), count: list.length };
    },
    triggerList() {
      return s.triggers.map(t => t.handler);
    },
    triggerEnsure(handler, spec) {
      if (!s.triggers.some(t => t.handler === handler)) s.triggers.push({ handler, spec });
    },
    triggerRemove(handler) {
      s.triggers = s.triggers.filter(t => t.handler !== handler);
    },
    scheduleOnce(handler, ms) {
      s.triggerRemove(handler);
      s.triggers.push({ handler, spec: { type: 'once', ms } });
    },
    countFiles: folder =>
      Object.keys(files).filter(k => files[k].folder === folder && !files[k].trashed).length
  };
  return s;
};
