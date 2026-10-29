/**
 * build.js — 讀書筆記 Vault 靜態站產生器（零相依）
 *
 * 輸入：content/（由 Apps Script 同步進來，內容就是「訪客看得到的」公開內容）
 *   index.json、notes/<id>.json、assets/<id>.svg、boards/<topic>.json、site-meta.json
 * 輸出：dist/
 *   /zh/ 與 /en/ 兩棵樹（首頁、主題、筆記、畫布、搜尋）、/assets/*.svg、search-index.json、
 *   sitemap.xml（需環境變數 SITE_URL）、robots.txt、_headers（嚴格 CSP）、404.html
 *
 * 環境變數：CONTENT_DIR（預設 content）、OUT_DIR（預設 dist）、SITE_URL（可選，例如 https://notes.example.com）
 * 規則：沒填 lang 的筆記視為預設語言（site.config.json 的 defaultLang）；內容一律跳脫；頁面不含行內腳本。
 */
'use strict';
const fs = require('fs'),
  path = require('path');
const L = require('./lib/logic.js');
const markdownit = require('./lib/markdown-it.min.js');

const ROOT = __dirname;
const CONTENT = path.resolve(process.env.CONTENT_DIR || path.join(ROOT, 'content'));
const OUT = path.resolve(process.env.OUT_DIR || path.join(ROOT, 'dist'));
const SITE_URL = String(process.env.SITE_URL || '').replace(/\/+$/, '');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const LANGS = ['zh', 'en'];
const UI = {
  zh: {
    home: '首頁',
    topics: '主題',
    latest: '最新筆記',
    toc: '目錄',
    prev: '上一篇',
    next: '下一篇',
    other: '其他語言版本',
    search: '搜尋',
    searchPh: '搜尋標題、標籤、主題',
    canvas: '畫布',
    notFound: '找不到這個頁面',
    back: '回到首頁',
    tags: '標籤',
    date: '日期',
    empty: '目前沒有內容。',
    results: '筆 結果',
    noResult: '沒有符合的筆記。',
    private: '（未公開）',
    fit: '符合視窗',
    zoomIn: '放大',
    zoomOut: '縮小',
    lang: 'English',
    skip: '跳到內文',
    board: '畫布（唯讀，可拖曳平移、縮放）',
    untitled: '未命名'
  },
  en: {
    home: 'Home',
    topics: 'Topics',
    latest: 'Latest notes',
    toc: 'Contents',
    prev: 'Previous',
    next: 'Next',
    other: 'Other languages',
    search: 'Search',
    searchPh: 'Search titles, tags, topics',
    canvas: 'Canvas',
    notFound: 'Page not found',
    back: 'Back to home',
    tags: 'Tags',
    date: 'Date',
    empty: 'Nothing here yet.',
    results: 'results',
    noResult: 'No matching notes.',
    private: '(not public)',
    fit: 'Fit',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    lang: '中文',
    skip: 'Skip to content',
    board: 'Canvas (read-only; drag to pan, scroll to zoom)',
    untitled: 'Untitled'
  }
};

const esc = s =>
  String(s == null ? '' : s).replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const ensure = p => fs.mkdirSync(p, { recursive: true });
const write = (rel, text) => {
  const p = path.join(OUT, rel);
  ensure(path.dirname(p));
  fs.writeFileSync(p, text);
};
const langOf = it => {
  const l = L.shortLang(it.lang);
  return l || CFG.defaultLang;
};
const notePath = (lang, id) => '/' + lang + '/note/' + id + '/';
const topicPath = (lang, id) => '/' + lang + '/topic/' + id + '/';
const boardPath = (lang, id) => '/' + lang + '/board/' + id + '/';
const plain = md =>
  String(md)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const byDate = (a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (a.id < b.id ? 1 : -1);

function load() {
  if (!fs.existsSync(path.join(CONTENT, 'index.json')))
    return { items: [], topics: [], notes: {}, boards: {}, svgs: [] };
  const idx = readJson(path.join(CONTENT, 'index.json'));
  const notes = {},
    boards = {},
    svgs = [];
  idx.items.forEach(it => {
    const p = path.join(CONTENT, 'notes', it.id + '.json');
    if (fs.existsSync(p)) notes[it.id] = readJson(p);
  });
  idx.topics.forEach(t => {
    const p = path.join(CONTENT, 'boards', t.id + '.json');
    if (fs.existsSync(p)) boards[t.id] = readJson(p);
  });
  const ad = path.join(CONTENT, 'assets');
  if (fs.existsSync(ad))
    fs.readdirSync(ad)
      .filter(f => /^\d{8}-[a-z0-9]{2,8}\.svg$/.test(f))
      .forEach(f => svgs.push(f.slice(0, -4)));
  return { items: idx.items.filter(it => notes[it.id]), topics: idx.topics, notes, boards, svgs };
}

/* ───── 版型 ───── */
function layout(o) {
  // o: { lang, title, desc, body, canonical, alternates:[{lang,url}], active }
  const u = UI[o.lang],
    name = CFG.siteName[o.lang];
  const other = o.lang === 'zh' ? 'en' : 'zh';
  const alt = (o.alternates || []).find(a => a.lang === other);
  const switchHref = alt ? alt.url : '/' + other + '/';
  const links = (o.alternates || [])
    .concat([{ lang: o.lang, url: o.canonical }])
    .filter(a => a.url)
    .map(
      a =>
        '<link rel="alternate" hreflang="' +
        (CFG.htmlLang[a.lang] || a.lang) +
        '" href="' +
        esc((SITE_URL || '') + a.url) +
        '">'
    )
    .join('\n');
  return (
    '<!doctype html>\n<html lang="' +
    CFG.htmlLang[o.lang] +
    '">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' +
    esc(o.title ? o.title + ' · ' + name : name) +
    '</title>\n<meta name="description" content="' +
    esc(o.desc || CFG.tagline[o.lang]) +
    '">\n' +
    (SITE_URL && o.canonical ? '<link rel="canonical" href="' + esc(SITE_URL + o.canonical) + '">\n' : '') +
    links +
    '\n' +
    '<meta property="og:title" content="' +
    esc(o.title || name) +
    '">\n<meta property="og:type" content="article">\n<link rel="stylesheet" href="/style.css">\n<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n</head>\n<body>\n' +
    '<a class="skip" href="#main">' +
    esc(u.skip) +
    '</a>\n<header class="bar"><a class="brand" href="/' +
    o.lang +
    '/">' +
    esc(name) +
    '</a>' +
    '<form class="sform" action="/' +
    o.lang +
    '/search/" method="get" role="search"><input type="search" name="q" placeholder="' +
    esc(u.searchPh) +
    '" aria-label="' +
    esc(u.search) +
    '"></form>' +
    '<a class="langsw" href="' +
    esc(switchHref) +
    '" hreflang="' +
    CFG.htmlLang[other] +
    '" lang="' +
    CFG.htmlLang[other] +
    '">' +
    esc(u.lang) +
    '</a></header>\n' +
    '<main id="main">\n' +
    o.body +
    '\n</main>\n<footer class="foot">' +
    esc(name) +
    '</footer>\n' +
    (o.scripts || '') +
    '</body>\n</html>\n'
  );
}

function noteList(items, lang, topicsById, showTopic) {
  if (!items.length) return '<p class="empty">' + esc(UI[lang].empty) + '</p>';
  return (
    '<ul class="list">' +
    items
      .map(
        it =>
          '<li><a class="item" href="' +
          notePath(lang, it.id) +
          '"><span class="t">' +
          esc(it.title) +
          '</span><span class="m">' +
          esc(it.date || '') +
          (showTopic && topicsById[it.topic] ? ' · ' + esc(topicsById[it.topic].title) : '') +
          '</span></a></li>'
      )
      .join('') +
    '</ul>'
  );
}

/* ───── 主程式 ───── */
function build() {
  const data = load(),
    md = L.makeMarkdown(markdownit);
  fs.rmSync(OUT, { recursive: true, force: true });
  ensure(OUT);
  const topicsById = {};
  data.topics.forEach(t => {
    topicsById[t.id] = t;
  });
  const byId = {};
  data.items.forEach(it => {
    byId[it.id] = it;
  });
  const stats = { notes: 0, topics: 0, boards: 0, pages: 0, assets: 0 };
  const searchIdx = [],
    urls = [];
  const addPage = (rel, html, url, lastmod) => {
    write(rel, html);
    stats.pages++;
    if (url) urls.push({ url, lastmod });
  };

  data.svgs.forEach(id => {
    write('assets/' + id + '.svg', fs.readFileSync(path.join(CONTENT, 'assets', id + '.svg'), 'utf8'));
    stats.assets++;
  });
  write('style.css', CSS);
  write(
    'favicon.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#2f5d62"/><path d="M9 8h10a4 4 0 0 1 4 4v12H13a4 4 0 0 1-4-4z" fill="none" stroke="#fff" stroke-width="2"/></svg>'
  );
  write('site.js', JS_SITE);
  write('search.js', JS_SEARCH);
  write('board.js', JS_BOARD);
  write('redirect.js', JS_REDIRECT);

  LANGS.forEach(lang => {
    const u = UI[lang],
      mine = data.items.filter(it => langOf(it) === lang).sort(byDate);
    const myTopics = data.topics.filter(
      t => mine.some(it => it.topic === t.id) || (data.boards[t.id] && lang === CFG.defaultLang)
    );
    const nTopic = {};
    mine.forEach(it => {
      nTopic[it.topic] = (nTopic[it.topic] || 0) + 1;
    });

    // 首頁
    let body = '<h1>' + esc(CFG.siteName[lang]) + '</h1><p class="sub">' + esc(CFG.tagline[lang]) + '</p>';
    if (myTopics.length)
      body +=
        '<h2>' +
        esc(u.topics) +
        '</h2><ul class="pills">' +
        myTopics
          .map(
            t =>
              '<li><a class="pill" href="' +
              topicPath(lang, t.id) +
              '">' +
              esc(t.title) +
              ' <span class="n">' +
              (nTopic[t.id] || 0) +
              '</span></a></li>'
          )
          .join('') +
        '</ul>';
    body += '<h2>' + esc(u.latest) + '</h2>' + noteList(mine.slice(0, 30), lang, topicsById, true);
    addPage(
      lang + '/index.html',
      layout({
        lang,
        title: '',
        body,
        canonical: '/' + lang + '/',
        alternates: [{ lang: lang === 'zh' ? 'en' : 'zh', url: '/' + (lang === 'zh' ? 'en' : 'zh') + '/' }]
      }),
      '/' + lang + '/'
    );

    // 主題
    myTopics.forEach(t => {
      const list = mine.filter(it => it.topic === t.id);
      stats.topics++;
      let b =
        '<p class="crumb"><a href="/' + lang + '/">' + esc(u.home) + '</a></p><h1>' + esc(t.title) + '</h1>';
      if (data.boards[t.id])
        b += '<p><a class="tbtn" href="' + boardPath(lang, t.id) + '">' + esc(u.canvas) + '</a></p>';
      b += noteList(list, lang, topicsById, false);
      addPage(
        topicPath(lang, t.id).slice(1) + 'index.html',
        layout({ lang, title: t.title, body: b, canonical: topicPath(lang, t.id) }),
        topicPath(lang, t.id)
      );
    });

    // 搜尋頁
    addPage(
      lang + '/search/index.html',
      layout({
        lang,
        title: u.search,
        canonical: '/' + lang + '/search/',
        scripts: '<script src="/search.js" defer></script>\n',
        body:
          '<h1>' +
          esc(u.search) +
          '</h1><form class="sform big" action="" method="get" role="search"><input id="sq" type="search" name="q" placeholder="' +
          esc(u.searchPh) +
          '" aria-label="' +
          esc(u.search) +
          '" autofocus></form><p id="sinfo" class="sub" role="status" data-lang="' +
          lang +
          '" data-none="' +
          esc(u.noResult) +
          '" data-unit="' +
          esc(u.results) +
          '"></p><ul class="list" id="sres"></ul><noscript><p>' +
          esc(u.search) +
          ' needs JavaScript.</p></noscript>'
      }),
      null
    );

    // 筆記
    mine.forEach(it => {
      const n = data.notes[it.id],
        env = { toc: [] };
      let html = md.render(L.rewriteInternalLinks(n.body || '', byId), env);
      html = html
        .replace(/<img([^>]*?) data-svg="(\d{8}-[a-z0-9]{2,8})"([^>]*?)>/g, (m, a, id, b) =>
          data.svgs.includes(id)
            ? '<img' + a + ' src="/assets/' + id + '.svg"' + b + ' loading="lazy">'
            : '<span class="img-missing">' + esc((/alt="([^"]*)"/.exec(m) || [])[1] || '') + '</span>'
        )
        .replace(/<a ([^>]*?)href="#note=(\d{8}-[a-z0-9]{2,8})"([^>]*)>/g, (m, a, id, b) => {
          const t = byId[id];
          return '<a ' + a + 'href="' + (t ? notePath(langOf(t), id) : '#') + '"' + b + '>';
        });
      const heads = env.toc.filter(h => h.level <= 3);
      const toc =
        heads.length >= 3
          ? '<nav class="toc" aria-label="' +
            esc(u.toc) +
            '"><strong>' +
            esc(u.toc) +
            '</strong><ul>' +
            heads
              .map(
                h => '<li class="l' + h.level + '"><a href="#' + esc(h.id) + '">' + esc(h.text) + '</a></li>'
              )
              .join('') +
            '</ul></nav>'
          : '';
      const trs = L.translations(data.items, it.id),
        nb = L.neighbors(mine, it.id, '');
      let b =
        '<p class="crumb"><a href="/' +
        lang +
        '/">' +
        esc(u.home) +
        '</a>' +
        (topicsById[it.topic] && myTopics.includes(topicsById[it.topic])
          ? ' / <a href="' + topicPath(lang, it.topic) + '">' + esc(topicsById[it.topic].title) + '</a>'
          : '') +
        '</p>';
      b +=
        '<article class="note"><h1>' +
        esc(it.title) +
        '</h1><p class="meta">' +
        esc(it.date || '') +
        ((it.tags || []).length ? ' · ' + esc(u.tags) + '：' + it.tags.map(esc).join('、') : '') +
        '</p>';
      if (trs.length)
        b +=
          '<p class="trans">' +
          esc(u.other) +
          '：' +
          trs
            .map(
              x =>
                '<a href="' +
                notePath(langOf(x), x.id) +
                '" hreflang="' +
                CFG.htmlLang[langOf(x)] +
                '">' +
                esc(x.title) +
                '</a>'
            )
            .join(' · ') +
          '</p>';
      b += toc + '<div class="md">' + html + '</div></article>';
      b +=
        '<nav class="pn" aria-label="' +
        esc(u.prev + ' / ' + u.next) +
        '">' +
        (nb.prev
          ? '<a class="pn-prev" href="' +
            notePath(lang, nb.prev.id) +
            '"><small>← ' +
            esc(u.prev) +
            '</small><span>' +
            esc(nb.prev.title) +
            '</span></a>'
          : '<span></span>') +
        (nb.next
          ? '<a class="pn-next" href="' +
            notePath(lang, nb.next.id) +
            '"><small>' +
            esc(u.next) +
            ' →</small><span>' +
            esc(nb.next.title) +
            '</span></a>'
          : '<span></span>') +
        '</nav>';
      const alternates = trs
        .map(x => ({ lang: langOf(x), url: notePath(langOf(x), x.id) }))
        .filter(a => a.lang !== lang);
      addPage(
        notePath(lang, it.id).slice(1) + 'index.html',
        layout({
          lang,
          title: it.title,
          desc: plain(n.body || '').slice(0, 140),
          body: b,
          canonical: notePath(lang, it.id),
          alternates
        }),
        notePath(lang, it.id),
        n.meta && n.meta.updatedAt
      );
      stats.notes++;
      searchIdx.push({
        id: it.id,
        lang,
        title: it.title,
        topic: (topicsById[it.topic] || {}).title || '',
        tags: it.tags || [],
        date: it.date || '',
        url: notePath(lang, it.id),
        ex: plain(n.body || '').slice(0, 160)
      });
    });

    // 畫布：每個語言樹都有（內容相同，只有介面文字不同），主題頁與畫布頁的連結才不會失效
    myTopics.forEach(t => {
      if (!data.boards[t.id]) return;
      addPage(
        boardPath(lang, t.id).slice(1) + 'index.html',
        layout({
          lang,
          title: t.title + ' · ' + u.canvas,
          canonical: boardPath(lang, t.id),
          scripts: '<script src="/board.js" defer></script>\n',
          body: boardHtml(data.boards[t.id], t, lang, byId, md, data.svgs)
        }),
        boardPath(lang, t.id)
      );
      stats.boards++;
    });
  });

  write('search-index.json', JSON.stringify(searchIdx));
  write(
    'index.html',
    '<!doctype html>\n<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' +
      esc(CFG.siteName[CFG.defaultLang]) +
      '</title><link rel="stylesheet" href="/style.css"><noscript><meta http-equiv="refresh" content="0; url=/' +
      CFG.defaultLang +
      '/"></noscript></head><body><main><h1>' +
      esc(CFG.siteName[CFG.defaultLang]) +
      '</h1><p><a href="/zh/">中文</a> · <a href="/en/">English</a></p></main><script src="/redirect.js" data-default="' +
      CFG.defaultLang +
      '"></script></body></html>\n'
  );
  write(
    '404.html',
    layout({
      lang: CFG.defaultLang,
      title: UI[CFG.defaultLang].notFound,
      body:
        '<h1>' +
        esc(UI.zh.notFound) +
        ' / ' +
        esc(UI.en.notFound) +
        '</h1><p><a href="/zh/">' +
        esc(UI.zh.back) +
        '</a> · <a href="/en/">' +
        esc(UI.en.back) +
        '</a></p>'
    })
  );
  write(
    'robots.txt',
    'User-agent: *\nAllow: /\n' + (SITE_URL ? 'Sitemap: ' + SITE_URL + '/sitemap.xml\n' : '')
  );
  if (SITE_URL)
    write(
      'sitemap.xml',
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls
          .map(
            x =>
              '<url><loc>' +
              esc(SITE_URL + x.url) +
              '</loc>' +
              (x.lastmod ? '<lastmod>' + esc(String(x.lastmod).slice(0, 10)) + '</lastmod>' : '') +
              '</url>'
          )
          .join('\n') +
        '\n</urlset>\n'
    );
  write(
    '_headers',
    "/*\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n/assets/*\n  Content-Type: image/svg+xml\n  Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox\n"
  );
  return stats;
}

/* ───── 畫布（唯讀、靜態）───── */
function boardHtml(board, topic, lang, byId, md, svgs) {
  const u = UI[lang],
    nodes = (board.nodes || []).filter(n => n && typeof n.x === 'number' && typeof n.y === 'number');
  const by = {};
  nodes.forEach(n => {
    by[n.id] = n;
  });
  const b = L.bounds ? L.bounds(nodes) : null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  nodes.forEach(n => {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  });
  if (!nodes.length) {
    minX = minY = 0;
    maxX = maxY = 100;
  }
  void b;
  const col = c => (/^[1-6]$/.test(String(c)) ? ' c' + c : '');
  const hex = c => (/^#[0-9a-fA-F]{6}$/.test(String(c)) ? ';--nc:' + c : '');
  const anchor = (n, side) =>
    ({
      top: [n.x + n.width / 2, n.y],
      bottom: [n.x + n.width / 2, n.y + n.height],
      left: [n.x, n.y + n.height / 2],
      right: [n.x + n.width, n.y + n.height / 2]
    })[side] || [n.x + n.width / 2, n.y + n.height / 2];
  const edges = (board.edges || [])
    .map(e => {
      const a = by[e.fromNode],
        c = by[e.toNode];
      if (!a || !c) return '';
      const p = anchor(a, e.fromSide || (c.x > a.x + a.width ? 'right' : 'left')),
        q = anchor(c, e.toSide || (c.x > a.x + a.width ? 'left' : 'right'));
      const dx = Math.max(40, Math.abs(q[0] - p[0]) / 2) * (q[0] >= p[0] ? 1 : -1);
      return (
        '<path d="M' +
        p[0] +
        ' ' +
        p[1] +
        ' C' +
        (p[0] + dx) +
        ' ' +
        p[1] +
        ' ' +
        (q[0] - dx) +
        ' ' +
        q[1] +
        ' ' +
        q[0] +
        ' ' +
        q[1] +
        '" class="edge' +
        col(e.color) +
        '" fill="none"' +
        (e.toEnd === 'none' ? '' : ' marker-end="url(#ah)"') +
        '/>' +
        (e.label
          ? '<text x="' +
            (p[0] + q[0]) / 2 +
            '" y="' +
            ((p[1] + q[1]) / 2 - 6) +
            '" class="elabel" text-anchor="middle">' +
            esc(e.label) +
            '</text>'
          : '')
      );
    })
    .join('');
  const cards = nodes
    .slice()
    .sort((a, b2) => (a.type === 'group' ? 0 : 1) - (b2.type === 'group' ? 0 : 1))
    .map(n => {
      let inner = '';
      if (n.type === 'group') inner = '<div class="glabel">' + esc(n.label || '') + '</div>';
      else if (n.type === 'text')
        inner =
          '<div class="cbody md">' +
          md.render(
            String(n.text || '').replace(
              /!\[([^\]]*)\]\(assets\/(\d{8}-[a-z0-9]{2,8})\.svg\)/g,
              (m, a, id) => (svgs.includes(id) ? '![' + a + '](/assets/' + id + '.svg)' : esc(a))
            )
          ) +
          '</div>';
      else if (n.type === 'file') {
        const m = /^notes\/(\d{8}-[a-z0-9]{2,8})\.md$/.exec(n.file || ''),
          s = /^assets\/(\d{8}-[a-z0-9]{2,8})\.svg$/.exec(n.file || ''),
          it = m && byId[m[1]];
        if (it)
          inner =
            '<div class="chead"><a href="' +
            notePath(L.shortLang(it.lang) || CFG.defaultLang, it.id) +
            '">' +
            esc(it.title) +
            '</a></div>';
        else if (s && svgs.includes(s[1]))
          inner = '<img src="/assets/' + s[1] + '.svg" alt="" loading="lazy">';
        else inner = '<div class="chead muted">' + esc(u.private) + '</div>';
      } else if (n.type === 'link') {
        const ok = /^https?:\/\//i.test(String(n.url || ''));
        const pvc = (v, k) =>
          typeof v === 'string'
            ? v
                .replace(/[\u0000-\u001f\u007f]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, k)
            : '';
        const pv0 =
          n['x-preview'] && typeof n['x-preview'] === 'object' && !Array.isArray(n['x-preview'])
            ? n['x-preview']
            : null;
        const pv = pv0
          ? { title: pvc(pv0.title, 120), description: pvc(pv0.description, 240), site: pvc(pv0.site, 60) }
          : null; // 靜態站不載外部縮圖，只顯示文字預覽
        const host = (/^https?:\/\/([^\/?#]+)/i.exec(String(n.url || '')) || [])[1] || '';
        inner =
          '<div class="chead">' +
          (ok
            ? '<a href="' +
              esc(n.url) +
              '" target="_blank" rel="noopener noreferrer">' +
              esc(pv && pv.title ? pv.title : n.url) +
              '</a>'
            : esc(n.url || '')) +
          '</div>' +
          (pv && (pv.description || pv.site)
            ? '<div class="cbody cpv">' +
              (pv.description ? '<p>' + esc(pv.description) + '</p>' : '') +
              '<small>' +
              esc(pv.site || host) +
              '</small></div>'
            : '');
      }
      return (
        '<div class="cn t-' +
        esc(n.type) +
        col(n.color) +
        '" style="left:' +
        n.x +
        'px;top:' +
        n.y +
        'px;width:' +
        n.width +
        'px;height:' +
        n.height +
        'px' +
        hex(n.color) +
        '">' +
        inner +
        '</div>'
      );
    })
    .join('');
  const W = maxX - minX,
    Hh = maxY - minY;
  return (
    '<p class="crumb"><a href="/' +
    lang +
    '/">' +
    esc(u.home) +
    '</a> / <a href="' +
    topicPath(lang, topic.id) +
    '">' +
    esc(topic.title) +
    '</a></p><h1>' +
    esc(topic.title) +
    ' · ' +
    esc(u.canvas) +
    '</h1><p class="sub">' +
    esc(u.board) +
    '</p>' +
    '<div class="bbar"><button type="button" id="bz-out" aria-label="' +
    esc(u.zoomOut) +
    '">−</button><button type="button" id="bz-in" aria-label="' +
    esc(u.zoomIn) +
    '">＋</button><button type="button" id="bz-fit">' +
    esc(u.fit) +
    '</button></div>' +
    '<div class="board" id="board" data-x="' +
    minX +
    '" data-y="' +
    minY +
    '" data-w="' +
    W +
    '" data-h="' +
    Hh +
    '" tabindex="0"><div class="world" id="world" style="left:' +
    -minX +
    'px;top:' +
    -minY +
    'px"><svg class="edges" width="' +
    (maxX + 400) +
    '" height="' +
    (maxY + 400) +
    '" viewBox="0 0 ' +
    (maxX + 400) +
    ' ' +
    (maxY + 400) +
    '"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="ahead"/></marker></defs>' +
    edges +
    '</svg>' +
    cards +
    '</div></div>'
  );
}

/* ───── 靜態資源 ───── */
const CSS = `:root{--bg:#faf8f3;--panel:#f1ede3;--fg:#1f1d1a;--mute:#6a665d;--line:#ddd7c8;--accent:#2f5d62;--on:#fff;--tk-k:#7a3e9d;--tk-s:#1f6b3a;--tk-c:#5f5b52;--tk-n:#a0390f;--tk-f:#1f5fa8;--tk-t:#8a4b12;--tk-a:#2f5d62;--tk-v:#9b2d6b;--c1:#b83a30;--c2:#a85d10;--c3:#7d6500;--c4:#2e7d46;--c5:#1f7488;--c6:#6a49b8}
@media (prefers-color-scheme:dark){:root{--bg:#171815;--panel:#1f201c;--fg:#e9e6dc;--mute:#a09c90;--line:#34352f;--accent:#7fb7b0;--on:#10110f;--tk-k:#c9a0e8;--tk-s:#8fd19e;--tk-c:#a09c90;--tk-n:#f0a37a;--tk-f:#8ab8f0;--tk-t:#e0b36a;--tk-a:#7fb7b0;--tk-v:#e69ac4;--c1:#f27d73;--c2:#e89a4a;--c3:#d9b83a;--c4:#5fbf7c;--c5:#4fb5cc;--c6:#b09cf0}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.8 "Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif}
a{color:var(--accent)}:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.skip{position:absolute;left:-999px}.skip:focus{left:.5rem;top:.5rem;background:var(--panel);padding:.3rem .6rem;z-index:10}
.bar{position:sticky;top:0;z-index:5;display:flex;gap:.75rem;align-items:center;padding:.6rem 1rem;background:var(--bg);border-bottom:1px solid var(--line)}.brand{font-weight:700;letter-spacing:.04em;text-decoration:none;color:var(--fg);white-space:nowrap}
.sform{flex:1;min-width:0}.sform input{width:100%;min-height:40px;padding:.2rem .7rem;font:inherit;color:var(--fg);background:var(--panel);border:1px solid var(--line);border-radius:8px}.sform.big{max-width:36rem}
.langsw{min-height:40px;display:inline-flex;align-items:center;padding:0 .8rem;border:1px solid var(--accent);border-radius:8px;text-decoration:none}
main{max-width:44rem;margin:0 auto;padding:1.2rem 1rem 3rem}.foot{max-width:44rem;margin:0 auto;padding:1rem;color:var(--mute);font-size:.85rem;border-top:1px solid var(--line)}
h1{font-size:1.7rem;line-height:1.35;margin:.4rem 0}h2{font-size:1.2rem;margin:1.8rem 0 .5rem}.sub,.meta,.crumb,.trans{color:var(--mute);font-size:.9rem}.crumb{margin:0}
.list{list-style:none;margin:.5rem 0;padding:0}.item{display:flex;justify-content:space-between;gap:1rem;padding:.6rem .2rem;border-bottom:1px solid var(--line);text-decoration:none;color:var(--fg)}.item:hover .t{color:var(--accent)}.item .m{color:var(--mute);font-size:.85rem;white-space:nowrap}
.pills{list-style:none;display:flex;flex-wrap:wrap;gap:.5rem;padding:0}.pill{display:inline-block;padding:.25rem .8rem;border:1px solid var(--line);border-radius:999px;text-decoration:none;color:var(--fg);background:var(--panel)}.pill .n{color:var(--mute);font-size:.8rem}
.tbtn{display:inline-block;padding:.3rem 1rem;border:1px solid var(--accent);border-radius:8px;text-decoration:none}
.md{line-height:1.95;font-size:1.05rem}.md h1,.md h2,.md h3{margin-top:2em;line-height:1.35}.md p{margin:1.05em 0}.md img{max-width:100%;height:auto}.md img.svg-img{max-height:70vh}.md blockquote{margin:1em 0;padding:.1rem 1rem;border-left:3px solid var(--line);color:var(--mute)}
.md pre{overflow:auto;padding:.8rem 1rem;background:var(--panel);border:1px solid var(--line);border-radius:8px;line-height:1.55;font-size:.9rem}.md code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.92em}.md table{display:block;max-width:100%;overflow-x:auto;border-collapse:collapse}.md th,.md td{padding:.35rem .7rem;border:1px solid var(--line)}
.tk-k{color:var(--tk-k)}.tk-s{color:var(--tk-s)}.tk-c{color:var(--tk-c);font-style:italic}.tk-n{color:var(--tk-n)}.tk-f{color:var(--tk-f)}.tk-t{color:var(--tk-t)}.tk-a{color:var(--tk-a)}.tk-v{color:var(--tk-v)}
.toc{margin:1rem 0;padding:.6rem 1rem;background:var(--panel);border:1px solid var(--line);border-radius:10px;font-size:.92rem}.toc ul{list-style:none;margin:.3rem 0 0;padding:0}.toc .l2{padding-left:1rem}.toc .l3{padding-left:2rem}
.pn{display:flex;justify-content:space-between;gap:1rem;margin:2rem 0}.pn a{flex:1;max-width:49%;display:flex;flex-direction:column;padding:.5rem .8rem;background:var(--panel);border:1px solid var(--line);border-radius:10px;text-decoration:none;color:var(--fg)}.pn a:hover{border-color:var(--accent)}.pn .pn-next{text-align:right;margin-left:auto}.pn small{color:var(--mute)}
.empty{color:var(--mute)}.muted{color:var(--mute)}.img-missing{color:var(--mute)}
.bbar{display:flex;gap:.4rem;margin:.5rem 0}.bbar button{min-height:40px;min-width:40px;padding:0 .8rem;font:inherit;color:var(--accent);background:transparent;border:1px solid var(--accent);border-radius:8px;cursor:pointer}
.board{position:relative;height:70vh;min-height:360px;overflow:hidden;background:var(--panel);border:1px solid var(--line);border-radius:10px;touch-action:none;cursor:grab}.world{position:absolute;transform-origin:0 0}.edges{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.edge{stroke:var(--mute);stroke-width:2}.ahead{fill:var(--mute)}.elabel{fill:var(--mute);font-size:13px}.edge.c1{stroke:var(--c1)}.edge.c2{stroke:var(--c2)}.edge.c3{stroke:var(--c3)}.edge.c4{stroke:var(--c4)}.edge.c5{stroke:var(--c5)}.edge.c6{stroke:var(--c6)}
.cn{position:absolute;overflow:hidden;border:2px solid var(--nc,var(--line));border-radius:10px;background:var(--bg);font-size:15px;line-height:1.55}.cn.t-group{background:transparent;border-style:dashed}.cn.c1{--nc:var(--c1)}.cn.c2{--nc:var(--c2)}.cn.c3{--nc:var(--c3)}.cn.c4{--nc:var(--c4)}.cn.c5{--nc:var(--c5)}.cn.c6{--nc:var(--c6)}
.cbody{padding:.4rem .7rem;font-size:15px}.cbody>*:first-child{margin-top:0}.chead{padding:.5rem .7rem;font-weight:600;word-break:break-all}.cpv p{margin:.2rem 0;color:var(--mute);font-size:.9em;line-height:1.5}.cpv small{color:var(--mute)}.glabel{padding:.2rem .6rem;color:var(--mute);font-size:.85rem}.cn img{max-width:100%;max-height:100%}
@media (max-width:640px){main{padding:1rem .75rem 3rem}.item{flex-direction:column;gap:0}.pn{flex-direction:column}.pn a{max-width:none}}`;
const JS_REDIRECT = `(function(){var d=document.currentScript.getAttribute('data-default')||'zh',l=(navigator.languages||[navigator.language||'']).map(function(x){return String(x).toLowerCase()});var z=l.some(function(x){return x.indexOf('zh')===0}),e=l.some(function(x){return x.indexOf('en')===0});var t=z&&!e?'zh':(e&&!z?'en':(z?'zh':d));location.replace('/'+t+'/');})();`;
const JS_SITE = `/* reserved */`;
const JS_SEARCH = `(function(){var q=document.getElementById('sq'),res=document.getElementById('sres'),info=document.getElementById('sinfo');if(!q)return;var lang=info.getAttribute('data-lang'),data=null;
function norm(s){return String(s||'').toLowerCase()}
function run(){var v=norm(q.value).trim();res.textContent='';if(!v||!data){info.textContent='';return}var toks=v.split(/\\s+/).filter(Boolean),out=data.filter(function(x){if(x.lang!==lang)return false;var h=norm(x.title+' '+x.topic+' '+x.tags.join(' ')+' '+x.ex);return toks.every(function(t){return h.indexOf(t)>=0})});
info.textContent=out.length?out.length+' '+info.getAttribute('data-unit'):info.getAttribute('data-none');
out.slice(0,100).forEach(function(x){var li=document.createElement('li'),a=document.createElement('a'),t=document.createElement('span'),m=document.createElement('span');a.className='item';a.href=x.url;t.className='t';t.textContent=x.title;m.className='m';m.textContent=x.date+(x.topic?' · '+x.topic:'');a.appendChild(t);a.appendChild(m);li.appendChild(a);res.appendChild(li)})}
var p=new URLSearchParams(location.search).get('q');if(p)q.value=p;
fetch('/search-index.json').then(function(r){return r.json()}).then(function(d){data=d;run()});q.addEventListener('input',run);})();`;
const JS_BOARD = `(function(){var b=document.getElementById('board'),w=document.getElementById('world');if(!b)return;var X=+b.dataset.x,Y=+b.dataset.y,W=+b.dataset.w||1,H=+b.dataset.h||1,v={x:0,y:0,k:1};
function apply(){w.style.transform='translate('+v.x+'px,'+v.y+'px) scale('+v.k+')'}
function fit(){var s=Math.min((b.clientWidth-40)/W,(b.clientHeight-40)/H,1);v.k=Math.max(.1,s);v.x=(b.clientWidth-W*v.k)/2+X*v.k*0;v.y=(b.clientHeight-H*v.k)/2;apply()}
function zoom(f,cx,cy){var k=Math.max(.1,Math.min(2.5,v.k*f));cx=cx==null?b.clientWidth/2:cx;cy=cy==null?b.clientHeight/2:cy;v.x=cx-(cx-v.x)*(k/v.k);v.y=cy-(cy-v.y)*(k/v.k);v.k=k;apply()}
document.getElementById('bz-in').onclick=function(){zoom(1.25)};document.getElementById('bz-out').onclick=function(){zoom(1/1.25)};document.getElementById('bz-fit').onclick=fit;
b.addEventListener('wheel',function(e){e.preventDefault();var r=b.getBoundingClientRect();if(e.ctrlKey||e.metaKey)zoom(Math.exp(-e.deltaY*.01),e.clientX-r.left,e.clientY-r.top);else{v.x-=e.deltaX;v.y-=e.deltaY;apply()}},{passive:false});
var P={},last=null;b.addEventListener('pointerdown',function(e){if(e.target.closest('a'))return;P[e.pointerId]={x:e.clientX,y:e.clientY};b.setPointerCapture(e.pointerId);last=null});
b.addEventListener('pointermove',function(e){var p=P[e.pointerId];if(!p)return;var ids=Object.keys(P);if(ids.length===2){var o=P[ids.filter(function(i){return +i!==e.pointerId})[0]],d0=Math.hypot(p.x-o.x,p.y-o.y);p.x=e.clientX;p.y=e.clientY;var d1=Math.hypot(p.x-o.x,p.y-o.y);if(d0>0){var r=b.getBoundingClientRect();zoom(d1/d0,(p.x+o.x)/2-r.left,(p.y+o.y)/2-r.top)}return}v.x+=e.clientX-p.x;v.y+=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;apply()});
function up(e){delete P[e.pointerId]}b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);
b.addEventListener('keydown',function(e){var s=60;if(e.key==='ArrowLeft')v.x+=s;else if(e.key==='ArrowRight')v.x-=s;else if(e.key==='ArrowUp')v.y+=s;else if(e.key==='ArrowDown')v.y-=s;else if(e.key==='+'||e.key==='=')return zoom(1.25);else if(e.key==='-')return zoom(1/1.25);else if(e.key==='0')return fit();else return;e.preventDefault();apply()});
window.addEventListener('resize',fit);fit();})();`;

if (require.main === module) {
  const s = build();
  console.log(
    '已產生靜態站：筆記 ' +
      s.notes +
      '、主題 ' +
      s.topics +
      '、畫布 ' +
      s.boards +
      '、SVG ' +
      s.assets +
      '，共 ' +
      s.pages +
      ' 頁 → ' +
      OUT
  );
}
module.exports = { build };
