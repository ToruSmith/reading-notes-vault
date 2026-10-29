// 前端純邏輯測試（node）。畫面（DOM）部分無法在這裡測，需由使用者目視確認。
const assert = require('assert'),
  path = require('path');
const L = require('../logic.js');
const markdownit = require('../vendor/markdown-it.min.js');
let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('通過  ' + name);
};

const topics = [
  { id: 'db', title: '資料庫設計', category: '資料庫', status: 'reading', defaultPublic: false },
  { id: 'sql', title: 'SQL 入門', category: '資料庫', status: 'done', defaultPublic: true },
  { id: 'journal', title: '日記', category: '', status: '', defaultPublic: true }
];
const mk = (id, title, topic, date, tags = [], links = []) => ({
  id,
  title,
  topic,
  date,
  tags,
  links,
  public: null
});
const items = [
  mk('20261001-a1', '正規化與反正規化', 'db', '2026-10-01', ['mysql', '正規化']),
  mk('20261005-b2', 'SQL 查詢最佳化', 'sql', '2026-10-05', ['sql'], ['20261001-a1']),
  mk('20261010-c3', '今天的心情', 'journal', '2026-10-10', ['日記']),
  mk('20261012-d4', '一則沒有主題的公開筆記', '', '2026-10-12', [], ['20261001-a1', '20261005-b2'])
];
const ids = r => r.map(x => x.id);

t('tokenize：中文以詞切分，英文轉小寫', () => {
  assert.deepStrictEqual(L.tokenize('資料庫設計與正規化'), ['資料庫', '設計', '與', '正規', '化']);
  assert.deepStrictEqual(L.tokenize('  MySQL 入門 '), ['mysql', '入門']);
  assert.deepStrictEqual(L.tokenize(''), []);
});
t('搜尋：中文詞命中標題、標籤、主題名；所有詞都要命中', () => {
  assert.deepStrictEqual(ids(L.filterItems(items, topics, { q: '正規化' })), ['20261001-a1']);
  assert.deepStrictEqual(ids(L.filterItems(items, topics, { q: 'mysql' })), ['20261001-a1']); // 命中標籤
  assert.deepStrictEqual(ids(L.filterItems(items, topics, { q: '資料庫設計' })), ['20261001-a1']); // 命中主題名
  assert.deepStrictEqual(ids(L.filterItems(items, topics, { q: 'redis 正規化' })), []); // AND：有一個詞沒命中就不算
});
t('搜尋：口語查詢中的虛詞（單字）不擋住結果；單字查詢仍可用', () => {
  assert.deepStrictEqual(ids(L.filterItems(items, topics, { q: '正規化與反正規化' })), ['20261001-a1']);
  assert.deepStrictEqual(ids(L.filterItems(items, topics, { q: '心' })), ['20261010-c3']);
});
t('搜尋：標題命中排在標籤命中之前，其餘依日期新到舊', () => {
  const r = L.filterItems(
    [mk('20260101-x1', '其他', '', '2026-01-01', ['sql']), mk('20260102-x2', 'SQL 筆記', '', '2026-01-02')],
    [],
    { q: 'sql' }
  );
  assert.deepStrictEqual(ids(r), ['20260102-x2', '20260101-x1']);
});
t('篩選：主題、狀態、標籤、無主題', () => {
  assert.deepStrictEqual(ids(L.filterItems(items, topics, { topic: 'sql' })), ['20261005-b2']);
  assert.deepStrictEqual(ids(L.filterItems(items, topics, { status: 'reading' })), ['20261001-a1']);
  assert.deepStrictEqual(ids(L.filterItems(items, topics, { tag: '日記' })), ['20261010-c3']);
  assert.deepStrictEqual(ids(L.filterItems(items, topics, { topic: L.NONE })), ['20261012-d4']);
});
t('無篩選：依日期新到舊', () =>
  assert.deepStrictEqual(ids(L.filterItems(items, topics, {})), [
    '20261012-d4',
    '20261010-c3',
    '20261005-b2',
    '20261001-a1'
  ])
);
t('書櫃：依分類分組、數量取自可見筆記、未分類排最後、無主題另計', () => {
  const s = L.buildShelf(items, topics);
  assert.deepStrictEqual(
    s.categories.map(c => c.name),
    ['資料庫', '']
  );
  assert.deepStrictEqual(
    s.categories[0].topics.map(x => x.id + ':' + x.count),
    ['db:1', 'sql:1']
  );
  assert.strictEqual(s.none, 1);
  assert.strictEqual(s.total, 4);
  assert.deepStrictEqual(s.statuses, ['done', 'reading']);
});
t('書櫃：只含傳入的主題，私人主題沒傳就不會出現', () => {
  const s = L.buildShelf(
    items.filter(i => i.topic !== 'db'),
    topics.filter(t => t.id !== 'db')
  );
  assert.ok(!JSON.stringify(s).includes('資料庫設計'));
});
t('反向連結', () => {
  const b = L.backlinks(items);
  assert.deepStrictEqual(b['20261001-a1'].sort(), ['20261005-b2', '20261012-d4']);
  assert.deepStrictEqual(b['20261005-b2'], ['20261012-d4']);
});
t('擁有者檢視：公開狀態＝筆記優先、否則取主題預設', () => {
  const tm = L.topicMap(topics);
  assert.strictEqual(L.effectivePublic({ public: true, topic: 'db' }, tm), true);
  assert.strictEqual(L.effectivePublic({ public: false, topic: 'sql' }, tm), false);
  assert.strictEqual(L.effectivePublic({ public: null, topic: 'sql' }, tm), true);
  assert.strictEqual(L.effectivePublic({ public: null, topic: 'db' }, tm), false);
  assert.strictEqual(L.effectivePublic({ public: null, topic: '' }, tm), false);
});
t('[[id]] 轉內部連結；標題含括號會跳脫；[[標題]] 與找不到的 id 顯示純文字', () => {
  const by = { '20261001-a1': { title: '正規化[上]' } };
  const out = L.rewriteInternalLinks('見 [[20261001-a1]]、[[某標題]]、[[20261231-zz]]', by);
  assert.strictEqual(out, '見 [正規化\\[上\\]](#note=20261001-a1)、某標題、（找不到的筆記）');
});

/* ───── Markdown 安全 ───── */
const md = L.makeMarkdown(markdownit);
const html = s => md.render(s);
t('Markdown：原始 HTML 一律跳脫，不產生標籤', () => {
  const h = html(
    '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<iframe src="//evil"></iframe>'
  );
  assert.ok(!/<script|<img|<iframe/i.test(h), h);
});
t('Markdown：javascript:、vbscript:、data:、file: 連結不會變成連結', () => {
  [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'vbscript:x',
    'data:text/html,hi',
    'file:///etc/passwd',
    '&#106;avascript:alert(1)'
  ].forEach(u => {
    const h = html('[點我](' + u + ')');
    assert.ok(!/<a /i.test(h), u + ' → ' + h);
  });
});
t('Markdown：http、https、mailto、站內連結正常；外部連結加 rel 與 target', () => {
  assert.ok(
    /<a href="https:\/\/example.com\/" target="_blank" rel="noopener noreferrer">/.test(
      html('[a](https://example.com/)')
    )
  );
  assert.ok(/<a href="mailto:a@b.c">/.test(html('[a](mailto:a@b.c)')));
  assert.ok(/class="note-link" data-note="20261001-a1"/.test(html('[a](#note=20261001-a1)')));
});
t('Markdown：data: 圖片（點陣圖）不載入，只留說明文字', () => {
  const h = html('![說明](data:image/png;base64,AAAA)');
  assert.ok(!/<img/.test(h) && h.includes('說明'), h);
});
t('Markdown：assets/<id>.svg 轉成不帶 src 的 <img data-svg>，交給前端用 getSvg 載入', () => {
  const h = html('![ER 圖](assets/20261022-v001.svg)');
  assert.ok(/<img[^>]*data-svg="20261022-v001"/.test(h) && !/\ssrc=/.test(h), h);
});
t('Markdown：外部 https 圖片可顯示並帶 no-referrer；相對路徑點陣圖不載入', () => {
  assert.ok(/<img[^>]*referrerpolicy="no-referrer"/.test(html('![x](https://example.com/a.png)')));
  assert.ok(!/<img/.test(html('![x](images/a.png)')));
});
t('Markdown：說明文字中的 HTML 會跳脫', () => assert.ok(!/<b>/.test(html('![<b>x</b>](images/a.png)'))));

/* ───── 編輯與匯入 ───── */
const Y = require('../vendor/js-yaml.min.js');
t('splitNote／composeNote：往返後日期仍是字串，自訂欄位與 lang、source 原樣保留', () => {
  const s = L.splitNote(
    '---\nid: 20261022-a1\ntitle: 標題\ndate: 2026-10-22\ntags: [a, b]\nx-mood: 開心\nrating: 5\nlang: en\n---\n內文',
    Y
  );
  assert.strictEqual(s.meta.date, '2026-10-22');
  assert.strictEqual(s.body, '內文');
  const out = L.composeNote(s.meta, s.body, Y);
  assert.ok(
    out.startsWith('---\nid: 20261022-a1\ntitle: 標題\ndate: 2026-10-22\ntags:') &&
      out.includes('x-mood: 開心') &&
      out.includes('rating: 5') &&
      out.includes('lang: en')
  );
  assert.deepStrictEqual(L.splitNote(out, Y).meta, s.meta);
});
t('splitNote：沒有 front matter、壞 YAML、非鍵值', () => {
  assert.strictEqual(L.splitNote('只有內文', Y).has, false);
  assert.strictEqual(L.splitNote('---\ntitle: [x\n---\n', Y).ok, false);
  assert.strictEqual(L.splitNote('---\n- a\n- b\n---\n', Y).ok, false);
});
t('composeNote：空值不寫進 front matter', () => {
  const out = L.composeNote({ id: '20261022-a1', title: 'T', topic: '', tags: [], cover: '' }, 'b', Y);
  assert.strictEqual(out, '---\nid: 20261022-a1\ntitle: T\n---\nb');
});
t('newId：格式符合後端規則', () => {
  assert.ok(L.ID_RE.test(L.newId('2026-10-22')));
  assert.strictEqual(
    L.newId('2026-10-22', () => 0),
    '20261022-0000'
  );
});
t('prepareImport：缺標題取第一個標題；沒有標題用檔名；缺日期用匯入當天', () => {
  const c = { jsyaml: Y, topic: 'db', today: '2026-11-01' };
  let p = L.prepareImport('# 我的標題\n內文', 'a.md', c);
  assert.ok(
    p.ok &&
      p.title === '我的標題' &&
      p.meta.date === '2026-11-01' &&
      p.added.join() === 'title,date' &&
      p.meta.topic === 'db' &&
      p.meta.source === 'a.md'
  );
  p = L.prepareImport('沒有任何標題', '資料夾/第三章 筆記.md', c);
  assert.strictEqual(p.title, '第三章 筆記');
  assert.strictEqual(p.meta.source, '第三章 筆記.md');
  assert.ok(L.ID_RE.test(p.id) && p.id.startsWith('20261101-') && p.meta.id === p.id);
});
t(
  'prepareImport：保留 front matter 的日期與自訂欄位；原 id 不沿用；public 一律清除並回報；主題以匯入選擇為準',
  () => {
    const p = L.prepareImport(
      '---\nid: 20200101-zz\ntitle: T\ndate: 2025-05-05\npublic: true\ntopic: other\nx-a: 1\n---\nb',
      'n.md',
      { jsyaml: Y, topic: '', today: '2026-11-01' }
    );
    assert.ok(
      p.ok &&
        p.meta.date === '2025-05-05' &&
        p.strippedPublic === true &&
        !('public' in p.meta) &&
        p.meta.topic === '' &&
        p.meta['x-a'] === 1
    );
    assert.ok(p.id !== '20200101-zz' && p.id.startsWith('20250505-'));
    assert.ok(!L.composeNote(p.meta, p.body, Y).includes('public'));
  }
);
t('prepareImport：壞 YAML 回報錯誤而不是丟出例外', () =>
  assert.strictEqual(
    L.prepareImport('---\na: [\n---\n', 'x.md', { jsyaml: Y, today: '2026-11-01' }).ok,
    false
  )
);
t('resolveLinks：唯一比對轉成 id；同名多個、找不到的保留並回報；已是 id 的不動', () => {
  const tm = L.buildTitleMap(
    [
      { id: '20261001-a1', title: 'Normalization' },
      { id: '20261002-b2', title: '重複' },
      { id: '20261003-c3', title: '重複' }
    ],
    [{ id: '20261101-n1', title: '新的' }]
  );
  const r = L.resolveLinks('見 [[normalization]]、[[重複]]、[[不存在]]、[[20261001-a1]]、[[ 新的 ]]', tm);
  assert.strictEqual(r.body, '見 [[20261001-a1]]、[[重複]]、[[不存在]]、[[20261001-a1]]、[[20261101-n1]]');
  assert.strictEqual(r.resolved, 2);
  assert.deepStrictEqual(r.unresolved, ['重複', '不存在']);
});
t('findDup：以「主題＋來源檔名」比對', () => {
  const rows = [
    { id: '20261001-a1', topic: 'db', source: 'a.md' },
    { id: '20261002-b2', topic: '', source: 'a.md' }
  ];
  assert.strictEqual(L.findDup(rows, 'db', 'a.md').id, '20261001-a1');
  assert.strictEqual(L.findDup(rows, '', 'a.md').id, '20261002-b2');
  assert.strictEqual(L.findDup(rows, 'db', 'b.md'), null);
});

t('resolveLinks：相容 [[標題|別名]] 與 [[標題#小節]]', () => {
  const tm = L.buildTitleMap([{ id: '20261001-a1', title: '正規化' }], []);
  assert.strictEqual(
    L.resolveLinks('[[正規化|別名]]、[[正規化#第二節]]、[[20261001-a1|x]]', tm).body,
    '[[20261001-a1]]、[[20261001-a1]]、[[20261001-a1|x]]'
  );
});
t('mapFolders：有子資料夾時，第一層子資料夾為主題、散檔未歸類、深層併入並以相對路徑為 source', () => {
  const r = L.mapFolders(
    [
      'vault/資料庫/a.md',
      'vault/資料庫/ch1/b.md',
      'vault/readme.md',
      'vault/.obsidian/c.md',
      'vault/.DS_Store'
    ].map(path => ({ path }))
  );
  assert.deepStrictEqual(
    r.map(x => (x.skip ? 'skip' : x.topicTitle + '|' + x.source)),
    ['資料庫|a.md', '資料庫|ch1/b.md', '|readme.md', 'skip', 'skip']
  );
});
t('mapFolders：沒有子資料夾時，選到的資料夾本身就是主題', () => {
  const r = L.mapFolders([{ path: '資料庫設計/a.md' }, { path: '資料庫設計/b.md' }]);
  assert.deepStrictEqual(
    r.map(x => x.topicTitle + '|' + x.source),
    ['資料庫設計|a.md', '資料庫設計|b.md']
  );
});
t('matchTopic（標題不分大小寫）、newTopicId（格式正確且避開已用 id）', () => {
  assert.strictEqual(L.matchTopic(' sql 入門 ', [{ id: 'sql', title: 'SQL 入門' }]).id, 'sql');
  assert.strictEqual(L.matchTopic('沒有', [{ id: 'sql', title: 'SQL 入門' }]), null);
  assert.strictEqual(
    L.newTopicId({}, () => 0),
    't-0000'
  );
  let k = 0;
  assert.strictEqual(
    L.newTopicId({ 't-0000': true }, () => (k++ < 4 ? 0 : 0.03)),
    't-1111'
  );
});
t('rewriteSvgRefs：改寫 ![](相對路徑.svg) 與 ![[檔名.svg]]；同名多個、本批沒有的、已是 assets 的不動', () => {
  const map = L.buildSvgMap([
    { name: 'img/ER 圖.svg', id: '20261101-a001' },
    { name: 'x/dup.svg', id: '20261101-d001' },
    { name: 'y/dup.svg', id: '20261101-d002' }
  ]);
  const r = L.rewriteSvgRefs(
    '![關聯](../img/ER%20圖.svg "標題") ![[ER 圖.svg|300]] ![](dup.svg) ![](other.svg) ![](assets/20261022-v001.svg)',
    map
  );
  assert.strictEqual(
    r.body,
    '![關聯](assets/20261101-a001.svg) ![ER 圖.svg](assets/20261101-a001.svg) ![](dup.svg) ![](other.svg) ![](assets/20261022-v001.svg)'
  );
  assert.strictEqual(r.rewritten, 2);
});
t('prepareImport：資料夾匯入可指定 source（相對路徑）', () => {
  const p = L.prepareImport('x', 'b.md', {
    jsyaml: Y,
    topic: 't-0000',
    today: '2026-11-01',
    source: 'ch1/b.md'
  });
  assert.strictEqual(p.meta.source, 'ch1/b.md');
  assert.strictEqual(p.title, 'b');
});

t('全文搜尋：內文命中排在標題、標籤之後；沒有內文索引時只比對標題與標籤', () => {
  const its = [mk('20261001-a1', '甲', '', '2026-10-01'), mk('20261002-b2', '乙 索引', '', '2026-10-02')];
  const bodies = { '20261001-a1': L.plainBody('---\nid: x\n---\n這裡談到 索引 的取捨'), '20261002-b2': '' };
  assert.deepStrictEqual(ids(L.filterItems(its, [], { q: '索引' }, bodies)), ['20261002-b2', '20261001-a1']);
  assert.deepStrictEqual(ids(L.filterItems(its, [], { q: '索引' })), ['20261002-b2']);
});
t('plainBody 去掉 front matter 與圖片語法；bodySnippet 取命中處前後文', () => {
  assert.strictEqual(L.plainBody('---\nid: x\ntitle: T\n---\n![圖](assets/a.svg)文字').trim(), '文字');
  const sn = L.bodySnippet('a'.repeat(50) + ' 索引 ' + 'b'.repeat(50), ['索引']);
  assert.ok(sn.startsWith('…') && sn.endsWith('…') && sn.includes('索引'));
  assert.strictEqual(L.bodySnippet('沒有', ['索引']), '');
});
t('zipKind：辨識備份內的路徑（含外層資料夾），不合格的檔名標為 bad', () => {
  assert.deepStrictEqual(L.zipKind('notes/20261001-a1.md'), { kind: 'note', id: '20261001-a1' });
  assert.deepStrictEqual(L.zipKind('我的備份/assets/20261001-a1.svg'), { kind: 'asset', id: '20261001-a1' });
  assert.deepStrictEqual(L.zipKind('boards/journal.canvas.json'), { kind: 'board', id: 'journal' });
  assert.deepStrictEqual(L.zipKind('topics/db.json'), { kind: 'topic', id: 'db' });
  assert.strictEqual(L.zipKind('notes/隨便.md').bad, true);
  assert.strictEqual(L.zipKind('manifest.json').kind, 'manifest');
  assert.strictEqual(L.zipKind('readme.txt').kind, null);
});
t('parseBackupNote：id 必須與檔名一致', () => {
  assert.ok(L.parseBackupNote('20261001-a1', '---\nid: 20261001-a1\ntitle: T\n---\nb', Y).ok);
  assert.ok(!L.parseBackupNote('20261001-a1', '---\nid: 20261001-zz\ntitle: T\n---\nb', Y).ok);
  assert.ok(!L.parseBackupNote('20261001-a1', '沒有 front matter', Y).ok);
});
t('publicRestoreList：明確公開、繼承公開主題預設的會列入；明確私人的不列', () => {
  const n = (id, topic, pub) => ({ id, meta: { topic, public: pub } });
  assert.deepStrictEqual(
    L.publicRestoreList(
      [
        n('a', 'pub', undefined),
        n('b', 'pub', false),
        n('c', 'priv', true),
        n('d', 'priv', undefined),
        n('e', '', undefined)
      ],
      { pub: true, priv: false }
    ),
    ['a', 'c']
  );
});

/* ───── P3：語法高亮、目錄 ───── */
const unesc = h =>
  h
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
t('語法高亮：各語言都會上色，且去掉標籤後與原文逐字相同（不丟字、不多字）', () => {
  const samples = {
    js: 'const a = "x"; // c\nfunction f(n) { return n > 0x1F ? `t${n}` : null; }\nclass Foo {}',
    python: '# c\n@dec\ndef f(x):\n    """doc"""\n    return x if x is None else 1.5',
    sql: "-- c\nSELECT count(*) FROM t WHERE a = 'it''s' AND b IN (1,2) ORDER BY a;",
    json: '{"a": [1, 2.5e3, true, null], "b": "x"}',
    html: '<!-- c --><div class="a" id=\'b\'>hi &amp; <b>x</b></div>',
    css: '/* c */ a:hover { color: #fff; margin: -1.5rem 0; --x: 1; background: url("a.png") }',
    bash: '# c\nif [ -f "$HOME/x" ]; then echo ${A} $1; fi'
  };
  Object.keys(samples).forEach(k => {
    const h = L.highlight(k, samples[k]);
    assert.ok(h && /<span class="tk-/.test(h), k);
    assert.strictEqual(unesc(h), samples[k], k);
  });
});
t('語法高亮：關鍵字、字串、註解、數字、函式、JSON 鍵各歸其類', () => {
  const js = L.highlight('js', 'const x = 1; // hi\nfoo("s")');
  ['tk-k">const', 'tk-n">1', 'tk-c">// hi', 'tk-f">foo', 'tk-s">&quot;s&quot;'].forEach(x =>
    assert.ok(js.includes(x), x + ' ← ' + js)
  );
  assert.ok(L.highlight('json', '{"k": "v"}').includes('tk-a">&quot;k&quot;'));
  assert.ok(L.highlight('json', '{"k": "v"}').includes('tk-s">&quot;v&quot;'));
  assert.ok(L.highlight('sql', 'select 1').includes('tk-k">select'));
  assert.ok(L.highlight('SQL', 'SELECT 1').includes('tk-k">SELECT'));
  assert.ok(!L.highlight('js', 'xconst y').includes('tk-k">const'), '識別字內部的 const 不算關鍵字');
});
t('語法高亮：不認得的語言或超長程式碼回傳 null；惡意內容一律跳脫', () => {
  assert.strictEqual(L.highlight('brainfuck', '+++'), null);
  assert.strictEqual(L.highlight('', 'x'), null);
  assert.strictEqual(L.highlight('js', 'a'.repeat(20001)), null);
  const evil = '</span><script>alert(1)</script><img src=x onerror=alert(1)>"\'';
  ['js', 'html', 'css', 'sql', 'bash', 'json', 'python'].forEach(k => {
    const h = L.highlight(k, evil);
    assert.ok(!/<script|<img/i.test(h), k + ': ' + h);
    assert.strictEqual(unesc(h), evil, k);
  });
});
t('語法高亮：隨機字串不丟錯、不丟字（模糊測試）', () => {
  const al = '"\'`/*-#<>{}()[]$@&;:=\\\n abcXYZ019.,!';
  let r = 7;
  const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 400; i++) {
    let c = '';
    for (let j = 0, n = Math.floor(rnd() * 80); j < n; j++) c += al[Math.floor(rnd() * al.length)];
    ['js', 'python', 'sql', 'json', 'html', 'css', 'bash'].forEach(k =>
      assert.strictEqual(unesc(L.highlight(k, c)), c, k + ' ' + JSON.stringify(c))
    );
  }
});
t('Markdown：程式碼區塊上色；語言名稱只留英數（不能藉資訊字串注入屬性）', () => {
  const md = L.makeMarkdown(markdownit);
  const h = md.render(
    '```js\nconst a = 1\n```\n\n```js" onmouseover="x\n<b>\n```\n\n```unknownlang\n<i>\n```'
  );
  assert.ok(h.includes('<code class="language-js"><span class="tk-k">const'), h);
  assert.ok(!/onmouseover/i.test(h.replace(/language-[^"]*/g, '')) || !/" onmouseover=/i.test(h), h);
  assert.ok(h.includes('&lt;i&gt;') && !h.includes('<i>'));
});
t('目錄：傳入 env.toc 才會替標題加 id 並收集；沒傳就不動（畫布卡片內不會有重複 id）', () => {
  const md = L.makeMarkdown(markdownit),
    src = '# 一\n文字\n## 二 `code`\n### 三 *斜*\n#### 四';
  const env = { toc: [] },
    h = md.render(src, env);
  assert.deepStrictEqual(
    env.toc.map(x => [x.level, x.text, x.id]),
    [
      [1, '一', 'toc-1'],
      [2, '二 code', 'toc-2'],
      [3, '三 斜', 'toc-3'],
      [4, '四', 'toc-4']
    ]
  );
  assert.ok(h.includes('<h2 id="toc-2">'));
  assert.ok(!md.render(src).includes('id="toc-'));
});
t('語法高亮顏色：預設淺色與深色各 8 色，對面板背景的對比度皆 ≥ 4.5（WCAG AA）', () => {
  const lum = hex => {
    const c = [1, 3, 5]
      .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const css = require('fs').readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  const blocks = [
    css.match(/^:root \{([^}]*)\}/m)[1],
    css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/)[1]
  ];
  blocks.forEach((b, bi) => {
    const v = {};
    b.replace(/--([\w-]+):(#[0-9a-fA-F]{6})/g, (m, k, x) => {
      v[k] = x;
    });
    ['k', 's', 'c', 'n', 'f', 't', 'a', 'v'].forEach(k => {
      const rr = Math.min(ratio(v['tk-' + k], v.panel), ratio(v['tk-' + k], v.bg));
      assert.ok(rr >= 4.5, (bi ? '深色 ' : '淺色 ') + k + ' 對比 ' + rr.toFixed(2));
    });
  });
});

t('批次計畫：本來就一樣的不列入；移到公開主題或設為公開算「變成公開」；設成私人、移到私人主題不算', () => {
  const tm = L.topicMap([
    { id: 'pub', title: 'P', defaultPublic: true },
    { id: 'priv', title: 'V', defaultPublic: false }
  ]);
  const it = (id, topic, pub) => ({ id, topic, public: pub });
  const items = [it('a', 'priv', null), it('b', 'pub', null), it('c', 'priv', true), it('d', '', null)];
  let p = L.batchPlan(items, tm, { topic: 'pub' });
  assert.deepStrictEqual(p.todo, ['a', 'c', 'd']);
  assert.deepStrictEqual(p.same, ['b']);
  assert.deepStrictEqual(p.newlyPublic.sort(), ['a', 'd']);
  p = L.batchPlan(items, tm, { public: true });
  assert.deepStrictEqual(p.newlyPublic.sort(), ['a', 'd']);
  assert.deepStrictEqual(p.same, ['c']);
  p = L.batchPlan(items, tm, { public: false });
  assert.deepStrictEqual(p.newlyPublic, []);
  assert.deepStrictEqual(p.todo.sort(), ['a', 'b', 'c', 'd']);
  p = L.batchPlan(items, tm, { topic: 'priv' });
  assert.deepStrictEqual(p.newlyPublic, []);
  assert.deepStrictEqual(p.todo.sort(), ['b', 'd']);
  p = L.batchPlan(items, tm, { topic: '', public: null });
  assert.deepStrictEqual(p.newlyPublic, []);
  assert.deepStrictEqual(p.todo.sort(), ['a', 'b', 'c']);
  p = L.batchPlan([it('e', 'priv', true)], tm, { topic: 'pub', public: null });
  assert.deepStrictEqual(p.newlyPublic, []); // 本來就公開，仍然公開
});

console.log('\n共 ' + n + ' 項全部通過');
