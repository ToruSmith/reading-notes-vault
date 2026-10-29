// P15 純邏輯：嵌入卡片（htmlIdOf／embedUrl／embedDoc／zipKind 的 html）
const assert = require('assert');
const CL = require('../canvaslogic.js');
const L = require('../logic.js');
let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('通過  ' + name);
};
t('htmlIdOf：只認 assets/日期-短碼.html', () => {
  assert.strictEqual(CL.htmlIdOf('assets/20261029-ab12.html'), '20261029-ab12');
  [
    'assets/20261029-ab12.htm',
    'assets/20261029-ab12.img',
    '../assets/20261029-ab12.html',
    'assets/x.html',
    'notes/20261029-ab12.html',
    '',
    null
  ].forEach(f => assert.strictEqual(CL.htmlIdOf(f), null, String(f)));
});
t('embedUrl：只收 https', () => {
  assert.strictEqual(CL.embedUrl('https://a.github.io/x/'), 'https://a.github.io/x/');
  ['http://a.com', 'javascript:alert(1)', 'data:text/html,hi', 'ftp://a.com', 'https://a.com/ b', ''].forEach(
    u => assert.strictEqual(CL.embedUrl(u), null, u)
  );
});
t(
  'embedDoc：CSP 插在 <head> 之後；沒有 head 時補在 doctype 之後；都沒有就補整個前綴；腳本開關改變 CSP',
  () => {
    const a = CL.embedDoc('<!doctype html><html><head><title>x</title></head><body>b</body></html>', false);
    assert.ok(
      a.indexOf('<head><meta http-equiv="Content-Security-Policy"') > 0 && a.includes('<title>x</title>')
    );
    assert.ok(!a.includes('script-src') && a.includes("default-src 'none'"));
    const b = CL.embedDoc('<!DOCTYPE html><p>hi</p>', true);
    assert.ok(
      b.startsWith('<!DOCTYPE html><meta') &&
        b.includes("script-src 'unsafe-inline' https:") &&
        b.endsWith('<p>hi</p>')
    );
    const c = CL.embedDoc('<h1>裸片段</h1>', false);
    assert.ok(c.startsWith('<!doctype html><meta') && c.endsWith('<h1>裸片段</h1>'));
    assert.ok(CL.embedDoc('<head lang=en>x', false).startsWith('<head lang=en><meta'));
  }
);
t('zipKind：備份 ZIP 裡的 assets/*.html 是 html 類，其他副檔名仍然不合法', () => {
  assert.deepStrictEqual(L.zipKind('assets/20261029-ab12.html'), { kind: 'html', id: '20261029-ab12' });
  assert.strictEqual(L.zipKind('assets/20261029-ab12.htm').kind, null);
});
t(
  'openerDoc：外殼頁只有一個沙箱 iframe；srcdoc 的引號與 < 都被跳脫；不給 allow-same-origin；腳本開關只影響 allow-scripts',
  () => {
    const evil = '<p title="x">"></iframe><script>top.location=1</script></p>';
    const a = CL.openerDoc(evil, 'a"b<c', false);
    assert.ok(!/allow-scripts|allow-same-origin/.test(a));
    assert.strictEqual((a.match(/<iframe/g) || []).length, 1);
    assert.ok(!a.includes('<script') && !a.includes('a"b<c'));
    assert.ok(/srcdoc="[^"]*"/.test(a));
    const b = CL.openerDoc('<p>x</p>', 'n', true);
    assert.ok(/allow-scripts/.test(b) && !/allow-same-origin/.test(b));
  }
);
t(
  'embedSandbox：靜態模式沒有腳本／下載／彈窗；腳本模式才有 allow-scripts、allow-downloads、allow-modals；永遠沒有 allow-same-origin 與頂層導覽',
  () => {
    const off = CL.embedSandbox(false),
      on = CL.embedSandbox(true);
    assert.ok(!/scripts|downloads|modals/.test(off));
    assert.ok(/allow-scripts/.test(on) && /allow-downloads/.test(on) && /allow-modals/.test(on));
    [off, on].forEach(x => assert.ok(!/same-origin|top-navigation/.test(x), x));
  }
);
console.log('\nP15 邏輯：' + n + ' 項全部通過');
