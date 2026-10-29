// P14 純邏輯：書櫃／分類頁簽的順序（buildShelf 的 order、moveCategory、moveTopic）
const assert = require('assert');
const L = require('../logic.js');
let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('通過  ' + name);
};
const topics = [
  { id: 'a', title: '甲', category: '學習' },
  { id: 'b', title: '乙', category: '學習' },
  { id: 'c', title: '丙', category: '學習' },
  { id: 'x', title: '日記', category: '生活' },
  { id: 'z', title: '雜', category: '' }
];
const shelf = o => L.buildShelf([], topics, o).categories;
const names = cs => cs.map(c => c.name),
  ids = c => c.topics.map(x => x.id);

t('沒有順序：維持原本的標題字典序，未分類最後', () => {
  const cs = shelf();
  assert.strictEqual(names(cs).at(-1), '');
  assert.deepStrictEqual(
    ids(cs.find(c => c.name === '學習'))
      .slice()
      .sort(),
    ['a', 'b', 'c']
  );
});
t('有順序：分類與主題照清單排；沒列到的排在後面；未分類永遠最後', () => {
  const cs = shelf({ cats: ['生活', '學習'], topics: ['c', 'a'] });
  assert.deepStrictEqual(names(cs), ['生活', '學習', '']);
  assert.deepStrictEqual(ids(cs[1]), ['c', 'a', 'b']);
  assert.deepStrictEqual(
    names(shelf({ cats: ['不存在'], topics: ['沒這個'] })).length,
    3,
    '清單裡有不存在的項目不影響'
  );
});
t('moveCategory：往前後移一格、到頭回傳 null、未分類不能移，且不改原資料', () => {
  const cs = shelf({ cats: ['學習', '生活'], topics: [] }),
    before = JSON.stringify(cs);
  const o = L.moveCategory(cs, '生活', -1);
  assert.deepStrictEqual(o.cats, ['生活', '學習']);
  assert.strictEqual(L.moveCategory(cs, '學習', -1), null);
  assert.strictEqual(L.moveCategory(cs, '生活', 1), null);
  assert.strictEqual(L.moveCategory(cs, '', -1), null);
  assert.strictEqual(JSON.stringify(cs), before);
});
t('moveTopic：只在所屬分類內移動；結果的 topics 涵蓋所有主題；套回 buildShelf 順序正確', () => {
  const cs = shelf({ cats: ['學習', '生活'], topics: ['a', 'b', 'c', 'x', 'z'] });
  const o = L.moveTopic(cs, 'c', -1);
  assert.deepStrictEqual(o.topics, ['a', 'c', 'b', 'x', 'z']);
  assert.deepStrictEqual(ids(shelf(o).find(c => c.name === '學習')), ['a', 'c', 'b']);
  assert.strictEqual(L.moveTopic(cs, 'a', -1), null);
  assert.strictEqual(L.moveTopic(cs, 'x', 1), null);
  assert.strictEqual(L.moveTopic(cs, '沒有', 1), null);
});
console.log('\nP14 邏輯：' + n + ' 項全部通過');
