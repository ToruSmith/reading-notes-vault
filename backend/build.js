// 把 6 個 .gs 合併成單一檔案 Vault_all.gs（貼一次就好，避免檔案配對錯誤）
const fs = require('fs'),
  path = require('path');
const root = __dirname,
  out = path.join(__dirname, '..', 'dist');
const order = ['Yaml.gs', 'Svg.gs', 'Core.gs', 'Sync.gs', 'Store.gs', 'Code.gs'];
const parts = order.map(
  f =>
    '// ═══════════════ ' +
    f +
    ' ═══════════════\n' +
    fs.readFileSync(path.join(root, f), 'utf8').replace(/\s+$/, '') +
    '\n;\n'
);
const head =
  '/**\n * Vault_all.gs — 讀書筆記 Vault 後端，由 Yaml、Svg、Core、Sync、Store、Code 六個檔案合併而成。\n * 專案裡只保留這一個檔案；不要同時保留其他 .gs 檔，否則函式會重複定義。\n * 請勿直接修改，修改請改原始檔後重新合併。\n */\n';
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'Vault_all.gs'), head + parts.join('\n'));
console.log(
  '已產生 Vault_all.gs（' + Math.round(fs.statSync(path.join(out, 'Vault_all.gs')).size / 1024) + ' KB）'
);
