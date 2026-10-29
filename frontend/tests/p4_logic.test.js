// P4 純邏輯：個資掃描、路由、上下篇、翻譯連結、語言篩選
const assert = require('assert'),
  L = require('../logic'),
  Pii = require('../pii');
let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('通過  ' + name);
};
const types = s => Pii.scan(s).map(x => x.type + ':' + x.text);

t('個資：Email、手機（多種寫法）、市話、地址都找得到', () => {
  assert.deepStrictEqual(types('聯絡 test.user+1@example.com'), ['email:test.user+1@example.com']);
  assert.deepStrictEqual(types('0912-345-678'), ['mobile:0912-345-678']);
  assert.deepStrictEqual(types('0912345678'), ['mobile:0912345678']);
  assert.deepStrictEqual(types('+886 912 345 678'), ['mobile:+886 912 345 678']);
  assert.deepStrictEqual(types('(02)2345-6789'), ['phone:(02)2345-6789']);
  assert.deepStrictEqual(types('02-2345-6789'), ['phone:02-2345-6789']);
  const a = Pii.scan('住在台北市大安區和平東路二段106號3樓。');
  assert.strictEqual(a.length, 1);
  assert.strictEqual(a[0].type, 'address');
});
t('個資：身分證字號只在檢查碼正確時回報；日期、版本號、一般數字不誤報', () => {
  assert.deepStrictEqual(types('A123456789'), ['id:A123456789']);
  assert.deepStrictEqual(types('A123456788'), []);
  [
    '2026-10-24',
    '版本 1.2.3.4',
    '共 20261024 筆',
    'ISBN 9789571234567',
    '價格 12,345 元',
    '20261024-a1'
  ].forEach(s => assert.deepStrictEqual(types(s), [], s));
});
t('個資：回報行號與前後文；程式碼區塊內的標為 inCode；同一串數字不重複回報', () => {
  const r = Pii.scan('第一行\n呼叫 0912-345-678 即可\n```\nmail me@x.org\n```');
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].line, 2);
  assert.ok(r[0].context.includes('呼叫') && !r[0].inCode);
  assert.strictEqual(r[1].line, 4);
  assert.strictEqual(r[1].inCode, true);
  assert.deepStrictEqual(Pii.summarize(r), { mobile: 1, email: 1 });
});
t('路由：parse 與 build 互逆；不合法的 id 一律忽略', () => {
  [
    { lang: '', note: '', topic: '' },
    { lang: 'en', note: '20261024-a1', topic: '' },
    { lang: 'zh', note: '', topic: 'db' },
    { lang: '', note: '20261024-a1', topic: '' }
  ].forEach(r => assert.deepStrictEqual(L.parseRoute(L.buildRoute(r)), r));
  assert.deepStrictEqual(L.parseRoute('#/note/<script>'), { lang: '', note: '', topic: '' });
  assert.deepStrictEqual(L.parseRoute('#/fr/note/20261024-a1'), { lang: '', note: '', topic: '' });
  assert.deepStrictEqual(L.parseRoute(''), { lang: '', note: '', topic: '' });
  assert.strictEqual(L.buildRoute({ lang: '', note: '', topic: '' }), '#/');
});
const items = [
  { id: '20261001-a1', title: 'B', topic: 'db', date: '2026-10-02', lang: 'zh-Hant' },
  { id: '20261001-a2', title: 'A', topic: 'db', date: '2026-10-01', lang: 'zh-Hant' },
  {
    id: '20261001-a3',
    title: 'C',
    topic: 'db',
    date: '2026-10-03',
    lang: 'en',
    translationOf: '20261001-a2'
  },
  { id: '20261001-a4', title: 'D', topic: 'os', date: '2026-10-01' }
];
t('上下篇：同主題、依日期排序；語言篩選生效；目前這篇即使不符語言也保有位置', () => {
  assert.deepStrictEqual(
    [L.neighbors(items, '20261001-a1', '').prev.id, L.neighbors(items, '20261001-a1', '').next.id],
    ['20261001-a2', '20261001-a3']
  );
  assert.strictEqual(L.neighbors(items, '20261001-a1', 'zh').next, null);
  assert.strictEqual(L.neighbors(items, '20261001-a1', 'zh').prev.id, '20261001-a2');
  assert.deepStrictEqual(L.neighbors(items, '20261001-a4', ''), { prev: null, next: null });
  assert.deepStrictEqual(L.neighbors(items, 'nope', ''), { prev: null, next: null });
});
t('翻譯連結：雙向；看不到的目標不出現；沒指定語言的筆記在任何語言篩選下都保留', () => {
  assert.deepStrictEqual(
    L.translations(items, '20261001-a2').map(x => x.id),
    ['20261001-a3']
  );
  assert.deepStrictEqual(
    L.translations(items, '20261001-a3').map(x => x.id),
    ['20261001-a2']
  );
  assert.deepStrictEqual(L.translations(items.slice(0, 2), '20261001-a2'), []);
  assert.strictEqual(L.langOk(items[3], 'en'), true);
  assert.strictEqual(L.langOk(items[0], 'en'), false);
  assert.strictEqual(L.langOk(items[2], 'en'), true);
  assert.deepStrictEqual(
    L.filterItems(items, [], { lang: 'en', q: '' }).map(x => x.id),
    ['20261001-a3', '20261001-a4']
  );
});
console.log('\nP4 純邏輯：' + n + ' 項全部通過');
