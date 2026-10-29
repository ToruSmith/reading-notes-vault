// P4 安全自查：匿名存取私人內容、上傳端點濫用、惡意 SVG。結果同時寫成報告（docs/SECURITY_AUDIT.md）。
const vm = require('vm'),
  fs = require('fs'),
  assert = require('assert'),
  path = require('path');
const makeStore = require('./fake_store');
const ctx = vm.createContext({ console, Logger: { log() {} } });
['Yaml.gs', 'Svg.gs', 'Core.gs', 'Sync.gs', 'Code.gs', 'Store.gs'].forEach(f =>
  vm.runInContext(fs.readFileSync(require('./paths').gsPath(f), 'utf8'), ctx, { filename: f })
);
const g = n => vm.runInContext(n, ctx);
const H = (a, p, c, m, s) => JSON.parse(JSON.stringify(g('handle_')(a, p, c, m, s)));
const OWNER = { isOwner: true, active: 'me@gmail.com' },
  VISITOR = { isOwner: false, active: '' },
  OTHER = { isOwner: false, active: 'stranger@gmail.com' };
const WRITES = Object.keys(g('WRITE_ACTIONS_'));
const rows = [];
let fails = 0;
const check = (area, name, fn) => {
  let ok = false,
    note = '';
  try {
    const r = fn();
    ok = r === undefined || r === true || (r && r.ok !== false);
    note = (r && r.note) || '';
    if (r === false) ok = false;
  } catch (e) {
    note = e.message.split('\n')[0];
  }
  if (!ok) fails++;
  rows.push({ area, name, ok, note });
  console.log((ok ? '通過  ' : '失敗  ') + '[' + area + '] ' + name + (note ? '  — ' + note : ''));
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
function seed() {
  const s = makeStore();
  s.saveTopic({ id: 'priv', title: '機密主題名', defaultPublic: false });
  s.saveTopic({ id: 'pub', title: '公開主題', defaultPublic: true });
  const save = (id, ...a) => assert.ok(H('saveNote', { id, text: fm(id, ...a) }, OWNER, 'RUN', s).ok);
  assert.ok(H('uploadSvg', { id: '20261022-v001', text: '<svg><rect/></svg>' }, OWNER, 'RUN', s).ok);
  assert.ok(H('uploadSvg', { id: '20261022-v002', text: '<svg><circle/></svg>' }, OWNER, 'RUN', s).ok);
  save('20261022-p001', '私人標題XYZ', 'priv', undefined, 'SECRET-BODY ![](assets/20261022-v002.svg)');
  save(
    '20261022-p002',
    '公開一',
    'pub',
    undefined,
    '公開內文 [[20261022-p001]] ![](assets/20261022-v001.svg)',
    'translation_of: 20261022-p001\n'
  );
  save('20261022-p003', '私人另一', 'priv', undefined, 'x', 'translation_of: 20261022-p002\n');
  assert.ok(
    H(
      'saveBoard',
      {
        topic: 'priv',
        board: {
          nodes: [{ id: 'n', type: 'text', text: 'SECRET-BOARD', x: 0, y: 0, width: 10, height: 10 }],
          edges: []
        }
      },
      OWNER,
      'RUN',
      s
    ).ok
  );
  return s;
}
const store = seed();
const snap = () => JSON.stringify([store.getIndexRows(), store.getTopics()]);
const SECRET = [
  '私人標題XYZ',
  'SECRET-BODY',
  'SECRET-BOARD',
  '機密主題名',
  '20261022-p001',
  '20261022-p003',
  '20261022-v002',
  'driveFileId'
];
const leaks = s => SECRET.filter(k => s.indexOf(k) >= 0);

/* ───── A. 匿名（與已登入但不是擁有者）能不能看到私人內容 ───── */
[
  ['未登入訪客', VISITOR],
  ['已登入的陌生人', OTHER]
].forEach(([who, c]) => {
  check('A 匿名存取', who + '：索引與主題清單沒有任何私人標題、id、主題名', () => {
    const r = JSON.stringify(H('listIndex', {}, c, 'RUN', store));
    const l = leaks(r);
    return { ok: !l.length, note: l.join(',') };
  });
  check('A 匿名存取', who + '：讀私人筆記／私人圖／私人畫布，回應與「不存在」完全相同', () => {
    const same = (a, p, q) =>
      JSON.stringify(H(a, p, c, 'RUN', store)) === JSON.stringify(H(a, q, c, 'RUN', store));
    return (
      same('getNote', { id: '20261022-p001' }, { id: '20269999-zz' }) &&
      same('getSvg', { id: '20261022-v002' }, { id: '20269999-zz' }) &&
      same('getBoard', { topic: 'priv' }, { topic: 'nope' })
    );
  });
  check('A 匿名存取', who + '：公開筆記內指向私人筆記的連結被拿掉，翻譯關聯不洩漏私人目標', () => {
    const n = JSON.stringify(H('getNote', { id: '20261022-p002' }, c, 'RUN', store)),
      i = JSON.stringify(H('listIndex', {}, c, 'RUN', store));
    return { ok: !leaks(n).length && !/"translationOf":"[^"]/.test(i), note: leaks(n).join(',') };
  });
  check('A 匿名存取', who + '：所有寫入／預覽／匯出動作一律拒絕，且儲存內容沒有任何變動', () => {
    const before = snap();
    const bad = WRITES.filter(
      a =>
        JSON.stringify(
          H(
            a,
            { id: '20261022-p001', ids: ['20261022-p001'], topic: 'priv', text: 'x', public: true },
            c,
            'POST',
            store
          )
        ) !== JSON.stringify({ ok: false, error: '無法完成' })
    );
    return { ok: !bad.length && snap() === before, note: bad.join(',') };
  });
  check(
    'A 匿名存取',
    who + '：公開檔案可正常讀取（防止過度封鎖）',
    () =>
      H('getNote', { id: '20261022-p002' }, c, 'RUN', store).ok &&
      H('getSvg', { id: '20261022-v001' }, c, 'RUN', store).ok
  );
});
check(
  'A 匿名存取',
  '擁有者身分走 REST GET 時一律當訪客：看不到私人筆記、寫入被拒',
  () =>
    !H('getNote', { id: '20261022-p001' }, OWNER, 'GET', store).ok &&
    !H(
      'saveNote',
      { id: '20261022-p009', text: fm('20261022-p009', 't', 'pub', undefined, 'b') },
      OWNER,
      'GET',
      store
    ).ok &&
    !H('previewNote', { id: '20261022-p001' }, OWNER, 'GET', store).ok
);
check('A 匿名存取', '亂構造的 id（路徑、超長、陣列、物件、null）都只得到「找不到」，不丟例外', () =>
  [
    '../x',
    'a'.repeat(5000),
    ['20261022-p001'],
    { a: 1 },
    null,
    undefined,
    '20261022-p001\u0000',
    '20261022-p001 '
  ].every(id => {
    const r = H('getNote', { id }, VISITOR, 'RUN', store);
    return r.ok === false && !leaks(JSON.stringify(r)).length;
  })
);
check('A 匿名存取', '不存在的動作名稱、原型鏈名稱（__proto__、constructor）一律拒絕', () =>
  ['nope', '__proto__', 'constructor', 'toString', ''].every(
    a => H(a, {}, VISITOR, 'RUN', store).ok === false
  )
);
check(
  'A 匿名存取',
  '擁有者預覽（previewPublic／previewNote）與訪客看到的結果逐字相同',
  () =>
    JSON.stringify(H('previewPublic', {}, OWNER, 'RUN', store)).replace(/"generatedAt":"[^"]*"/, '') ===
      JSON.stringify(H('listIndex', {}, VISITOR, 'RUN', store)).replace(/"generatedAt":"[^"]*"/, '') &&
    JSON.stringify(H('previewNote', { id: '20261022-p001' }, OWNER, 'RUN', store)) ===
      JSON.stringify(H('getNote', { id: '20261022-p001' }, VISITOR, 'RUN', store))
);
check(
  'A 匿名存取',
  '私人主題改公開需明確確認；批次公開也需確認（不會被靜默擴大）',
  () =>
    !H('saveTopic', { id: 'priv', title: 'x', defaultPublic: true }, OWNER, 'RUN', store).ok &&
    !H('updateNotes', { ids: ['20261022-p001'], public: true }, OWNER, 'RUN', store).ok
);

/* ───── B. 上傳／寫入端點濫用 ───── */
check('B 上傳端點', '訪客與陌生人不能上傳 SVG、存筆記、存畫布（見 A 的全部寫入動作測試）', () =>
  ['uploadSvg', 'saveNote', 'saveBoard'].every(
    a => !H(a, { id: '20261022-v777', text: '<svg/>', topic: 'pub', board: {} }, OTHER, 'POST', store).ok
  )
);
check('B 上傳端點', 'SVG 超過 5 MB 技術上限：擁有者也被拒（避免單次請求拖垮服務）', () => {
  const r = H('uploadSvg', { text: '<svg>' + 'a'.repeat(5 * 1024 * 1024) + '</svg>' }, OWNER, 'RUN', store);
  return !r.ok;
});
check('B 上傳端點', 'SVG 欄位型別錯誤（數字、物件、陣列、null）被拒，不丟例外', () =>
  [1, {}, [], null].every(v => !H('uploadSvg', { text: v }, OWNER, 'RUN', store).ok)
);
check(
  'B 上傳端點',
  '上傳的 id 若含路徑符號或超出格式，一律拒絕（不能寫到其他資料夾或覆寫別的檔案）',
  () =>
    ['../evil', 'a/b', '20261022-p001.md', '', '20261022-V001', 'x'.repeat(300)]
      .filter(Boolean)
      .every(id => !H('uploadSvg', { id, text: '<svg/>' }, OWNER, 'RUN', store).ok) && !!snap()
);
check(
  'B 上傳端點',
  '筆記內容超過技術上限被拒；front matter 的 id 與請求的 id 不符時以請求為準，不會多出另一則筆記',
  () =>
    !H(
      'saveNote',
      {
        id: '20261022-p010',
        text: fm('20261022-p010', 't', 'pub', undefined, 'a'.repeat(5 * 1024 * 1024 + 1))
      },
      OWNER,
      'RUN',
      store
    ).ok &&
    (function () {
      H(
        'saveNote',
        { id: '20261022-p011', text: fm('20261022-p012', 't', 'pub', undefined, 'b') },
        OWNER,
        'RUN',
        store
      );
      return (
        !H('getNote', { id: '20261022-p012' }, OWNER, 'RUN', store).ok &&
        /^---\nid: 20261022-p011\n/.test(H('getNote', { id: '20261022-p011' }, OWNER, 'RUN', store).text)
      );
    })()
);
check('B 上傳端點', '一次批次修改／刪除超過 30 則被拒', () => {
  const ids = Array.from({ length: 31 }, (_, i) => '20261022-q' + String(i).padStart(2, '0'));
  return (
    !H('updateNotes', { ids, public: false }, OWNER, 'RUN', store).ok &&
    !H('deleteNotes', { ids }, OWNER, 'RUN', store).ok
  );
});
check(
  'B 上傳端點',
  'translation_of 填入不合法 id 或自己 → 被拒',
  () =>
    !H(
      'saveNote',
      {
        id: '20261022-p020',
        text: fm('20261022-p020', 't', 'pub', undefined, 'b', 'translation_of: ../x\n')
      },
      OWNER,
      'RUN',
      store
    ).ok &&
    !H(
      'saveNote',
      {
        id: '20261022-p021',
        text: fm('20261022-p021', 't', 'pub', undefined, 'b', 'translation_of: 20261022-p021\n')
      },
      OWNER,
      'RUN',
      store
    ).ok
);
check('B 上傳端點', '分享參數 routeJson_：注入 </script>、引號、換行、超長值，輸出不含可跳脫的字元', () => {
  const out = g('routeJson_')(
    { note: '</script><script>alert(1)</script>', topic: '"};alert(1);//', lang: 'en\u2028' },
    'https://x.test/exec?"</script>'
  );
  return {
    ok:
      !/<\/script|<script|\u2028|\u2029/i.test(out) &&
      (function () {
        try {
          JSON.parse(out);
          return true;
        } catch (e) {
          return false;
        }
      })(),
    note: out.slice(0, 80)
  };
});

/* ───── C. 惡意 SVG ───── */
const DANGER =
  /<script|<\/script|\son[a-z]+\s*=|javascript:|<foreignobject|<iframe|<embed|<object|<!entity|<!doctype\s+svg\s*\[|data:text\/html|vbscript:|(?:xlink:)?href\s*=\s*["']\s*(?:https?:)?\/\//i;
const CORPUS = [
  ['script 元素', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
  ['onload 屬性', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'],
  [
    'onclick／onmouseover',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="alert(1)" onmouseover=alert(1) width="10" height="10"/></svg>'
  ],
  [
    '大小寫混合事件屬性',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect OnClick="alert(1)" ONLOAD=\'alert(1)\'/></svg>'
  ],
  [
    'foreignObject 內嵌 HTML',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject></svg>'
  ],
  [
    'javascript: 連結',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>'
  ],
  [
    'href 帶空白／大小寫的 javascript:',
    '<svg xmlns="http://www.w3.org/2000/svg"><a href=" JaVaScRiPt:alert(1)"><text>x</text></a></svg>'
  ],
  [
    'href 含換行拆字的 javascript:',
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="java&#x0A;script:alert(1)"><text>x</text></a></svg>'
  ],
  [
    '實體編碼的 javascript:',
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="&#106;avascript:alert(1)"><text>x</text></a></svg>'
  ],
  [
    '外部資源 use／image',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="https://evil.test/x.svg#a"/><image href="//evil.test/a.png"/></svg>'
  ],
  [
    '實體宣告（XXE／billion laughs）',
    '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><svg xmlns="http://www.w3.org/2000/svg"><text>&b;</text></svg>'
  ],
  ['外部 DTD', '<!DOCTYPE svg SYSTEM "http://evil.test/x.dtd"><svg xmlns="http://www.w3.org/2000/svg"/>'],
  [
    'CSS @import／expression／url(javascript)',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://evil.test/a.css); rect{background:url(javascript:alert(1))}</style><rect style="width:expression(alert(1))"/></svg>'
  ],
  [
    'style 內塞 </style><script>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>a{}</style><script>alert(1)</script></svg>'
  ],
  [
    'CDATA 夾帶 script',
    '<svg xmlns="http://www.w3.org/2000/svg"><![CDATA[<script>alert(1)</script>]]></svg>'
  ],
  ['註解夾帶', '<svg xmlns="http://www.w3.org/2000/svg"><!--<script>alert(1)</script>--><rect/></svg>'],
  [
    '命名空間前綴的 script',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg"><s:script>alert(1)</s:script></svg>'
  ],
  [
    'animate 改 href 為 javascript',
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="#"><animate attributeName="href" values="javascript:alert(1)"/><text>x</text></a></svg>'
  ],
  [
    'set 元素改 href',
    '<svg xmlns="http://www.w3.org/2000/svg"><a><set attributeName="xlink:href" to="javascript:alert(1)"/><text>x</text></a></svg>'
  ],
  [
    'data:text/html 連結',
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="><text>x</text></a></svg>'
  ],
  ['根元素之外的 HTML', '<html><body><script>alert(1)</script></body></html>'],
  ['兩個根元素', '<svg xmlns="http://www.w3.org/2000/svg"/><svg onload="alert(1)"/>'],
  ['標籤未配對', '<svg xmlns="http://www.w3.org/2000/svg"><g></svg>'],
  [
    '屬性值內含 > 試圖提前結束標籤',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect title="a>b" onclick="alert(1)"/></svg>'
  ],
  ['無引號屬性塞事件', '<svg xmlns="http://www.w3.org/2000/svg"><rect width=1 onclick=alert(1)/></svg>'],
  [
    '反斜線／空字元混淆',
    '<svg xmlns="http://www.w3.org/2000/svg"><scr\u0000ipt>alert(1)</scr\u0000ipt></svg>'
  ],
  ['BOM 前綴', '﻿<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'],
  ['空內容', '   ']
];
let sanitized = 0,
  rejected = 0;
CORPUS.forEach(([name, svg]) =>
  check('C 惡意 SVG', name, () => {
    const r = H('uploadSvg', { id: '20261023-c001', text: svg }, OWNER, 'RUN', store);
    if (!r.ok) {
      rejected++;
      return { ok: true, note: '拒絕：' + (r.reasons || [r.error]).join('；') };
    }
    const stored = store.readText(store.findFileByName('assets', '20261023-c001.svg').fileId);
    const bad = DANGER.exec(stored);
    if (bad) return { ok: false, note: '殘留 ' + bad[0] };
    sanitized++;
    return { ok: true, note: '已清除並存入（移除：' + (r.removed || []).join(',') + '）' };
  })
);
check('C 惡意 SVG', '合法 SVG（含 gradient、text、path、內部 #錨點 use）仍可正常上傳與取回', () => {
  const s =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs><path d="M0 0L10 10" fill="url(#g)"/><text x="1" y="5">中文</text><use href="#g"/></svg>';
  const r = H('uploadSvg', { id: '20261023-c002', text: s }, OWNER, 'RUN', store);
  return (
    r.ok &&
    /<path/.test(store.readText(store.findFileByName('assets', '20261023-c002.svg').fileId)) &&
    /中文/.test(store.readText(store.findFileByName('assets', '20261023-c002.svg').fileId))
  );
});
check('C 惡意 SVG', '前端一律以 <img> 載入 SVG（data URI），不內嵌進頁面；即使殘留也不會執行腳本', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'ui.js'), 'utf8');
  return /img\.src = 'data:image\/svg\+xml/.test(ui) && !/innerHTML\s*=\s*r\.svg/.test(ui);
});

/* ───── D. 備份與同步（P5）：token 不外洩、只推公開內容、連線範圍受限 ───── */
const makeGh = require('./fake_github');
(function () {
  const gh = makeGh();
  store.cfg = { GITHUB_TOKEN: gh.opts.token, GITHUB_REPO: gh.opts.repo };
  store.httpImpl = r => gh.http(r);
  const sync = H('syncSite', {}, OWNER, 'RUN', store);
  check(
    'D 備份與同步',
    '同步成功：repo 內所有檔案（含 manifest）完全沒有私人標題、內文、id、主題名、畫布、token',
    () => {
      const all = Object.values(gh.files()).join('\n');
      const l = SECRET.concat([gh.opts.token]).filter(k => all.indexOf(k) >= 0);
      return { ok: sync.ok && !l.length, note: l.join(',') };
    }
  );
  check(
    'D 備份與同步',
    'token 不會出現在任何回應：siteStatus、backupStatus、syncSite（成功、失敗、預覽）',
    () => {
      const out = [
        H('siteStatus', {}, OWNER, 'RUN', store),
        H('backupStatus', {}, OWNER, 'RUN', store),
        sync,
        H('syncSite', { dryRun: true }, OWNER, 'RUN', store)
      ];
      [401, 403, 404, 422].forEach(c => {
        gh.fail = { match: /git\/ref\//, code: c };
        out.push(H('syncSite', {}, OWNER, 'RUN', store));
      });
      gh.fail = null;
      const s2 = JSON.stringify(out);
      return { ok: s2.indexOf(gh.opts.token) < 0 && !/ghp_|Bearer/.test(s2) };
    }
  );
  check(
    'D 備份與同步',
    '連線只限 https://api.github.com/ 且只能碰自己設定的 repo；惡意 repo 名稱（../、含斜線、空白）一律不連線',
    () => {
      let called = 0;
      const old = store.httpImpl;
      store.httpImpl = () => {
        called++;
        return { code: 200, body: '{}' };
      };
      ['../evil', 'a/b/c', 'me/vault site', '.hidden/x', 'me/..', ''].forEach(r => {
        store.cfg.GITHUB_REPO = r;
        H('syncSite', {}, OWNER, 'RUN', store);
      });
      store.cfg.GITHUB_REPO = gh.opts.repo;
      store.httpImpl = old;
      let blocked = false;
      try {
        store.http({ method: 'GET', url: 'https://evil.test/x', headers: {} });
      } catch (e) {
        blocked = true;
      }
      return { ok: called === 0 && blocked };
    }
  );
  check(
    'D 備份與同步',
    '備份檔只放在 Drive 內部資料夾；清單只回 drive.google.com 連結；訪客與陌生人（即使登入）無法取得',
    () => {
      H('backupRun', { fresh: true }, OWNER, 'RUN', store);
      const st = H('backupStatus', {}, OWNER, 'RUN', store);
      return (
        st.backups.length === 1 &&
        st.backups.every(b => b.url.indexOf('https://drive.google.com/file/d/') === 0) &&
        [VISITOR, OTHER].every(
          c =>
            H('backupStatus', {}, c, 'RUN', store).ok === false &&
            JSON.stringify(H('backupRun', { fresh: true }, c, 'RUN', store)).indexOf('Z') < 0
        )
      );
    }
  );
  check(
    'D 備份與同步',
    '備份內容與擁有者的 Vault 一致：包含私人筆記（備份是給自己的），但只存在 Drive，不會進 GitHub',
    () => {
      const f = store.listFolder('_backup').find(x => /\.zip$/.test(x.name));
      const list = JSON.parse(store.readText(f.fileId));
      const txt = list.map(x => x.text).join('\n');
      const inRepo = Object.values(gh.files()).join('\n');
      return txt.indexOf('SECRET-BODY') >= 0 && inRepo.indexOf('SECRET-BODY') < 0;
    }
  );
})();

/* ───── E 連結預覽（P6） ───── */
(function () {
  store.pages = {
    'https://example.com/ok': { code: 200, contentType: 'text/html', text: '<title>OK</title>' }
  };
  check(
    'E 連結預覽',
    '訪客、陌生人（即使登入）、REST GET（含擁有者）都不能呼叫 fetchPreview，而且不會發出任何連線',
    () => {
      store.fetched = [];
      const r = [
        [VISITOR, 'RUN'],
        [OTHER, 'RUN'],
        [OTHER, 'POST'],
        [OWNER, 'GET'],
        [VISITOR, 'GET']
      ].every(([c, m]) => H('fetchPreview', { url: 'https://example.com/ok' }, c, m, store).ok === false);
      return { ok: r && store.fetched.length === 0 };
    }
  );
  check(
    'E 連結預覽',
    '擁有者也無法用它連到內網或雲端中繼資料位址：http、IP（含十進位、IPv6）、localhost、內網名稱、連接埠、帳密一律拒絕且不發出連線',
    () => {
      store.fetched = [];
      const bad = [
        'http://example.com/ok',
        'https://169.254.169.254/latest/meta-data/',
        'https://metadata.google.internal/',
        'https://127.0.0.1/',
        'https://[::1]/',
        'https://2130706433/',
        'https://localhost/',
        'https://example.com:8080/',
        'https://u:p@example.com/',
        'file:///etc/passwd',
        'gopher://example.com',
        'https://example.com/\r\nHost: evil'
      ];
      const ok = bad.every(u => H('fetchPreview', { url: u }, OWNER, 'RUN', store).ok === false);
      return { ok: ok && store.fetched.length === 0 };
    }
  );
  check(
    'E 連結預覽',
    '網頁內容是不可信輸入：回傳只含純文字欄位；腳本、HTML 標籤只會被當文字；封面圖若不是 https 公開網址就丟棄',
    () => {
      store.pages['https://example.com/evil'] = {
        code: 200,
        contentType: 'text/html',
        text: '<title><img src=x onerror=alert(1)></title><meta property="og:description" content="&lt;script&gt;alert(1)&lt;/script&gt;"><meta property="og:image" content="javascript:alert(1)">'
      };
      const r = H('fetchPreview', { url: 'https://example.com/evil' }, OWNER, 'RUN', store);
      return {
        ok:
          r.ok &&
          Object.keys(r.preview).sort().join() === 'description,fetchedAt,image,site,title' &&
          r.preview.image === '' &&
          typeof r.preview.title === 'string'
      };
    }
  );
  check(
    'E 連結預覽',
    '預覽資料只存在畫布檔的 x-preview；訪客版畫布原樣帶出公開卡片的預覽，私人主題的畫布仍然完全取不到',
    () => {
      const b = {
        nodes: [
          {
            id: 'L',
            type: 'link',
            url: 'https://example.com/ok',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            'x-preview': { title: 'PV-PUBLIC' }
          }
        ],
        edges: []
      };
      const pb = {
        nodes: [
          {
            id: 'L',
            type: 'link',
            url: 'https://example.com/ok',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            'x-preview': { title: 'PV-PRIVATE-SECRET' }
          }
        ],
        edges: []
      };
      H('saveBoard', { topic: 'pub', board: b }, OWNER, 'RUN', store);
      H('saveBoard', { topic: 'priv', board: pb }, OWNER, 'RUN', store);
      const vp = JSON.stringify(H('getBoard', { topic: 'pub' }, VISITOR, 'GET', store)),
        vq = JSON.stringify(H('getBoard', { topic: 'priv' }, VISITOR, 'GET', store));
      return {
        ok:
          vp.indexOf('PV-PUBLIC') >= 0 && vq.indexOf('PV-PRIVATE-SECRET') < 0 && vq.indexOf('"ok":false') >= 0
      };
    }
  );
  check('E 連結預覽', '刪除畫布只限擁有者，且只動該主題的畫布檔（筆記與主題不受影響）', () => {
    const before = snap();
    const denied =
      [VISITOR, OTHER].every(c => H('deleteBoard', { topic: 'pub' }, c, 'RUN', store).ok === false) &&
      H('deleteBoard', { topic: 'pub' }, OWNER, 'GET', store).ok === false;
    const r = H('deleteBoard', { topic: 'pub' }, OWNER, 'RUN', store);
    return {
      ok:
        denied &&
        r.ok &&
        snap() === before &&
        !store.findFileByName('boards', 'pub.canvas.json') &&
        !!store.findFileByName('boards', 'priv.canvas.json')
    };
  });
})();

console.log(
  '\n安全自查：' +
    rows.filter(r => r.ok).length +
    ' / ' +
    rows.length +
    ' 項通過；惡意 SVG：' +
    CORPUS.length +
    ' 款（拒絕 ' +
    rejected +
    '、清除後存入 ' +
    sanitized +
    '）'
);
const md = [
  '# 安全自查報告（P4＋P5＋P6）',
  '',
  '由 `backend/tests/security_audit.test.js` 自動產生（離線假儲存層跑真實的 Core.gs／Svg.gs）。**結果：' +
    rows.filter(r => r.ok).length +
    ' / ' +
    rows.length +
    ' 通過。**',
  '',
  '範圍：A 匿名存取私人內容、B 上傳／寫入端點濫用、C 惡意 SVG、D 備份與 GitHub 同步（P5）、E 連結預覽與刪除畫布（P6）。未涵蓋：Google 帳號本身被盜、Apps Script 平台漏洞、真實 Drive 權限設定（需部署後依驗收文件手動確認）。',
  ''
];
['A 匿名存取', 'B 上傳端點', 'C 惡意 SVG', 'D 備份與同步', 'E 連結預覽'].forEach(a => {
  md.push('## ' + a, '', '| 結果 | 項目 | 說明 |', '|---|---|---|');
  rows
    .filter(r => r.area === a)
    .forEach(r =>
      md.push(
        '| ' +
          (r.ok ? '✅' : '❌') +
          ' | ' +
          r.name.replace(/\|/g, '\\|') +
          ' | ' +
          (r.note || '').replace(/\|/g, '\\|').replace(/\n/g, ' ') +
          ' |'
      )
    );
  md.push('');
});
fs.writeFileSync(path.join(__dirname, '..', '..', 'docs', 'SECURITY_AUDIT.md'), md.join('\n'));
process.exit(fails ? 1 : 0);
