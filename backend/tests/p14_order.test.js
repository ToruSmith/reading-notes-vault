// P14 後端離線測試：書櫃與分類頁簽的順序（權限、驗證、訪客不外洩私人分類）
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

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);

function seed() {
  const s = makeStore();
  s.saveTopic({ id: 'a', title: '甲', category: '學習', defaultPublic: true });
  s.saveTopic({ id: 'b', title: '乙', category: '學習', defaultPublic: true });
  s.saveTopic({ id: 'sec', title: '祕密', category: '私密分類', defaultPublic: false });
  return s;
}
t('擁有者可存順序，重新讀索引會帶回來；沒存過是空清單', () => {
  const s = seed();
  assert.deepStrictEqual(H('listIndex', {}, OWNER, 'RUN', s).order, { cats: [], topics: [] });
  assert.ok(H('saveOrder', { cats: ['私密分類', '學習'], topics: ['b', 'a', 'sec'] }, OWNER, 'RUN', s).ok);
  assert.deepStrictEqual(H('listIndex', {}, OWNER, 'RUN', s).order, {
    cats: ['私密分類', '學習'],
    topics: ['b', 'a', 'sec']
  });
});
t('訪客不能存；訪客只看到公開主題與其分類的順序（私人分類名稱不外洩）', () => {
  const s = seed();
  assert.strictEqual(H('saveOrder', { cats: ['x'], topics: [] }, VISITOR, 'RUN', s).ok, false);
  H('saveOrder', { cats: ['私密分類', '學習'], topics: ['sec', 'b', 'a'] }, OWNER, 'RUN', s);
  const o = H('listIndex', {}, VISITOR, 'RUN', s).order;
  assert.deepStrictEqual(o, { cats: ['學習'], topics: ['b', 'a'] });
  assert.ok(!JSON.stringify(o).includes('私密') && !JSON.stringify(o).includes('sec'));
});
t('格式不對整份拒絕且不改舊值：非陣列、空字串、過長、壞 id、超量', () => {
  const s = seed();
  H('saveOrder', { cats: ['學習'], topics: ['a'] }, OWNER, 'RUN', s);
  [
    { cats: 'x', topics: [] },
    { cats: [''], topics: [] },
    { cats: ['x'.repeat(51)], topics: [] },
    { cats: [], topics: ['Bad Id!'] },
    { cats: [5], topics: [] },
    { cats: new Array(201).fill('c'), topics: [] },
    { cats: [], topics: new Array(401).fill('a') },
    {}
  ].forEach(p =>
    assert.strictEqual(H('saveOrder', p, OWNER, 'RUN', s).ok, false, JSON.stringify(p).slice(0, 40))
  );
  assert.deepStrictEqual(H('listIndex', {}, OWNER, 'RUN', s).order, { cats: ['學習'], topics: ['a'] });
});
t('儲存的內容損壞時當作沒有順序（不會讓索引壞掉）', () => {
  const s = seed();
  s.setProp('VAULT_ORDER', '{壞掉');
  assert.deepStrictEqual(H('listIndex', {}, OWNER, 'RUN', s).order, { cats: [], topics: [] });
});
console.log('\nP14 後端：' + n + ' 項全部通過');
