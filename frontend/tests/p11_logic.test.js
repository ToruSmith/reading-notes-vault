// P11 純邏輯：[[ 觸發判斷、搜尋排序、從文字推標題
const L = require('../logic.js'),
  assert = require('assert');
let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('通過  ' + name);
};
t('linkTrigger：游標前有未關閉的 [[ 才觸發；已關閉、跨行、含括號都不觸發；只往前看 80 字', () => {
  assert.deepStrictEqual(L.linkTrigger('看 [[原子', 6), { start: 2, q: '原子' });
  assert.deepStrictEqual(L.linkTrigger('[[', 2), { start: 0, q: '' });
  assert.strictEqual(L.linkTrigger('[[x]] 後', 7), null);
  assert.strictEqual(L.linkTrigger('[[a\nb', 5), null);
  assert.strictEqual(L.linkTrigger('[[a[b', 5), null);
  assert.strictEqual(L.linkTrigger('[[' + 'x'.repeat(100), 102), null);
  assert.deepStrictEqual(L.linkTrigger('[[a]] [[b', 9), { start: 6, q: 'b' });
  assert.strictEqual(L.linkTrigger('無', 99), null);
});
t('rankItems：每個詞都要出現；完全相同 > 開頭 > 標題包含 > 只在 id／標籤；同分新的在前；空字串依日期', () => {
  const it = [
    { id: '20260101-a', title: '習慣', date: '2026-01-01' },
    { id: '20260102-b', title: '原子習慣', date: '2026-01-02' },
    { id: '20260103-c', title: '習慣迴圈', date: '2026-01-03' },
    { id: '20260104-d', title: '其他', tags: ['習慣'], date: '2026-01-04' },
    { id: '20260105-e', title: '深度工作 筆記', date: '2026-01-05' }
  ];
  assert.deepStrictEqual(
    L.rankItems(it, '習慣').map(x => x.id.slice(-1)),
    ['a', 'c', 'b', 'd']
  );
  assert.deepStrictEqual(
    L.rankItems(it, '筆記 深度').map(x => x.id.slice(-1)),
    ['e']
  );
  assert.deepStrictEqual(
    L.rankItems(it, '', 2).map(x => x.id.slice(-1)),
    ['e', 'd']
  );
  assert.deepStrictEqual(L.rankItems(it, 'ZZZ'), []);
  assert.deepStrictEqual(L.rankItems([{ title: 'ABC Book' }], 'abc').length, 1, '不分大小寫');
});
t('titleFromText：第一個標題優先，否則第一行；去掉 Markdown 記號；最多 80 字；空字串回空', () => {
  assert.strictEqual(L.titleFromText('前言\n## 第二章 **重點**'), '第二章 重點');
  assert.strictEqual(L.titleFromText('\n- [連結](http://x) 與 `碼`'), '連結 與 碼');
  assert.strictEqual(L.titleFromText('x'.repeat(200)).length, 80);
  assert.strictEqual(L.titleFromText(''), '');
});
console.log('\nP11 純邏輯：' + n + ' 項全部通過');
