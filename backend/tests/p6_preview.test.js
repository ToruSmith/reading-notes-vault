// P6 後端離線測試：連結預覽（網址檢查、解析、權限、不被利用去連內網）、刪除畫布
const vm = require('vm'),
  fs = require('fs'),
  assert = require('assert'),
  path = require('path');
const makeStore = require('./fake_store');
const ctx = vm.createContext({ console, Logger: { log() {} } });
(process.env.BUNDLE
  ? ['Vault_all.gs']
  : ['Yaml.gs', 'Svg.gs', 'Core.gs', 'Sync.gs', 'Code.gs', 'Store.gs']
).forEach(f => vm.runInContext(fs.readFileSync(require('./paths').gsPath(f), 'utf8'), ctx, { filename: f }));
const g = n => vm.runInContext(n, ctx);
const J = o => JSON.parse(JSON.stringify(o));
const H = (a, p, c, m, s) => J(g('handle_')(a, p, c, m || 'RUN', s));
const OWNER = { isOwner: true, active: 'me@gmail.com' },
  VISITOR = { isOwner: false, active: '' };
let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('通過  ' + name);
};

t('網址檢查：只收公開網站的 https；擋 http、IP、連接埠、帳密、內網名稱、localhost、空白與過長', () => {
  const ok = g('previewUrlOk_');
  [
    'https://example.com/a?b=1#c',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://sub.domain.example.co.uk'
  ].forEach(u => assert.strictEqual(ok(u), true, u));
  [
    'http://example.com',
    'ftp://example.com',
    'https://127.0.0.1/x',
    'https://10.0.0.1',
    'https://[::1]/',
    'https://169.254.169.254/latest/meta-data',
    'https://example.com:8443/x',
    'https://user:pw@example.com',
    'https://a@example.com',
    'https://localhost/x',
    'https://printer.local/',
    'https://db.internal/',
    'https://intranet',
    'https://example',
    'https://exa mple.com',
    'https://example.com/\nx',
    'https://' + 'a'.repeat(2100) + '.com',
    '',
    'javascript:alert(1)',
    'https://2130706433/'
  ].forEach(u => assert.strictEqual(ok(u), false, u));
});

t(
  '解析：標題、描述、封面、站名；HTML 實體還原；相對封面補成 https；http 封面丟棄；腳本字樣只當純文字；過長截斷',
  () => {
    const p = g('parsePreview_');
    const html =
      '<html><head><title>備用標題</title><meta property="og:title" content="好文 &amp; 筆記 &#39;A&#39; &lt;b&gt;"><meta name="description" content="一般描述"><meta property="og:description" content="描述&nbsp;第二行\n換行">' +
      '<meta property="og:image" content="/img/cover.png"><meta property="og:site_name" content="我的站"></head><body><script>alert(1)</script></body></html>';
    const r = J(p(html, 'https://example.com/post/1'));
    assert.strictEqual(r.title, "好文 & 筆記 'A' <b>");
    assert.strictEqual(r.description, '描述 第二行 換行');
    assert.strictEqual(r.image, 'https://example.com/img/cover.png');
    assert.strictEqual(r.site, '我的站');
    assert.strictEqual(
      J(
        p(
          '<meta property="og:image" content="http://example.com/a.png"><title>T</title>',
          'https://example.com/'
        )
      ).image,
      ''
    );
    assert.strictEqual(
      J(
        p(
          '<meta property="og:image" content="https://127.0.0.1/a.png"><title>T</title>',
          'https://example.com/'
        )
      ).image,
      ''
    );
    assert.strictEqual(
      J(
        p(
          '<meta content="x" property="og:image"><meta content="https://cdn.example.com/c.jpg" property="og:image">',
          'https://example.com/'
        )
      ).image,
      ''
    );
    assert.strictEqual(J(p('<TITLE>\n 只有標題 \n</TITLE>', 'https://example.com/')).title, '只有標題');
    const long = J(
      p(
        '<title>' + '長'.repeat(500) + '</title><meta name="description" content="' + 'x'.repeat(900) + '">',
        'https://example.com/'
      )
    );
    assert.strictEqual(long.title.length, 120);
    assert.strictEqual(long.description.length, 240);
    assert.ok(!/[\u0000-\u001f]/.test(J(p('<title>a\u0000b\u0007c</title>', 'https://example.com/')).title));
  }
);

t('fetchPreview：擁有者可用；訪客、REST 讀取、非擁有者都被拒；網址不合規時完全不發出連線', () => {
  const s = makeStore();
  s.pages = {
    'https://example.com/a': {
      code: 200,
      contentType: 'text/html; charset=utf-8',
      text: '<title>範例標題</title><meta name="description" content="範例描述">'
    }
  };
  const r = H('fetchPreview', { url: 'https://example.com/a' }, OWNER, 'RUN', s);
  assert.ok(r.ok);
  assert.strictEqual(r.preview.title, '範例標題');
  assert.ok(r.preview.fetchedAt);
  assert.strictEqual(H('fetchPreview', { url: 'https://example.com/a' }, VISITOR, 'RUN', s).ok, false);
  assert.strictEqual(H('fetchPreview', { url: 'https://example.com/a' }, OWNER, 'GET', s).ok, false);
  assert.strictEqual(H('fetchPreview', { url: 'https://example.com/a' }, VISITOR, 'POST', s).ok, false);
  s.fetched = [];
  ['http://example.com/a', 'https://127.0.0.1/', 'https://localhost/', 'https://example.com:81/', ''].forEach(
    u => assert.strictEqual(H('fetchPreview', { url: u }, OWNER, 'RUN', s).ok, false, u)
  );
  assert.deepStrictEqual(J(s.fetched), [], '不合規的網址不得發出連線');
});

t('fetchPreview：錯誤情況都有清楚訊息（連不上、非 2xx、非網頁、沒有預覽資訊）', () => {
  const s = makeStore();
  s.pages = {
    'https://e.com/404': { code: 404, contentType: 'text/html', text: '' },
    'https://e.com/pdf': { code: 200, contentType: 'application/pdf', text: '%PDF' },
    'https://e.com/empty': {
      code: 200,
      contentType: 'text/html',
      text: '<html><body>沒有任何 meta</body></html>'
    }
  };
  const e = u => H('fetchPreview', { url: u }, OWNER, 'RUN', s);
  assert.ok(/無法連線/.test(e('https://e.com/down').error));
  assert.ok(/沒有回應成功/.test(e('https://e.com/404').error));
  assert.ok(/不是網頁/.test(e('https://e.com/pdf').error));
  assert.ok(/沒有可用的預覽/.test(e('https://e.com/empty').error));
});

t('刪除畫布：只有擁有者；主題與筆記不受影響；不存在的主題找不到；沒有畫布檔也成功', () => {
  const s = makeStore();
  s.saveTopic({ id: 'tp', title: '主題', defaultPublic: false });
  assert.ok(H('saveBoard', { topic: 'tp', board: { nodes: [], edges: [] } }, OWNER, 'RUN', s).ok);
  assert.strictEqual(H('deleteBoard', { topic: 'tp' }, VISITOR, 'RUN', s).ok, false);
  assert.strictEqual(H('deleteBoard', { topic: 'tp' }, OWNER, 'GET', s).ok, false);
  assert.ok(s.findFileByName('boards', 'tp.canvas.json'));
  const r = H('deleteBoard', { topic: 'tp' }, OWNER, 'RUN', s);
  assert.ok(r.ok && r.existed === true);
  assert.ok(!s.findFileByName('boards', 'tp.canvas.json'));
  assert.ok(H('listIndex', {}, OWNER, 'RUN', s).topics.some(x => x.id === 'tp'));
  assert.ok(H('deleteBoard', { topic: 'tp' }, OWNER, 'RUN', s).ok);
  assert.strictEqual(H('deleteBoard', { topic: 'zz' }, OWNER, 'RUN', s).ok, false);
});

t('x-preview 與未知欄位隨畫布原樣保存；訪客版畫布保留公開卡片的 x-preview', () => {
  const s = makeStore();
  s.saveTopic({ id: 'pub', title: '公開', defaultPublic: true });
  const board = {
    nodes: [
      {
        id: 'L',
        type: 'link',
        url: 'https://example.com/a',
        x: 0,
        y: 0,
        width: 300,
        height: 160,
        'x-preview': {
          title: 'T',
          description: 'D',
          image: 'https://example.com/i.png',
          fetchedAt: '2026-10-25T00:00:00.000Z'
        },
        'x-future': 1
      }
    ],
    edges: []
  };
  assert.ok(H('saveBoard', { topic: 'pub', board }, OWNER, 'RUN', s).ok);
  const v = H('getBoard', { topic: 'pub' }, VISITOR, 'GET', s);
  assert.deepStrictEqual(J(v.board.nodes[0]['x-preview']), board.nodes[0]['x-preview']);
  assert.strictEqual(v.board.nodes[0]['x-future'], 1);
});

console.log('\nP6 後端：' + n + ' 項全部通過');
