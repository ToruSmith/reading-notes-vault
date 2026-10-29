// 雙語、主題、檢視的邏輯測試（node）：漏翻檢查、字典完整性、主題對比、圖庫日曆邏輯
const assert = require('assert'),
  fs = require('fs'),
  path = require('path');
const root = path.join(__dirname, '..'),
  scan = require(path.join(root, 'tools/i18n_keys.js'));
const TH = require(path.join(root, 'themes.js')),
  L = require(path.join(root, 'logic.js'));
const zh = JSON.parse(fs.readFileSync(path.join(root, 'i18n/zh-Hant.json'), 'utf8')),
  en = JSON.parse(fs.readFileSync(path.join(root, 'i18n/en.json'), 'utf8'));
const CJK = /[　-〿一-鿿＀-￯]/;
let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('通過  ' + name);
};
const ph = s => (s.match(/\{\d+\}/g) || []).sort().join(',');
const r = scan(root);

t('漏翻檢查：介面程式碼裡沒有未包 T() 的中文字串（只允許 Markdown 插圖語法）', () => {
  const left = r.bare.filter(b => !(b.f === 'edit.js' && b.v.indexOf('![說明](assets/') === 0));
  assert.deepStrictEqual(
    left.map(b => b.f + ':' + b.line + ' ' + b.v),
    []
  );
});
t('字典完整：程式裡每個翻譯鍵在每個語言檔都有', () => {
  const miss = [];
  r.keys.forEach(k => {
    if (!(k in zh)) miss.push('zh ' + k);
    if (!(k in en)) miss.push('en ' + k);
  });
  assert.deepStrictEqual(miss, []);
});
t('字典一致：繁中是原文本身；英文不含中文字、佔位符 {n} 與原文完全相同', () => {
  const bad = [];
  Object.keys(zh).forEach(k => {
    if (k[0] !== '@' && zh[k] !== k) bad.push('zh 不是原文: ' + k);
  });
  Object.keys(en).forEach(k => {
    if (k[0] === '@') return;
    if (CJK.test(en[k])) bad.push('en 含中文: ' + k);
    if (ph(k) !== ph(en[k])) bad.push('en 佔位符不同: ' + k);
    if (!(k in zh)) bad.push('en 有 zh 沒有: ' + k);
  });
  Object.keys(zh).forEach(k => {
    if (!(k in en)) bad.push('zh 有 en 沒有: ' + k);
  });
  assert.deepStrictEqual(bad, []);
});
t('字典沒有多餘的鍵：不在程式碼裡的鍵必須是後端訊息（Core.gs／Svg.gs／Sync.gs 內找得到其固定文字）', () => {
  const gs = ['Core.gs', 'Svg.gs', 'Sync.gs']
    .map(f => fs.readFileSync(path.join(root, '../backend', f), 'utf8'))
    .join('\n');
  const code = new Set(r.keys),
    extra = Object.keys(zh).filter(k => k[0] !== '@' && !code.has(k));
  const bad = extra.filter(
    k =>
      !k
        .split(/\{\d+\}/)
        .filter(x => x.trim().length >= 2)
        .every(x => gs.indexOf(x) >= 0)
  );
  assert.deepStrictEqual(bad, []);
});
t('後端訊息涵蓋：Core.gs／Svg.gs／Sync.gs 裡會回給使用者的中文片段，字典都有對應鍵', () => {
  const keys = Object.keys(zh).filter(k => k[0] !== '@');
  const frag = new Set();
  keys.forEach(k =>
    k.split(/\{\d+\}/).forEach(x => {
      if (x.trim()) frag.add(x);
    })
  );
  const gsLits = require('child_process')
    .execFileSync('node', [
      '-e',
      `
    function req(n){for(const b of ['','/opt/npm-tools/node_modules/']){try{return require(b+n)}catch(e){}}}
    const acorn=req('acorn'),walk=req('acorn-walk'),fs=require('fs'),CJK=/[\\u3000-\\u303f\\u4e00-\\u9fff\\uff00-\\uffef]/,out=[];
    for(const f of ['Core.gs','Svg.gs','Sync.gs']){const ast=acorn.parse(fs.readFileSync(${JSON.stringify(path.join(root, '../backend'))}+'/'+f,'utf8'),{ecmaVersion:2020});
      walk.full(ast,n=>{if(n.type==='Literal'&&typeof n.value==='string'&&CJK.test(n.value))out.push(n.value)})}
    console.log(JSON.stringify(out))`
    ])
    .toString();
  const lits = JSON.parse(gsLits);
  const bad = lits.filter(
    l => !Array.from(frag).some(f => f.indexOf(l) >= 0 || (l.indexOf(f) >= 0 && false))
  );
  assert.deepStrictEqual(bad, []);
});
t('T()：代入參數、範本反向比對（後端動態訊息）、找不到就回原文', () => {
  const g = { VAULT_I18N: { 'zh-Hant': zh, en }, navigator: { languages: ['en-US'] } };
  const I = new Function(
    'window',
    'document',
    'navigator',
    fs.readFileSync(path.join(root, 'i18n.js'), 'utf8') + '\nreturn VaultI18n;'
  )(g, undefined, g.navigator);
  assert.strictEqual(I.detect(), 'en');
  I.set('en');
  assert.strictEqual(I.T('{1} 則', 3), '3 notes');
  assert.strictEqual(I.T('找不到主題：abc'), 'Topic not found: abc');
  assert.strictEqual(I.T('title 超過 100 字'), 'title is longer than 100 characters');
  assert.strictEqual(
    I.T('這則筆記大小約 70 KB，超過建議的 50 KB。仍已存檔，建議拆分。'),
    'This note is about 70 KB, over the suggested 50 KB. It was saved anyway; consider splitting it.'
  );
  assert.strictEqual(I.T('完全沒有的訊息'), '完全沒有的訊息');
  assert.strictEqual(I.T('X: {1}', 'y'), 'X: y');
  I.set('zh-Hant');
  assert.strictEqual(I.T('{1} 則', 3), '3 則');
  assert.strictEqual(I.detect(), 'en');
  g.navigator.languages = ['zh-TW'];
  assert.strictEqual(I.detect(), 'zh-Hant');
  g.navigator.languages = ['fr'];
  assert.strictEqual(I.detect(), 'en');
});

/* ───── 主題 ───── */
t('主題：內建 10 個，id 不重複，每個都有全部顏色且為 #rrggbb', () => {
  assert.strictEqual(TH.LIST.length, 10);
  assert.strictEqual(new Set(TH.LIST.map(x => x.id)).size, 10);
  TH.LIST.forEach(x => TH.KEYS.forEach(k => assert.ok(/^#[0-9a-f]{6}$/i.test(x.colors[k]), x.id + ' ' + k)));
});
t('主題：每個內建主題的所有文字配對對比 ≥ 4.5:1（WCAG AA）', () => {
  const rows = [];
  TH.LIST.forEach(x => {
    const c = TH.check(x.colors);
    c.rows
      .filter(q => !q.ok)
      .forEach(q => rows.push(x.id + ' ' + q.fg + '/' + q.bg + ' ' + q.ratio.toFixed(2)));
  });
  assert.deepStrictEqual(rows, []);
});
t('主題：對比計算符合已知值（黑白 21:1、相同色 1:1）', () => {
  assert.ok(Math.abs(TH.ratio('#000000', '#ffffff') - 21) < 0.01);
  assert.ok(Math.abs(TH.ratio('#777777', '#777777') - 1) < 1e-9);
  assert.ok(Math.abs(TH.ratio('#767676', '#ffffff') - 4.54) < 0.01); // WCAG 的經典 AA 臨界灰
});
t('自訂主題：匯出再匯入得到同樣顏色；缺的顏色沿用 extends；壞格式明確拒絕', () => {
  const nord = TH.find('nord'),
    j = TH.exportJSON('我的', nord.colors, 'nord');
  const back = TH.importJSON(j);
  assert.ok(back.ok);
  assert.deepStrictEqual(back.theme.colors, nord.colors);
  assert.strictEqual(back.theme.dark, true);
  assert.ok(back.check.ok);
  const part = TH.importJSON(
    JSON.stringify({ format: 'vault-theme', extends: 'dracula', colors: { bg: '#000000' } })
  );
  assert.strictEqual(part.theme.colors.bg, '#000000');
  assert.strictEqual(part.theme.colors.fg, TH.find('dracula').colors.fg);
  assert.strictEqual(TH.importJSON('{oops').ok, false);
  assert.strictEqual(TH.importJSON('{"a":1}').ok, false);
  const bad = TH.importJSON(JSON.stringify({ format: 'vault-theme', colors: { bg: 'red', fg: 'url(x)' } }));
  assert.strictEqual(bad.ok, false);
  assert.ok(/bg/.test(bad.args[0]) && /fg/.test(bad.args[0]));
});
t('自訂主題：對比不足時回報哪幾組，但仍能匯入（由使用者決定）', () => {
  const low = TH.importJSON(JSON.stringify({ format: 'vault-theme', colors: { fg: '#f0ece0' } })); // 淺色字配淺色底
  assert.ok(low.ok);
  assert.strictEqual(low.check.ok, false);
  assert.ok(low.check.rows.some(q => q.fg === 'fg' && q.bg === 'bg' && !q.ok));
});

/* ───── 圖庫、日曆邏輯 ───── */
const mk = (id, date, title) => ({ id, date, title, tags: [] });
t('日期解析：不經過 Date 字串（不受時區影響）；2/30、13 月、格式錯誤都是 null', () => {
  assert.deepStrictEqual(L.parseYmd('2024-02-29'), { y: 2024, m: 2, d: 29 });
  ['2026-02-30', '2026-13-01', '2026-1-1', '', null, 'abc', '2026-00-10'].forEach(s =>
    assert.strictEqual(L.parseYmd(s), null, String(s))
  );
});
t('日期範圍與排序：含頭尾；有設範圍時沒有日期的不列入；排序不改變原陣列', () => {
  const a = [
      mk('1', '2026-10-05', 'b'),
      mk('2', '2026-10-01', 'a'),
      mk('3', '', 'c'),
      mk('4', '2026-11-01', 'd')
    ],
    copy = a.slice();
  assert.deepStrictEqual(
    L.refine(a, { from: '2026-10-01', to: '2026-10-31' }).map(x => x.id),
    ['1', '2']
  );
  assert.deepStrictEqual(
    L.refine(a, { from: '2026-10-05' }).map(x => x.id),
    ['1', '4']
  );
  assert.deepStrictEqual(
    L.refine(a, { sort: 'date-asc' }).map(x => x.id),
    ['2', '1', '4', '3']
  );
  assert.deepStrictEqual(
    L.refine(a, { sort: 'date-desc' }).map(x => x.id),
    ['4', '1', '2', '3']
  );
  assert.deepStrictEqual(
    L.refine(a, { sort: 'title' }).map(x => x.id),
    ['2', '1', '3', '4']
  );
  assert.deepStrictEqual(
    L.refine(a, {}).map(x => x.id),
    ['1', '2', '3', '4']
  );
  assert.deepStrictEqual(a, copy);
});
t('月曆格：整週補滿、週日起；跨月補的格子 inMonth=false；無日期另列', () => {
  const g = L.monthGrid(
    [mk('1', '2026-10-24', 'a'), mk('2', '2026-10-24', 'b'), mk('3', 'x', 'c'), mk('4', '2026-09-30', 'd')],
    2026,
    10
  );
  assert.ok(g.weeks.every(w => w.length === 7));
  assert.strictEqual(g.weeks.length, 5);
  assert.strictEqual(g.weeks[0][0].date, '2026-09-27');
  assert.strictEqual(g.weeks[0][4].date, '2026-10-01');
  const day = g.weeks.flat().find(c => c.date === '2026-10-24');
  assert.strictEqual(day.items.length, 2);
  assert.ok(day.inMonth);
  assert.strictEqual(g.weeks[0][3].inMonth, false);
  assert.strictEqual(g.weeks[0][3].items.length, 1);
  assert.strictEqual(g.undated.length, 1);
  assert.strictEqual(g.weeks.flat().filter(c => c.inMonth).length, 31);
  [
    [2026, 2, 28],
    [2024, 2, 29],
    [2026, 12, 31],
    [2026, 1, 31]
  ].forEach(([y, m, d]) =>
    assert.strictEqual(
      L.monthGrid([], y, m)
        .weeks.flat()
        .filter(c => c.inMonth).length,
      d,
      y + '-' + m
    )
  );
});
console.log('\n雙語／主題／檢視：' + n + ' 項全部通過');
