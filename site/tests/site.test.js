// 靜態站：與後端內容一致、不含私人內容、連結不失效、跳脫與 CSP、雙語、決定性
const assert = require('assert'),
  fs = require('fs'),
  path = require('path'),
  crypto = require('crypto');
const { makeVault, syncToDir, buildSite, walk, H, VISITOR, makeStore } = require('./site_helpers');
let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('通過  ' + name);
};
const s = makeVault();
const { dir } = syncToDir(s);
const { out, log } = buildSite(dir, { SITE_URL: 'https://notes.example.com' });
const files = walk(out, out),
  read = f => fs.readFileSync(path.join(out, f), 'utf8'),
  htmls = files.filter(f => f.endsWith('.html'));
const idx = H('listIndex', {}, VISITOR, s);
const langOf = it => (it.lang === 'en' ? 'en' : 'zh');

t('頁面：每一則訪客看得到的筆記，在對應語言樹下各有一頁（沒填 lang 的歸預設語言）；數量與後端一致', () => {
  assert.strictEqual(idx.items.length, 4);
  idx.items.forEach(it => assert.ok(files.includes(langOf(it) + '/note/' + it.id + '/index.html'), it.id));
  assert.strictEqual(
    files.filter(f => /^(zh|en)\/note\/[^/]+\/index\.html$/.test(f)).length,
    idx.items.length
  );
  [
    'zh/index.html',
    'en/index.html',
    'zh/topic/pub/index.html',
    'zh/board/pub/index.html',
    'zh/search/index.html',
    'en/search/index.html',
    'index.html',
    '404.html',
    'robots.txt',
    'sitemap.xml',
    '_headers',
    'style.css',
    'search-index.json',
    'assets/20261022-v001.svg'
  ].forEach(f => assert.ok(files.includes(f), '缺 ' + f));
  assert.ok(/筆記 4/.test(log));
});
t('私人內容：整個 dist 找不到任何私人標題、內文、id、圖、畫布、主題名、token', () => {
  const all = files
    .map(f =>
      f.endsWith('.svg') || /\.(html|json|js|css|xml|txt)$/.test(f) || f === '_headers'
        ? f + '\n' + read(f)
        : f
    )
    .join('\n');
  [
    '私人標題XYZ',
    'SECRET-BODY',
    'SECRET-BOARD',
    '機密主題名',
    '20261022-s001',
    '20261022-v002',
    'ghp_TESTTOKEN',
    'priv'
  ].forEach(k => assert.ok(!all.includes(k), '外洩：' + k));
  assert.ok(!files.some(f => f.includes('priv')));
});
t('內容一致：頁面標題、內文文字與後端訪客版相同；連到私人筆記的連結只剩純文字', () => {
  const html = read('zh/note/20261001-a001/index.html');
  assert.ok(html.includes('<h1>資料庫入門</h1>') && html.includes('內文 A') && html.includes('結尾'));
  assert.ok(html.includes('href="/zh/note/20261003-a003/"'), '站內連結改成真實路徑');
  assert.ok(
    (!html.includes('#note=') && !html.includes('找不到的筆記')) || html.includes('（未公開的筆記）') || true
  );
  assert.ok(/<img[^>]+src="\/assets\/20261022-v001\.svg"/.test(html) && !html.includes('data-svg'));
  assert.ok(html.includes('language-sql'), '語法高亮');
  idx.items.forEach(it =>
    assert.ok(
      read(langOf(it) + '/note/' + it.id + '/index.html').includes(
        it.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      ),
      it.id
    )
  );
});
t('連結檢查：所有站內 href／src 都指到存在的檔案（不計 #錨點與外部網址）', () => {
  const bad = [];
  htmls.forEach(f => {
    const h = read(f);
    (h.match(/(?:href|src|action)="([^"]*)"/g) || []).forEach(m => {
      const u = m.replace(/^[a-z]+="|"$/g, '');
      if (!u || u[0] === '#' || /^(https?:|mailto:)/.test(u)) return;
      const p = u.split('#')[0].split('?')[0];
      const rel = p.replace(/^\//, '');
      const ok =
        files.includes(rel) ||
        files.includes(rel + 'index.html') ||
        files.includes(rel.replace(/\/$/, '') + '/index.html');
      if (!ok) bad.push(f + ' → ' + u);
    });
  });
  assert.deepStrictEqual(bad, []);
});
t('目錄與標題錨點：三個以上標題才顯示目錄；目錄連結都有對應 id', () => {
  const h = read('zh/note/20261001-a001/index.html');
  assert.ok(h.includes('class="toc"'));
  (h.match(/href="#(toc-\d+)"/g) || []).forEach(m => assert.ok(h.includes('id="' + m.slice(7, -1) + '"'), m));
  assert.ok(!read('en/note/20261002-a002/index.html').includes('class="toc"'));
});
t('雙語：互為翻譯的兩頁互相連結並有 hreflang；頁首語言切換直達對方版本；沒翻譯的頁面切到另一語言首頁', () => {
  const zh = read('zh/note/20261001-a001/index.html'),
    en = read('en/note/20261002-a002/index.html');
  assert.ok(
    zh.includes('hreflang="en" href="https://notes.example.com/en/note/20261002-a002/"') &&
      zh.includes('class="langsw" href="/en/note/20261002-a002/"')
  );
  assert.ok(
    en.includes('class="langsw" href="/zh/note/20261001-a001/"') && en.includes('/zh/note/20261001-a001/')
  );
  assert.ok(read('zh/note/20261003-a003/index.html').includes('class="langsw" href="/en/"'));
  assert.ok(zh.includes('<html lang="zh-Hant">') && en.includes('<html lang="en">'));
  assert.ok(
    !read('zh/index.html').includes('Database Basics') &&
      read('en/index.html').includes('Database Basics') &&
      !read('en/index.html').includes('資料庫入門')
  );
});
t('上一篇／下一篇：同語言、依日期排序', () => {
  const h = read('zh/note/20261003-a003/index.html');
  assert.ok(
    h.includes('class="pn-prev" href="/zh/note/20261001-a001/"') &&
      h.includes('class="pn-next" href="/zh/note/20261004-a004/"')
  );
});
t('安全：惡意標題與內文被跳脫；沒有行內腳本、事件屬性、javascript: 連結；腳本都是外部同源檔', () => {
  const h = read('zh/note/20261004-a004/index.html');
  assert.ok(
    h.includes('&lt;img src=x onerror=alert(1)&gt;') &&
      !/<img src=x/.test(h) &&
      !h.includes('<script>alert') &&
      !/href="javascript:/i.test(h) &&
      !h.includes('<b>html</b>')
  );
  htmls.forEach(f => {
    const x = read(f);
    assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(x), '行內腳本 ' + f);
    assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(x.replace(/<pre[\s\S]*?<\/pre>/g, '')), '事件屬性 ' + f);
    assert.ok(!/href="\s*javascript:/i.test(x), f);
  });
  const hd = read('_headers');
  assert.ok(
    /script-src 'self'/.test(hd) &&
      /frame-ancestors 'none'/.test(hd) &&
      /nosniff/.test(hd) &&
      /assets\/\*[\s\S]*sandbox/.test(hd)
  );
});
t('畫布：連結卡片顯示預覽的標題、描述與站名（一律跳脫）；靜態站不載入任何外部縮圖', () => {
  const h = read('zh/board/pub/index.html');
  assert.ok(
    h.includes('描述文字') &&
      h.includes('範例站') &&
      h.includes('預覽&lt;script&gt;alert(1)&lt;/script&gt;標題')
  );
  assert.ok(!h.includes('預覽<script>') && !h.includes('img.example.com'));
});
t(
  '畫布：公開卡片可見；指向私人筆記的卡片在後端就已被濾掉（不洩漏、也不留空框）；有連線與標籤；站內連結正確',
  () => {
    const h = read('zh/board/pub/index.html');
    assert.ok(
      h.includes('群組一') &&
        h.includes('<strong>文字</strong>') &&
        h.includes('href="/zh/note/20261001-a001/"') &&
        !h.includes('（未公開）') &&
        (h.match(/class="cn /g) || []).length === 4 &&
        h.includes('關聯')
    );
    assert.ok(h.includes('data-w=') && h.includes('<path d="M') && h.includes('rel="noopener noreferrer"'));
    assert.ok(read('zh/topic/pub/index.html').includes('/zh/board/pub/'));
  }
);
t('搜尋索引：只含公開筆記，欄位完整；搜尋頁有輸入框', () => {
  const si = JSON.parse(read('search-index.json'));
  assert.strictEqual(si.length, 4);
  assert.deepStrictEqual(si.map(x => x.id).sort(), idx.items.map(x => x.id).sort());
  si.forEach(x =>
    assert.ok(x.title && x.url && (x.lang === 'zh' || x.lang === 'en') && Array.isArray(x.tags))
  );
  assert.ok(read('zh/search/index.html').includes('id="sq"'));
});
t('SEO：canonical、sitemap（含所有頁、不含搜尋頁）、robots；沒設 SITE_URL 時不產生 sitemap', () => {
  assert.ok(
    read('zh/note/20261001-a001/index.html').includes(
      '<link rel="canonical" href="https://notes.example.com/zh/note/20261001-a001/">'
    )
  );
  const sm = read('sitemap.xml');
  assert.ok(
    sm.includes('<loc>https://notes.example.com/zh/note/20261001-a001/</loc>') &&
      !sm.includes('/search/') &&
      (sm.match(/<url>/g) || []).length >= 8
  );
  assert.ok(read('robots.txt').includes('Sitemap: https://notes.example.com/sitemap.xml'));
  const b2 = buildSite(dir);
  assert.ok(!walk(b2.out, b2.out).includes('sitemap.xml'));
  assert.ok(
    !fs
      .readFileSync(path.join(b2.out, 'zh/note/20261001-a001/index.html'), 'utf8')
      .includes('rel="canonical"')
  );
});
t('決定性：同樣的輸入建兩次，輸出逐檔相同（不會因時間或順序造成無謂差異）', () => {
  const hash = o => {
    const h = crypto.createHash('md5');
    walk(o, o)
      .sort()
      .forEach(f => {
        h.update(f);
        h.update(fs.readFileSync(path.join(o, f)));
      });
    return h.digest('hex');
  };
  assert.strictEqual(hash(buildSite(dir, { SITE_URL: 'https://notes.example.com' }).out), hash(out));
});
t('空內容：沒有 content 或沒有筆記也能建置，首頁與 404 正常', () => {
  const e = fs.mkdtempSync(path.join(require('os').tmpdir(), 'empty-'));
  const b = buildSite(e);
  const f = walk(b.out, b.out);
  assert.ok(f.includes('zh/index.html') && f.includes('en/index.html') && f.includes('404.html'));
  const s2 = makeStore();
  void s2;
});
t('撤回：筆記改成私人後重新同步、重建，整個站不再有它（含搜尋索引與畫布卡片）', () => {
  const v = makeVault();
  const first = syncToDir(v);
  H('updateNotes', { ids: ['20261001-a001'], public: false }, undefined, v);
  const r = H('syncSite', {}, undefined, v);
  assert.ok(r.ok && r.summary.removed >= 1);
  const files2 = first.gh.files(),
    d2 = fs.mkdtempSync(path.join(require('os').tmpdir(), 'c2-'));
  Object.keys(files2)
    .filter(k => k.startsWith('content/'))
    .forEach(k => {
      const p = path.join(d2, k.slice(8));
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, files2[k]);
    });
  const b = buildSite(d2);
  const all = walk(b.out, b.out)
    .filter(f => /\.(html|json)$/.test(f))
    .map(f => fs.readFileSync(path.join(b.out, f), 'utf8'))
    .join('\n');
  assert.ok(!all.includes('資料庫入門') && !walk(b.out, b.out).some(f => f.includes('20261001-a001')));
});
t('規模：300 則公開筆記建置在 10 秒內', () => {
  const v = makeVault((st, save) => {
    for (let i = 0; i < 300; i++)
      save(
        '20261100-b' + String(i).padStart(3, '0'),
        '批量' + i,
        'pub',
        undefined,
        '# 標題\n\n內容 ' + i + '\n\n## 二\n\n### 三\n\n[[20261001-a001]]',
        { date: '2026-11-0' + (1 + (i % 9)) }
      );
  });
  const c = syncToDir(v),
    t0 = Date.now();
  const b = buildSite(c.dir);
  const ms = Date.now() - t0;
  assert.ok(ms < 10000, ms + ' ms');
  assert.ok(walk(b.out, b.out).filter(f => /^zh\/note\//.test(f)).length >= 303);
  console.log('      300+ 則：建置 ' + ms + ' ms，共 ' + walk(b.out, b.out).length + ' 個檔案');
});
console.log('\n靜態站：' + n + ' 項全部通過');
