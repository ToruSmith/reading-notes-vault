// 測試共用：.gs 檔的位置。原始檔在 backend/，合併後的 Vault_all.gs 在 dist/。
const path = require('path');
exports.gsPath = f =>
  f === 'Vault_all.gs' ? path.join(__dirname, '..', '..', 'dist', f) : path.join(__dirname, '..', f);
