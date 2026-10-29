// 站台測試共用：用真實後端（Core.gs/Sync.gs，假儲存層）建立一個 Vault，經「同步」推到假的 GitHub，再取出 content/ 當靜態站的輸入
const vm = require('vm'),
  fs = require('fs'),
  path = require('path'),
  os = require('os'),
  cp = require('child_process');
const BE = path.join(__dirname, '..', '..', 'backend');
const makeStore = require(path.join(BE, 'tests', 'fake_store')),
  makeGh = require(path.join(BE, 'tests', 'fake_github'));
const ctx = vm.createContext({ console, Logger: { log() {} } });
['Yaml.gs', 'Svg.gs', 'Core.gs', 'Sync.gs', 'Code.gs', 'Store.gs'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(BE, f), 'utf8'), ctx, { filename: f })
);
const handle = vm.runInContext('handle_', ctx);
const OWNER = { isOwner: true, active: 'me@gmail.com' },
  VISITOR = { isOwner: false, active: '' };
const H = (a, p, c, s) => JSON.parse(JSON.stringify(handle(a, p, c || OWNER, 'RUN', s)));
const fm = (id, title, topic, pub, body, extra) =>
  '---\nid: ' +
  id +
  '\ntitle: ' +
  title +
  '\ntopic: ' +
  topic +
  '\ndate: ' +
  ((extra && extra.date) || '2026-10-22') +
  '\n' +
  (pub === undefined ? '' : 'public: ' + pub + '\n') +
  (extra && extra.lang ? 'lang: ' + extra.lang + '\n' : '') +
  (extra && extra.translation_of ? 'translation_of: ' + extra.translation_of + '\n' : '') +
  (extra && extra.tags ? 'tags: [' + extra.tags.join(', ') + ']\n' : '') +
  '---\n' +
  body;

function makeVault(extra) {
  const s = makeStore();
  s.saveTopic({ id: 'pub', title: '公開本', defaultPublic: true });
  s.saveTopic({ id: 'priv', title: '機密主題名', defaultPublic: false });
  const save = (id, ...a) => {
    const r = H('saveNote', { id, text: fm(id, ...a) }, OWNER, s);
    if (!r.ok) throw new Error(JSON.stringify(r));
  };
  H(
    'uploadSvg',
    { id: '20261022-v001', text: '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>' },
    OWNER,
    s
  );
  H('uploadSvg', { id: '20261022-v002', text: '<svg><circle r="3"/></svg>' }, OWNER, s);
  save(
    '20261001-a001',
    '資料庫入門',
    'pub',
    undefined,
    '# 正文\n\n## 小節一\n\n內文 A，連到 [[20261003-a003]]，也連到私人 [[20261022-s001]]。\n\n### 子節\n\n![示意圖](assets/20261022-v001.svg)\n\n```sql\nselect 1;\n```\n\n## 小節二\n\n結尾',
    { date: '2026-10-01', lang: 'zh-Hant', tags: ['db', '入門'] }
  );
  save('20261002-a002', 'Database Basics', 'pub', undefined, 'English body', {
    date: '2026-10-02',
    lang: 'en',
    translation_of: '20261001-a001'
  });
  save('20261003-a003', '未指定語言的筆記', 'pub', undefined, '沒有 lang，視為預設語言', {
    date: '2026-10-03'
  });
  save(
    '20261004-a004',
    '<img src=x onerror=alert(1)> 惡意標題',
    'pub',
    undefined,
    '<script>alert(1)</script>\n\n[壞連結](javascript:alert(1))\n\n<b>html</b>',
    { date: '2026-10-04' }
  );
  save('20261022-s001', '私人標題XYZ', 'priv', undefined, 'SECRET-BODY ![](assets/20261022-v002.svg)', {
    date: '2026-10-05'
  });
  H(
    'saveBoard',
    {
      topic: 'pub',
      board: {
        nodes: [
          { id: 'g', type: 'group', label: '群組一', x: -50, y: -50, width: 700, height: 400, color: '4' },
          { id: 't', type: 'text', text: '卡片 **文字**', x: 0, y: 0, width: 220, height: 100, color: '2' },
          { id: 'f', type: 'file', file: 'notes/20261001-a001.md', x: 300, y: 0, width: 240, height: 80 },
          { id: 'p', type: 'file', file: 'notes/20261022-s001.md', x: 300, y: 150, width: 240, height: 80 },
          {
            id: 'l',
            type: 'link',
            url: 'https://example.com/x',
            x: 0,
            y: 200,
            width: 220,
            height: 80,
            'x-preview': {
              title: '預覽<script>alert(1)</script>標題',
              description: '描述文字',
              image: 'https://img.example.com/c.png',
              site: '範例站'
            }
          }
        ],
        edges: [{ id: 'e', fromNode: 't', toNode: 'f', label: '關聯' }]
      }
    },
    OWNER,
    s
  );
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
  );
  if (extra) extra(s, save);
  return s;
}
/** 同步到假 GitHub，並把 repo 內 content/ 寫到暫存資料夾，回傳資料夾路徑 */
function syncToDir(s) {
  const gh = makeGh();
  Object.assign(s.cfg, { GITHUB_TOKEN: gh.opts.token, GITHUB_REPO: gh.opts.repo });
  s.httpImpl = r => gh.http(r);
  const r = H('syncSite', {}, OWNER, s);
  if (!r.ok) throw new Error(JSON.stringify(r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-content-')),
    files = gh.files();
  Object.keys(files)
    .filter(k => k.startsWith('content/'))
    .forEach(k => {
      const p = path.join(dir, k.slice(8));
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, files[k]);
    });
  return { dir, gh };
}
function buildSite(contentDir, env) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-dist-'));
  const r = cp.spawnSync('node', [path.join(__dirname, '..', 'build.js')], {
    env: Object.assign({}, process.env, { CONTENT_DIR: contentDir, OUT_DIR: out }, env || {}),
    encoding: 'utf8'
  });
  if (r.status !== 0) throw new Error('build 失敗：' + r.stderr + r.stdout);
  return { out, log: r.stdout };
}
const walk = (dir, base) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap(e =>
      e.isDirectory() ? walk(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name))]
    );
module.exports = { makeVault, syncToDir, buildSite, walk, H, OWNER, VISITOR, fm, makeStore, makeGh };
