// P17 純邏輯：PDF（pdfIdOf／pdfBase64）、嵌入網址自動轉換（Google 簡報／雲端硬碟）、貼上 <iframe> 嵌入碼、備份 zipKind
const assert = require('assert');
const CL = require('../canvaslogic.js');
const L = require('../logic.js');
let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('通過  ' + name);
};
t('pdfIdOf：只認 assets/日期-短碼.pdf', () => {
  assert.strictEqual(CL.pdfIdOf('assets/20261029-ab12.pdf'), '20261029-ab12');
  [
    'assets/20261029-ab12.html',
    'assets/x.pdf',
    '../assets/20261029-ab12.pdf',
    'notes/20261029-ab12.pdf',
    '',
    null
  ].forEach(f => assert.strictEqual(CL.pdfIdOf(f), null, String(f)));
});
t('pdfBase64：只收檔頭是 %PDF- 的 PDF 資料網址', () => {
  const ok = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 hi').toString('base64');
  assert.ok(CL.pdfBase64(ok));
  [
    'data:application/pdf;base64,' + Buffer.from('<html>').toString('base64'),
    'data:image/png;base64,iVBORw0KGgo=',
    'data:application/pdf;base64,@@@',
    'application/pdf',
    '',
    null
  ].forEach(x => assert.strictEqual(CL.pdfBase64(x), null, String(x)));
});
t('normalizeEmbed：Google 簡報「發布到網路」/pub → /embed（保留參數）', () => {
  assert.strictEqual(
    CL.normalizeEmbed(
      'https://docs.google.com/presentation/d/e/2PACX-1vAbC_d/pub?start=false&loop=false&delayms=3000'
    ),
    'https://docs.google.com/presentation/d/e/2PACX-1vAbC_d/embed?start=false&loop=false&delayms=3000'
  );
  assert.strictEqual(
    CL.normalizeEmbed('https://docs.google.com/presentation/d/e/2PACX-1vAbC_d/embed?start=true'),
    'https://docs.google.com/presentation/d/e/2PACX-1vAbC_d/embed?start=true',
    '已是 embed 就不動'
  );
});
t('normalizeEmbed：簡報分享連結 /edit、/view → /embed；雲端硬碟檔案 /view → /preview', () => {
  assert.strictEqual(
    CL.normalizeEmbed('https://docs.google.com/presentation/d/1AbC-d_E/edit?usp=sharing'),
    'https://docs.google.com/presentation/d/1AbC-d_E/embed?start=false&loop=false&delayms=3000'
  );
  assert.strictEqual(
    CL.normalizeEmbed('https://drive.google.com/file/d/1XyZ/view?usp=sharing'),
    'https://drive.google.com/file/d/1XyZ/preview'
  );
  assert.strictEqual(
    CL.normalizeEmbed('https://drive.google.com/open?id=1XyZ'),
    'https://drive.google.com/file/d/1XyZ/preview'
  );
});
t('normalizeEmbed：其他網址一律原樣（不誤轉）', () => {
  [
    'https://example.com/presentation/d/1AbC/edit',
    'https://docs.google.com/document/d/1AbC/edit',
    'https://docs.google.com/presentation/d/e/2PACX-1vAbC_d/embed',
    'https://a.github.io/slides/'
  ].forEach(u => assert.strictEqual(CL.normalizeEmbed(u), u));
});
t('embedUrl 會套用轉換，且仍只收 https', () => {
  assert.strictEqual(
    CL.embedUrl('https://docs.google.com/presentation/d/e/2PACX-1vAbC_d/pub'),
    'https://docs.google.com/presentation/d/e/2PACX-1vAbC_d/embed'
  );
  assert.strictEqual(CL.embedUrl('http://docs.google.com/presentation/d/e/2PACX-1v/pub'), null);
});
t('extractEmbedSrc：整段 <iframe> 嵌入碼取出 src（&amp; 還原）；一般網址原樣', () => {
  const code =
    '<iframe src="https://docs.google.com/presentation/d/e/2PACX-1vAbC_d/embed?start=false&amp;loop=false&amp;delayms=3000" frameborder="0" width="960" height="569" allowfullscreen="true"></iframe>';
  assert.strictEqual(
    CL.extractEmbedSrc(code),
    'https://docs.google.com/presentation/d/e/2PACX-1vAbC_d/embed?start=false&loop=false&delayms=3000'
  );
  assert.strictEqual(
    CL.extractEmbedSrc("<IFRAME width=1 SRC='https://a.com/x'></IFRAME>"),
    'https://a.com/x'
  );
  assert.strictEqual(CL.extractEmbedSrc('https://a.com/x'), 'https://a.com/x');
  assert.strictEqual(CL.extractEmbedSrc(''), '');
  assert.strictEqual(CL.safeUrl(CL.extractEmbedSrc('<iframe src="javascript:alert(1)"></iframe>')), null);
});
t('zipKind：.pdf 與（自動備份的）.img 可辨識；不合格的檔名仍判為不合格', () => {
  assert.deepStrictEqual(L.zipKind('assets/20261029-ab12.pdf'), { kind: 'pdf', id: '20261029-ab12' });
  assert.deepStrictEqual(L.zipKind('assets/20261029-ab12.img'), { kind: 'imgtext', id: '20261029-ab12' });
  assert.strictEqual(L.zipKind('assets/x.pdf').bad, true);
  assert.strictEqual(L.zipKind('notes/20261029-ab12.pdf').bad, true);
});
console.log('\nP17 邏輯：' + n + ' 項全部通過');
