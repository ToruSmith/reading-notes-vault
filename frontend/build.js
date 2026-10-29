// 建置：把樣式、第三方函式庫、所有前端模組與翻譯字典內嵌成單檔 dist/index.html（Apps Script 的 HtmlService 只能吃單檔）。
//   node frontend/build.js            → 縮小（只去註解與多餘空白，不改名、不改語法，行為與原始碼相同）
//   NO_MINIFY=1 node frontend/build.js → 不縮小，方便除錯
// 要新增前端檔案：加進 modules.json 即可；index.src.html 只放骨架。
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const cfg = JSON.parse(read('modules.json'));

function requireOptional(name) {
  for (const dir of ['', '/opt/npm-tools/node_modules/', '/opt/node-tools/node_modules/']) {
    try {
      return require(dir + name);
    } catch (e) {
      /* 試下一個位置 */
    }
  }
  return null;
}
const esbuild = process.env.NO_MINIFY ? null : requireOptional('esbuild');
if (!esbuild) console.warn('（未縮小：找不到 esbuild 或指定了 NO_MINIFY；功能不受影響，只是檔案較大）');

const minifyJs = code =>
  esbuild
    ? esbuild.transformSync(code, {
        minifyWhitespace: true,
        legalComments: 'none',
        charset: 'utf8',
        target: 'es2017'
      }).code
    : code;
const minifyCss = code =>
  esbuild
    ? esbuild.transformSync(code, { loader: 'css', minifyWhitespace: true, charset: 'utf8' }).code
    : code;

// 內嵌進 <script> 之前先擋掉 "</script"，否則會提早結束標籤
function inlineScript(name, code) {
  if (/<\/script/i.test(code)) throw new Error(name + ' 含有 </script，無法內嵌');
  return '<script>' + code + '</script>';
}

// 翻譯字典：原文就是譯文的項目不必內嵌（查不到時本來就回傳原文）
const dict = {};
fs.readdirSync(path.join(__dirname, 'i18n'))
  .filter(f => /\.json$/.test(f))
  .forEach(f => {
    dict[f.replace(/\.json$/, '')] = JSON.parse(read('i18n/' + f));
  });
Object.keys(dict).forEach(lang => {
  Object.keys(dict[lang]).forEach(k => {
    if (dict[lang][k] === k) delete dict[lang][k];
  });
});
const dictJson = JSON.stringify(dict).replace(/</g, '\\u003c'); // 避免字典內出現 </script

const slots = {
  '<!--__VENDOR__-->': cfg.vendor.map(f => inlineScript(f, read(f))).join('\n'),
  '<!--__MODULES__-->': cfg.modules.map(f => inlineScript(f, minifyJs(read(f)))).join('\n'),
  '/*__CSS__*/': minifyCss(read('style.css')),
  '/*__I18N__*/': dictJson
};
let html = read('index.src.html');
for (const key of Object.keys(slots)) {
  if (!html.includes(key)) throw new Error('index.src.html 找不到佔位：' + key);
  html = html.split(key).join(slots[key]); // split/join：避免取代字串裡的 $& 被特殊解讀
}

const out = path.join(__dirname, '..', 'dist');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('已產生 dist/index.html（' + Math.round(Buffer.byteLength(html) / 1024) + ' KB）');
