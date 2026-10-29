// 介面冒煙測試：用極簡假 DOM 執行 ui.js，檢查流程不出錯、畫面文字正確。不能取代真實瀏覽器的目視確認。
const vm = require('vm'),
  fs = require('fs'),
  path = require('path'),
  assert = require('assert');
const root = path.join(__dirname, '..');
class N {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this._text = '';
    this._html = '';
    this.className = '';
    this.value = '';
    this.open = true;
    this.parent = null;
  }
  appendChild(c) {
    c.parent = this;
    this.children.push(c);
    return c;
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }
  getAttribute(k) {
    return k in this.attrs ? this.attrs[k] : null;
  }
  addEventListener(t, f) {
    (this.listeners[t] = this.listeners[t] || []).push(f);
  }
  set textContent(v) {
    this.children = [];
    this._text = String(v);
  }
  get textContent() {
    return this._text + this.children.map(c => c.textContent).join('');
  }
  set innerHTML(v) {
    this.children = [];
    this._text = '';
    this._html = String(v);
  }
  get innerHTML() {
    return this._html;
  }
  querySelectorAll(sel) {
    // 只支援 img[data-svg]：從 innerHTML 擷取
    const out = [];
    if (sel !== 'img[data-svg]') return out;
    const walk = n => {
      (n._html.match(/<img[^>]*data-svg="[^"]+"[^>]*>/g) || []).forEach(s => {
        const i = new N('img');
        i.setAttribute('data-svg', /data-svg="([^"]+)"/.exec(s)[1]);
        out.push(i);
      });
      n.children.forEach(walk);
    };
    walk(this);
    return out;
  }
  closest() {
    return null;
  }
  focus() {}
  click() {
    (this.listeners.click || []).forEach(f => f({ preventDefault() {}, target: this }));
  }
}
const find = (n, pred, acc = []) => {
  if (pred(n)) acc.push(n);
  n.children.forEach(c => find(c, pred, acc));
  return acc;
};
const text = n => n.textContent;
const byText = (n, tag, s) => find(n, x => x.tag === tag && x.textContent.includes(s));
const flush = () => new Promise(r => setTimeout(r, 5));

async function boot(handlers) {
  const els = {};
  ['q', 'who', 'shelf', 'shelfBody', 'main', 'tools'].forEach(
    id => (els[id] = new N(id === 'q' ? 'input' : 'div'))
  );
  const calls = [];
  const blobs = [];
  const run = {
    withSuccessHandler(ok) {
      this.ok = ok;
      return this;
    },
    withFailureHandler(ng) {
      this.ng = ng;
      return this;
    },
    api(action, payload) {
      calls.push(action);
      const ok = this.ok,
        ng = this.ng;
      setTimeout(() => {
        try {
          const h = handlers[action];
          if (!h) return ng({ message: '未知動作' });
          const r = h(payload);
          r instanceof Error ? ng(r) : ok(r);
        } catch (e) {
          ng(e);
        }
      }, 0);
    }
  };
  const win = {
    google: { script: { run: Object.assign(Object.create(run)) } },
    matchMedia: () => ({ matches: false }),
    scrollTo() {},
    markdownit: require('../vendor/markdown-it.min.js'),
    jsyaml: require('../vendor/js-yaml.min.js'),
    JSZip: require('../vendor/jszip.min.js')
  };
  win.addEventListener = win.addEventListener || function () {};
  const ctx = vm.createContext({
    localStorage: { getItem: k => (k === 'vault-editmode' ? '1' : null), setItem() {} },
    location: { hash: '' },
    history: { pushState() {}, replaceState() {} },
    window: win,
    document: {
      addEventListener() {},
      body: {
        classList: {
          toggle() {},
          remove() {},
          add() {},
          contains() {
            return false;
          }
        }
      },
      getElementById: id => els[id] || find(els.main, x => x.attrs.id === id)[0] || null,
      createElement: t => new N(t),
      createTextNode: s => {
        const x = new N('#text');
        x._text = s;
        return x;
      }
    },
    setTimeout,
    clearTimeout,
    Promise,
    console,
    encodeURIComponent,
    Blob,
    URL: {
      createObjectURL: b => {
        blobs.push(b);
        return 'blob:test';
      }
    }
  });
  win.VAULT_I18N = {
    'zh-Hant': JSON.parse(fs.readFileSync(path.join(root, 'i18n/zh-Hant.json'), 'utf8')),
    en: JSON.parse(fs.readFileSync(path.join(root, 'i18n/en.json'), 'utf8'))
  };
  vm.runInContext(fs.readFileSync(path.join(root, 'i18n.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'logic.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'ui.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'edit.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'upload.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'search.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'zip.js'), 'utf8'), ctx);
  await flush();
  await flush();
  return { els, calls, blobs };
}

const topics = [
  { id: 'db', title: '資料庫設計', category: '資料庫', status: 'reading' },
  { id: 'journal', title: '日記', category: '', status: '' }
];
const items = [
  {
    id: '20261001-a1',
    title: '正規化與反正規化',
    topic: 'db',
    date: '2026-10-01',
    tags: ['mysql'],
    links: [],
    public: true
  },
  {
    id: '20261010-c3',
    title: '今天的心情',
    topic: 'journal',
    date: '2026-10-10',
    tags: ['日記'],
    links: ['20261001-a1'],
    public: null
  }
];
const good = who => ({
  whoami: () => ({ ok: true, isOwner: who }),
  listIndex: () => ({ ok: true, items, topics }),
  getNote: p =>
    p.id === '20261001-a1'
      ? {
          ok: true,
          meta: { title: '正規化與反正規化', date: '2026-10-01', topic: 'db', tags: ['mysql'] },
          body: '# 內文\n見 [[20261010-c3]]\n\n![ER](assets/20261022-v001.svg)\n'
        }
      : { ok: false, error: '找不到' },
  getSvg: () => ({ ok: true, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' })
});

let n = 0;
const t = async (name, fn) => {
  await fn();
  n++;
  console.log('通過  ' + name);
};
(async () => {
  await t('啟動：顯示身分、書櫃與全部筆記', async () => {
    const { els } = await boot(good(false));
    assert.strictEqual(text(els.who), '訪客・唯讀');
    assert.ok(
      text(els.shelfBody).includes('資料庫設計') &&
        text(els.shelfBody).includes('狀態') &&
        text(els.shelfBody).includes('reading')
    );
    assert.ok(
      text(els.main).includes('全部筆記') &&
        text(els.main).includes('2 則') &&
        text(els.main).includes('今天的心情')
    );
  });
  await t('擁有者看到身分標記與公開／私人標示', async () => {
    const { els } = await boot(good(true));
    assert.strictEqual(text(els.who), '擁有者');
    assert.ok(text(els.main).includes('私人') && text(els.main).includes('公開'));
  });
  await t('點書櫃主題：只列出該主題的筆記', async () => {
    const { els } = await boot(good(false));
    byText(els.shelfBody, 'button', '日記')[0].click();
    assert.ok(
      text(els.main).includes('今天的心情') &&
        !text(els.main).includes('正規化與反正規化') &&
        text(els.main).includes('1 則')
    );
  });
  await t('搜尋：輸入中文詞後依標題過濾；清空後還原', async () => {
    const { els } = await boot(good(false));
    els.q.value = '正規化';
    els.q.listeners.input[0]();
    await new Promise(r => setTimeout(r, 200));
    assert.ok(
      text(els.main).includes('搜尋「正規化」') &&
        text(els.main).includes('1 則') &&
        !text(els.main).includes('今天的心情')
    );
    els.q.listeners.keydown[0]({ key: 'Escape' });
    assert.ok(text(els.main).includes('全部筆記') && text(els.main).includes('2 則'));
  });
  await t('開啟筆記：顯示內文、轉成內部連結、載入 SVG、顯示被引用清單', async () => {
    const { els, calls } = await boot(good(false));
    find(els.main, x => x.tag === 'a' && x.textContent.includes('正規化與反正規化'))[0].click();
    await flush();
    await flush();
    const m = text(els.main);
    assert.ok(
      calls.includes('getNote') &&
        m.includes('資料庫設計') &&
        m.includes('#mysql') &&
        m.includes('被這些筆記引用') &&
        m.includes('今天的心情')
    );
    const body = find(els.main, x => x.className === 'md')[0];
    assert.ok(body.innerHTML.includes('data-note="20261010-c3"') && body.innerHTML.includes('今天的心情'));
    assert.ok(calls.includes('getSvg'));
  });
  await t('開啟不存在的筆記：顯示找不到，並可回到列表', async () => {
    const h = good(false);
    h.getNote = () => ({ ok: false, error: '找不到' });
    const { els } = await boot(h);
    find(els.main, x => x.tag === 'a')[0].click();
    await flush();
    await flush();
    assert.ok(text(els.main).includes('找不到這則筆記'));
    byText(els.main, 'button', '回到列表')[0].click();
    assert.ok(text(els.main).includes('全部筆記'));
  });
  await t('連線失敗：顯示錯誤與重試，重試後可恢復', async () => {
    let fail = true;
    const h = good(false);
    h.listIndex = () => (fail ? new Error('逾時') : { ok: true, items, topics });
    const { els } = await boot(h);
    assert.ok(text(els.main).includes('讀取失敗：逾時') && text(els.who) === '無法連線');
    fail = false;
    byText(els.main, 'button', '重試')[0].click();
    await flush();
    await flush();
    assert.ok(text(els.main).includes('全部筆記'));
  });
  await t('列表很長時分頁，按「顯示更多」再加載', async () => {
    const h = good(false);
    const many = Array.from({ length: 230 }, (_, i) => ({
      id: '2026' + String(1000 + i) + '-a' + i,
      title: '筆記' + i,
      topic: '',
      date: '2026-10-01',
      tags: [],
      links: [],
      public: true
    }));
    h.listIndex = () => ({ ok: true, items: many, topics: [] });
    const { els } = await boot(h);
    assert.strictEqual(find(els.main, x => x.tag === 'li').length, 100);
    byText(els.main, 'button', '顯示更多')[0].click();
    assert.strictEqual(find(els.main, x => x.tag === 'li').length, 200);
  });

  /* ───── 編輯、草稿、衝突、上傳 ───── */
  const byId = (root, id) => find(root, x => x.attrs.id === id)[0];
  const type = (node, v) => {
    node.value = v;
    (node.listeners.input || []).forEach(f => f());
  };
  const click = node => node.click();
  const NOTE_TEXT =
    '---\nid: 20261001-a1\ntitle: 正規化與反正規化\ntopic: db\ndate: 2026-10-01\ntags:\n  - mysql\nx-mood: 開心\n---\n舊內容';
  const owner = () => {
    const h = good(true);
    h.getNote = p =>
      p.id === '20261001-a1'
        ? { ok: true, meta: { title: '正規化與反正規化' }, body: '舊內容', text: NOTE_TEXT, updatedAt: 'V1' }
        : { ok: true, meta: { title: 'x', tags: [] }, body: '', text: '', updatedAt: 'V9' };
    return h;
  };

  await t('訪客沒有新增、上傳、編輯按鈕；擁有者有', async () => {
    const v = await boot(good(false));
    assert.ok(
      byText(v.els.tools, 'button', '新增').length === 0 &&
        byText(v.els.tools, 'button', '備份').length === 0 &&
        byText(v.els.tools, 'button', '發布檢查').length === 0
    );
    find(v.els.main, x => x.tag === 'a')[0].click();
    await flush();
    await flush();
    assert.ok(byText(v.els.main, 'button', '編輯').length === 0);
    const o = await boot(owner());
    assert.ok(text(o.els.tools).includes('新增') && text(o.els.tools).includes('上傳'));
  });
  await t('新增筆記：填標題後儲存，送出含新 id 的完整 front matter，成功後回到該筆記', async () => {
    const saved = [];
    const h = owner();
    h.saveNote = p => {
      saved.push(p);
      return { ok: true, id: p.id, updatedAt: 'V1', warnings: [] };
    };
    const { els } = await boot(h);
    click(byText(els.tools, 'button', '新增')[0]);
    await flush();
    await flush();
    assert.ok(text(els.main).includes('新增筆記'));
    type(byId(els.main, 'f-title'), '新標題');
    type(byId(els.main, 'f-tags'), 'a, b、c');
    type(byId(els.main, 'f-body'), '# 內文\n文字');
    click(byId(els.main, 'f-save'));
    for (let i = 0; i < 8; i++) await flush();
    assert.strictEqual(saved.length, 1);
    assert.ok(
      /^---\nid: \d{8}-[a-z0-9]{4}\ntitle: 新標題\n/.test(saved[0].text) &&
        saved[0].text.includes('- c') &&
        saved[0].text.endsWith('# 內文\n文字')
    );
    assert.strictEqual(saved[0].baseUpdatedAt, undefined);
    assert.ok(text(els.main).includes('已儲存'));
  });
  await t('沒有標題不送出，並提示', async () => {
    let called = 0;
    const h = owner();
    h.saveNote = () => {
      called++;
      return { ok: true };
    };
    const { els } = await boot(h);
    click(byText(els.tools, 'button', '新增')[0]);
    await flush();
    await flush();
    click(byId(els.main, 'f-save'));
    assert.strictEqual(called, 0);
    assert.ok(text(els.main).includes('請輸入標題'));
  });
  await t('編輯既有筆記：自訂欄位原樣保留，附 baseUpdatedAt', async () => {
    const saved = [];
    const h = owner();
    h.saveNote = p => {
      saved.push(p);
      return { ok: true, id: p.id, updatedAt: 'V2' };
    };
    const { els } = await boot(h);
    find(els.main, x => x.tag === 'a' && x.textContent.includes('正規化'))[0].click();
    await flush();
    await flush();
    click(byText(els.main, 'button', '編輯')[0]);
    await flush();
    await flush();
    assert.strictEqual(byId(els.main, 'f-title').value, '正規化與反正規化');
    type(byId(els.main, 'f-body'), '新內容');
    click(byId(els.main, 'f-save'));
    await flush();
    await flush();
    assert.ok(
      saved[0].text.includes('x-mood: 開心') &&
        saved[0].text.includes('id: 20261001-a1') &&
        saved[0].baseUpdatedAt === 'V1' &&
        saved[0].text.endsWith('新內容')
    );
  });
  await t('草稿：離開後再開啟會還原', async () => {
    const { els } = await boot(owner());
    find(els.main, x => x.tag === 'a' && x.textContent.includes('正規化'))[0].click();
    await flush();
    await flush();
    click(byText(els.main, 'button', '編輯')[0]);
    await flush();
    await flush();
    type(byId(els.main, 'f-title'), '草稿標題');
    await new Promise(r => setTimeout(r, 650));
    click(byText(els.main, 'button', '離開')[0]);
    await flush();
    await flush();
    find(els.main, x => x.tag === 'a' && x.textContent.includes('正規化'))[0] || null;
    click(byText(els.main, 'button', '編輯')[0]);
    await flush();
    await flush();
    assert.ok(
      text(els.main).includes('已還原上次未送出的草稿') && byId(els.main, 'f-title').value === '草稿標題'
    );
  });
  await t('衝突：顯示伺服器版本；覆蓋時改用伺服器的版本號重送', async () => {
    const saved = [];
    const h = owner();
    h.saveNote = p => {
      saved.push(p);
      return saved.length === 1
        ? {
            ok: false,
            error: '衝突',
            code: 409,
            server: { updatedAt: 'V7', text: '---\ntitle: 伺服器版\n---\nS' }
          }
        : { ok: true, id: p.id, updatedAt: 'V8' };
    };
    const { els } = await boot(h);
    find(els.main, x => x.tag === 'a' && x.textContent.includes('正規化'))[0].click();
    await flush();
    await flush();
    click(byText(els.main, 'button', '編輯')[0]);
    await flush();
    await flush();
    click(byId(els.main, 'f-save'));
    await flush();
    await flush();
    assert.ok(text(els.main).includes('已被更新') && text(els.main).includes('覆蓋伺服器版本'));
    click(byText(els.main, 'button', '覆蓋伺服器版本')[0]);
    await flush();
    await flush();
    assert.strictEqual(saved.length, 2);
    assert.strictEqual(saved[1].baseUpdatedAt, 'V7');
    assert.strictEqual(saved[1].id, '20261001-a1');
  });
  await t('衝突：另存為新筆記用新 id 且不帶版本號；改用伺服器版本會載入其內容', async () => {
    const saved = [];
    const h = owner();
    h.saveNote = p => {
      saved.push(p);
      return saved.length === 1
        ? {
            ok: false,
            error: '衝突',
            code: 409,
            server: { updatedAt: 'V7', text: '---\ntitle: 伺服器版\n---\nS' }
          }
        : { ok: true, id: p.id, updatedAt: 'N1' };
    };
    let b = await boot(h);
    find(b.els.main, x => x.tag === 'a' && x.textContent.includes('正規化'))[0].click();
    await flush();
    await flush();
    click(byText(b.els.main, 'button', '編輯')[0]);
    await flush();
    await flush();
    click(byId(b.els.main, 'f-save'));
    await flush();
    await flush();
    click(byText(b.els.main, 'button', '另存為新筆記')[0]);
    await flush();
    await flush();
    assert.ok(
      saved[1].id !== '20261001-a1' &&
        saved[1].baseUpdatedAt === undefined &&
        /^---\nid: \d{8}-/.test(saved[1].text)
    );
    b = await boot(h);
    saved.length = 0;
    find(b.els.main, x => x.tag === 'a' && x.textContent.includes('正規化'))[0].click();
    await flush();
    await flush();
    click(byText(b.els.main, 'button', '編輯')[0]);
    await flush();
    await flush();
    click(byId(b.els.main, 'f-save'));
    await flush();
    await flush();
    click(byText(b.els.main, 'button', '改用伺服器版本')[0]);
    assert.strictEqual(byId(b.els.main, 'f-title').value, '伺服器版');
  });
  await t('網路中斷：草稿保留並提示；再按儲存用同一個 id 重送', async () => {
    const saved = [];
    let down = true;
    const h = owner();
    h.saveNote = p => {
      saved.push(p);
      return down ? new Error('逾時') : { ok: true, id: p.id, updatedAt: 'V1', deduped: true };
    };
    const { els } = await boot(h);
    click(byText(els.tools, 'button', '新增')[0]);
    await flush();
    await flush();
    type(byId(els.main, 'f-title'), '行動網路');
    click(byId(els.main, 'f-save'));
    for (let i = 0; i < 6; i++) await flush();
    assert.ok(text(byId(els.main, 'st')).includes('草稿已保留'));
    down = false;
    click(byId(els.main, 'f-save'));
    await flush();
    await flush();
    await flush();
    await flush();
    assert.strictEqual(saved.length, 2);
    assert.strictEqual(saved[0].id, saved[1].id);
    assert.ok(text(els.main).includes('先前已儲存成功'));
  });
  await t('在編輯器上傳 SVG：成功後可插入到內文', async () => {
    const up = [];
    const h = owner();
    h.uploadSvg = p => {
      up.push(p);
      return { ok: true, id: p.id, removed: ['<script>'] };
    };
    const { els } = await boot(h);
    click(byText(els.tools, 'button', '新增')[0]);
    await flush();
    await flush();
    const pick = byId(els.main, 'f-svg');
    pick.files = [{ name: 'a.svg', text: () => Promise.resolve('<svg/>') }];
    pick.listeners.change[0]();
    await flush();
    await flush();
    await flush();
    assert.ok(up.length === 1 && text(els.main).includes('已清除 1 項'));
    click(byText(els.main, 'button', '插入到內文')[0]);
    assert.ok(byId(els.main, 'f-body').value.includes('![說明](assets/' + up[0].id + '.svg)'));
  });

  const pickFiles = async (els, files) => {
    const pick = byId(els.main, 'u-files');
    pick.files = files.map(([name, body]) => ({ name, text: () => Promise.resolve(body) }));
    pick.listeners.change[0]();
    for (let i = 0; i < 8; i++) await flush();
  };
  await t('多檔上傳：補欄位、清除 public、[[標題]] 轉 id、SVG 另行上傳、不支援的檔案列為失敗', async () => {
    const saves = [],
      svgs = [];
    const h = owner();
    h.saveNote = p => {
      saves.push(p);
      return { ok: true, id: p.id, updatedAt: 'U' };
    };
    h.uploadSvg = p => {
      svgs.push(p);
      return { ok: true, id: p.id, removed: [] };
    };
    const { els } = await boot(h);
    click(byText(els.tools, 'button', '上傳')[0]);
    await flush();
    await flush();
    await pickFiles(els, [
      ['a.md', '# 甲\n見 [[乙]] 與 [[不存在]]'],
      ['b.md', '---\ntitle: 乙\npublic: true\n---\nB'],
      ['c.svg', '<svg/>'],
      ['d.txt', 'x'],
      ['e.md', '---\na: [\n---\n']
    ]);
    assert.strictEqual(saves.length, 2);
    assert.strictEqual(svgs.length, 1);
    const a = saves.find(x => x.text.includes('title: 甲')),
      b = saves.find(x => x.text.includes('title: 乙'));
    assert.ok(
      a.text.includes('[[' + b.id + ']]') &&
        a.text.includes('[[不存在]]') &&
        !b.text.includes('public') &&
        a.text.includes('source: a.md')
    );
    const m = text(els.main);
    assert.ok(
      m.includes('成功 3') &&
        m.includes('失敗 1') &&
        m.includes('不支援而略過 1 個檔案') &&
        m.includes('連結轉換 1 處') &&
        m.includes('原本標示為公開') &&
        m.includes('b.md') &&
        m.includes('補了 title、date') &&
        m.includes('不存在')
    );
  });
  await t('重複匯入：內容相同略過；內容不同不覆寫並列入待處理', async () => {
    const saves = [];
    const h = owner();
    h.listIndex = () => ({
      ok: true,
      topics,
      items: [
        {
          id: '20261001-a1',
          title: '甲',
          topic: '',
          date: '2026-10-01',
          tags: [],
          links: [],
          public: null,
          source: 'same.md'
        },
        {
          id: '20261002-b2',
          title: '乙',
          topic: '',
          date: '2026-10-01',
          tags: [],
          links: [],
          public: null,
          source: 'diff.md'
        }
      ]
    });
    h.getNote = p => ({
      ok: true,
      body: p.id === '20261001-a1' ? '內容一致\n' : '舊的內容',
      meta: { title: 'x' },
      text: '',
      updatedAt: 'V'
    });
    h.saveNote = p => {
      saves.push(p);
      return { ok: true, id: p.id, updatedAt: 'U' };
    };
    const { els } = await boot(h);
    click(byText(els.tools, 'button', '上傳')[0]);
    await flush();
    await flush();
    await pickFiles(els, [
      ['same.md', '---\ntitle: 甲\n---\n內容一致'],
      ['diff.md', '---\ntitle: 乙\n---\n新的內容']
    ]);
    assert.strictEqual(saves.length, 0);
    const m = text(els.main);
    assert.ok(m.includes('略過 1') && m.includes('需處理 1') && m.includes('未覆寫'));
  });
  await t('上傳網路中斷：可重試失敗項，且用同一個 id', async () => {
    const saves = [];
    let down = true;
    const h = owner();
    h.saveNote = p => {
      saves.push(p);
      return down ? new Error('逾時') : { ok: true, id: p.id, updatedAt: 'U' };
    };
    const { els } = await boot(h);
    click(byText(els.tools, 'button', '上傳')[0]);
    await flush();
    await flush();
    await pickFiles(els, [['a.md', '# 甲\nx']]);
    assert.ok(text(els.main).includes('失敗 1') && text(els.main).includes('重試失敗項'));
    down = false;
    click(byText(els.main, 'button', '重試失敗項')[0]);
    for (let i = 0; i < 6; i++) await flush();
    assert.strictEqual(saves.length, 2);
    assert.strictEqual(saves[0].id, saves[1].id);
    assert.ok(text(els.main).includes('成功 1'));
  });

  const pickFolder = async (els, files) => {
    const pick = byId(els.main, 'u-folder');
    pick.files = files.map(([path, body]) => ({
      name: path.split('/').pop(),
      webkitRelativePath: path,
      text: () => Promise.resolve(body)
    }));
    pick.listeners.change[0]();
    for (let i = 0; i < 8; i++) await flush();
  };
  await t(
    '資料夾匯入：先預覽不寫入；確認後建立私人新主題、既有主題比對標題、散檔未歸類、略過隱藏與不支援的檔案、SVG 引用改寫',
    async () => {
      const topicsSaved = [],
        notes = [],
        svgs = [];
      const h = owner();
      h.saveTopic = p => {
        topicsSaved.push(p);
        return { ok: true, id: p.id };
      };
      h.saveNote = p => {
        notes.push(p);
        return { ok: true, id: p.id, updatedAt: 'U' };
      };
      h.uploadSvg = p => {
        svgs.push(p);
        return { ok: true, id: p.id, removed: [] };
      };
      const { els } = await boot(h);
      click(byText(els.tools, 'button', '上傳')[0]);
      await flush();
      await flush();
      await pickFolder(els, [
        ['vault/資料庫設計/a.md', '# 甲\n見 [[乙頁]]'],
        ['vault/新主題/b.md', '---\ntitle: 乙頁\n---\n![圖](../img/er.svg)'],
        ['vault/新主題/img/er.svg', '<svg/>'],
        ['vault/readme.md', '說明'],
        ['vault/.obsidian/x.md', 'hidden'],
        ['vault/pic.png', 'png']
      ]);
      let m = text(els.main);
      assert.ok(
        m.includes('匯入預覽') &&
          m.includes('「資料庫設計」→ 既有主題') &&
          m.includes('「新主題」→ 新增私人主題') &&
          m.includes('未歸類') &&
          m.includes('SVG 1 個') &&
          m.includes('略過的檔案 1 個')
      );
      assert.strictEqual(notes.length + topicsSaved.length + svgs.length, 0);
      click(byId(els.main, 'u-go'));
      for (let i = 0; i < 12; i++) await flush();
      assert.strictEqual(topicsSaved.length, 1);
      assert.strictEqual(topicsSaved[0].title, '新主題');
      assert.strictEqual(topicsSaved[0].defaultPublic, false);
      assert.ok(/^t-[a-z0-9]{4}$/.test(topicsSaved[0].id));
      assert.strictEqual(notes.length, 3);
      assert.strictEqual(svgs.length, 1);
      const a = notes.find(x => x.text.includes('title: 甲')),
        b = notes.find(x => x.text.includes('title: 乙頁')),
        r = notes.find(x => x.text.includes('source: readme.md'));
      assert.ok(
        a.text.includes('topic: db') &&
          a.text.includes('[[' + b.id + ']]') &&
          b.text.includes('topic: ' + topicsSaved[0].id) &&
          !r.text.includes('topic:')
      );
      assert.ok(b.text.includes('assets/' + svgs[0].id + '.svg') && b.text.includes('source: b.md'));
      m = text(els.main);
      assert.ok(
        m.includes('成功 4') && m.includes('SVG 引用改寫 1 處') && m.includes('不支援而略過 1 個檔案')
      );
    }
  );
  await t('資料夾匯入：選到的資料夾沒有子資料夾時，它本身就是主題；預覽可取消', async () => {
    const { els } = await boot(owner());
    click(byText(els.tools, 'button', '上傳')[0]);
    await flush();
    await flush();
    await pickFolder(els, [
      ['我的新書/a.md', 'x'],
      ['我的新書/b.md', 'y']
    ]);
    assert.ok(text(els.main).includes('「我的新書」→ 新增私人主題　2 則'));
    click(byText(els.main, 'button', '取消')[0]);
    assert.ok(!text(els.main).includes('匯入預覽'));
  });
  await t('續傳：中途失敗後離開再回來，可從上次進度繼續；完成後不再提示', async () => {
    let n = 0;
    const saved = [];
    const h = owner();
    h.saveNote = p => {
      n++;
      if (n === 2) return new Error('斷線');
      saved.push(p.id);
      return { ok: true, id: p.id, updatedAt: 'U' };
    };
    const { els } = await boot(h);
    click(byText(els.tools, 'button', '上傳')[0]);
    await flush();
    await flush();
    await pickFiles(els, [
      ['一.md', '# 一'],
      ['二.md', '# 二'],
      ['三.md', '# 三']
    ]);
    assert.ok(text(els.main).includes('成功 2') && text(els.main).includes('失敗 1'));
    click(byText(els.main, 'button', '回到列表')[0]);
    await flush();
    click(byText(els.tools, 'button', '上傳')[0]);
    for (let i = 0; i < 4; i++) await flush();
    assert.ok(
      text(els.main).includes('上次有尚未完成的匯入') && text(els.main).includes('1 個檔案待處理（共 3 個）')
    );
    click(byId(els.main, 'u-resume'));
    for (let i = 0; i < 8; i++) await flush();
    assert.ok(text(els.main).includes('成功 3') && saved.length === 3 && new Set(saved).size === 3);
    click(byText(els.main, 'button', '回到列表')[0]);
    await flush();
    click(byText(els.tools, 'button', '上傳')[0]);
    for (let i = 0; i < 4; i++) await flush();
    assert.ok(!text(els.main).includes('上次有尚未完成的匯入'));
  });
  await t('續傳：可放棄上次的匯入', async () => {
    let n = 0;
    const h = owner();
    h.saveNote = p => {
      n++;
      return n === 1 ? new Error('斷線') : { ok: true, id: p.id, updatedAt: 'U' };
    };
    const { els } = await boot(h);
    click(byText(els.tools, 'button', '上傳')[0]);
    await flush();
    await flush();
    await pickFiles(els, [['一.md', '# 一']]);
    click(byText(els.main, 'button', '回到列表')[0]);
    await flush();
    click(byText(els.tools, 'button', '上傳')[0]);
    for (let i = 0; i < 4; i++) await flush();
    click(byText(els.main, 'button', '放棄這次匯入')[0]);
    for (let i = 0; i < 4; i++) await flush();
    assert.ok(!text(els.main).includes('上次有尚未完成的匯入'));
  });
  await t('很多檔案時只列出需注意與最近完成的，不會把畫面塞滿', async () => {
    const h = owner();
    h.saveNote = p => ({ ok: true, id: p.id, updatedAt: 'U' });
    const { els } = await boot(h);
    click(byText(els.tools, 'button', '上傳')[0]);
    await flush();
    await flush();
    await pickFiles(
      els,
      Array.from({ length: 80 }, (_, i) => ['n' + i + '.md', '# 筆記' + i])
    );
    for (let i = 0; i < 600 && !text(els.main).includes('處理完畢'); i++) await flush();
    assert.ok(
      text(els.main).includes('成功 80') &&
        find(els.main, x => x.tag === 'li').length < 30 &&
        text(els.main).includes('另有 70 項') &&
        text(els.main).includes('共 80 個項目')
    );
  });

  /* ───── 全文搜尋、ZIP 備份 ───── */
  const JSZip = require('../vendor/jszip.min.js');
  const A1 =
    '---\nid: 20261001-a1\ntitle: 正規化與反正規化\ntopic: db\ndate: 2026-10-01\n---\n這裡談到索引優化的取捨';
  const C3 = '---\nid: 20261010-c3\ntitle: 今天的心情\ntopic: journal\ndate: 2026-10-10\n---\n天氣很好';
  const exportable = () => {
    const h = owner();
    h.exportBatch = p =>
      p.cursor
        ? {
            ok: true,
            notes: [{ id: '20261010-c3', text: C3, updatedAt: 'U3' }],
            cursor: null,
            total: 2,
            missing: []
          }
        : {
            ok: true,
            notes: [{ id: '20261001-a1', text: A1, updatedAt: 'U1' }],
            cursor: '20261001-a1',
            total: 2,
            missing: []
          };
    h.exportAssets = () => ({ ok: true, assets: [{ id: '20261022-v001', svg: '<svg/>' }], cursor: null });
    h.exportImages = () => ({ ok: true, images: [], cursor: null });
    h.exportHtml = () => ({ ok: true, htmls: [], cursor: null });
    h.exportHtml = () => ({ ok: true, htmls: [], cursor: null });
    return h;
  };
  const itemsWithStamp = h => {
    h.listIndex = () => ({
      ok: true,
      topics,
      items: items.map((i, k) => Object.assign({}, i, { updatedAt: k ? 'U3' : 'U1' }))
    });
    return h;
  };

  await t('全文搜尋：擁有者背景建立索引後，可搜到內文；結果附摘要', async () => {
    const { els, calls } = await boot(itemsWithStamp(exportable()));
    for (let i = 0; i < 10; i++) await flush();
    assert.ok(calls.includes('exportBatch'));
    els.q.value = '索引優化';
    els.q.listeners.input[0]();
    await new Promise(r => setTimeout(r, 220));
    const m = text(els.main);
    assert.ok(
      m.includes('正規化與反正規化') &&
        m.includes('1 則') &&
        m.includes('索引優化的取捨') &&
        !m.includes('今天的心情')
    );
  });
  await t('全文搜尋：訪客不建立索引，也不呼叫匯出', async () => {
    const { els, calls } = await boot(good(false));
    for (let i = 0; i < 6; i++) await flush();
    assert.ok(!calls.includes('exportBatch') && !calls.includes('getNote'));
    els.q.value = '索引優化';
    els.q.listeners.input[0]();
    await new Promise(r => setTimeout(r, 220));
    assert.ok(text(els.main).includes('0 則'));
  });
  await t('ZIP 匯出：分批取得全部筆記、SVG、主題、畫布並打包，附 manifest', async () => {
    const h = exportable();
    h.getBoard = p =>
      p.topic === 'db'
        ? {
            ok: true,
            board: { nodes: [{ id: 'n', type: 'text', text: 'x', 'x-keep': 1 }], edges: [] },
            updatedAt: 'B1'
          }
        : { ok: true, board: { nodes: [], edges: [] }, updatedAt: null };
    const { els, blobs } = await boot(h);
    click(byText(els.tools, 'button', '備份')[0]);
    await flush();
    await flush();
    click(byId(els.main, 'z-export'));
    for (let i = 0; i < 20 && !byId(els.main, 'z-link'); i++) await flush();
    assert.ok(byId(els.main, 'z-link') && text(els.main).includes('筆記 2、SVG 1、主題 2、畫布 1'));
    const zip = await JSZip.loadAsync(Buffer.from(await blobs[0].arrayBuffer()));
    assert.deepStrictEqual(
      Object.keys(zip.files)
        .filter(k => !zip.files[k].dir)
        .sort(),
      [
        'assets/20261022-v001.svg',
        'boards/db.canvas.json',
        'manifest.json',
        'notes/20261001-a1.md',
        'notes/20261010-c3.md',
        'topics/db.json',
        'topics/journal.json'
      ]
    );
    assert.strictEqual(await zip.file('notes/20261001-a1.md').async('string'), A1);
    assert.ok((await zip.file('boards/db.canvas.json').async('string')).includes('x-keep'));
    assert.strictEqual(JSON.parse(await zip.file('manifest.json').async('string')).counts.notes, 2);
  });
  await t(
    'ZIP 匯入：先預覽並警告將公開的項目；確認後保留原 id，已存在的略過或列為需處理，壞檔名列入問題',
    async () => {
      const z = new JSZip();
      z.file('topics/t-new1.json', JSON.stringify({ id: 't-new1', title: '新主題', defaultPublic: true }));
      z.file('topics/db.json', JSON.stringify({ id: 'db', title: '資料庫設計' }));
      z.file('notes/20270101-n001.md', '---\nid: 20270101-n001\ntitle: 還原的新筆記\ntopic: t-new1\n---\nx');
      z.file('notes/20261001-a1.md', A1);
      z.file('notes/20261010-c3.md', C3.replace('天氣很好', '被改過'));
      z.file('notes/隨便.md', 'x');
      z.file('assets/20261022-v001.svg', '<svg/>');
      z.file('boards/t-new1.canvas.json', JSON.stringify({ nodes: [], edges: [] }));
      z.file('readme.txt', 'x');
      const buf = await z.generateAsync({ type: 'nodebuffer' });
      const rec = { topic: [], note: [], svg: [], board: [] };
      const h = itemsWithStamp(exportable());
      h.exportAssets = () => ({ ok: true, assets: [], cursor: null });
      h.exportImages = () => ({ ok: true, images: [], cursor: null });
      h.exportHtml = () => ({ ok: true, htmls: [], cursor: null });
      h.saveTopic = p => {
        rec.topic.push(p);
        return { ok: true, id: p.id };
      };
      h.saveNote = p => {
        rec.note.push(p);
        return { ok: true, id: p.id, updatedAt: 'U' };
      };
      h.uploadSvg = p => {
        rec.svg.push(p);
        return { ok: true, id: p.id, removed: [] };
      };
      h.getBoard = () => ({ ok: true, board: { nodes: [], edges: [] }, updatedAt: null });
      h.saveBoard = p => {
        rec.board.push(p);
        return { ok: true, updatedAt: 'B' };
      };
      const { els } = await boot(h);
      click(byText(els.tools, 'button', '備份')[0]);
      await flush();
      await flush();
      const pick = byId(els.main, 'z-file');
      pick.files = [buf];
      pick.listeners.change[0]();
      for (let i = 0; i < 10 && !byId(els.main, 'z-go'); i++) await flush();
      let m = text(els.main);
      assert.ok(
        m.includes('匯入預覽（尚未寫入任何資料）') &&
          m.includes('還原後有 2 項會成為公開') &&
          m.includes('公開主題 1 個、公開筆記 1 則') &&
          m.includes('檔名不符合備份格式') &&
          m.includes('無法辨識而略過的檔案 1 個')
      );
      assert.strictEqual(rec.note.length + rec.topic.length, 0);
      click(byId(els.main, 'z-go'));
      for (let i = 0; i < 30 && !text(els.main).includes('還原完畢'); i++) await flush();
      assert.strictEqual(rec.topic.length, 1);
      assert.strictEqual(rec.topic[0].id, 't-new1');
      assert.strictEqual(rec.topic[0].defaultPublic, true);
      assert.deepStrictEqual(
        rec.note.map(x => x.id),
        ['20270101-n001']
      );
      assert.strictEqual(rec.svg.length, 1);
      assert.strictEqual(rec.board.length, 1);
      m = text(els.main);
      assert.ok(
        m.includes('成功 4') &&
          m.includes('略過 2') &&
          m.includes('需處理 1') &&
          m.includes('已存在但內容不同，未覆寫')
      );
    }
  );
  await t('ZIP 匯入：不是備份格式或損毀的檔案，顯示錯誤而不是丟出例外', async () => {
    const { els } = await boot(owner());
    click(byText(els.tools, 'button', '備份')[0]);
    await flush();
    await flush();
    const pick = byId(els.main, 'z-file');
    pick.files = [Buffer.from('這不是 zip')];
    pick.listeners.change[0]();
    for (let i = 0; i < 10; i++) await flush();
    assert.ok(text(els.main).includes('無法讀取這個 ZIP'));
  });
  await t('ZIP 匯入：沒有公開項目時不顯示警告，按鈕為「開始匯入」', async () => {
    const z = new JSZip();
    z.file('notes/20270101-n002.md', '---\nid: 20270101-n002\ntitle: 私人\ntopic: db\n---\nx');
    const { els } = await boot(owner());
    click(byText(els.tools, 'button', '備份')[0]);
    await flush();
    await flush();
    const pick = byId(els.main, 'z-file');
    pick.files = [await z.generateAsync({ type: 'nodebuffer' })];
    pick.listeners.change[0]();
    for (let i = 0; i < 10 && !byId(els.main, 'z-go'); i++) await flush();
    assert.ok(!text(els.main).includes('會成為公開') && text(byId(els.main, 'z-go')) === '開始匯入');
  });

  console.log('\n共 ' + n + ' 項全部通過');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
