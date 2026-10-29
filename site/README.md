# 讀書筆記 Vault 靜態站範本

此資料夾放進 **私人 GitHub repo 的根目錄**。`content/` 由 Apps Script 的「立即同步」自動寫入（只含訪客看得到的內容），不要手動編輯。

## 結構
- `build.js`：零相依的建置程式（需要 Node 18+），讀 `content/` 產出 `dist/`
- `site.config.json`：`siteName`、`tagline`、`defaultLang`（無 `lang` 的筆記歸此語言）、`htmlLang`
- `lib/`：Markdown 轉換與與前端相同的邏輯（`logic.js` 是 `frontend/logic.js` 的副本，前端改了要重新複製）

## Cloudflare Pages 設定
- 連接該 repo；Framework preset：None
- Build command：`node build.js`；Build output directory：`dist`
- 環境變數：`SITE_URL`（例如 `https://你的專案.pages.dev`，用於 sitemap）；必要時加 `NODE_VERSION=20`

## 本機試建
`CONTENT_DIR=./content OUT_DIR=./dist SITE_URL=https://example.pages.dev node build.js`

## 輸出
`/zh/`、`/en/` 兩棵樹（首頁、主題、筆記、畫布、搜尋）、`/assets/*.svg`、`search-index.json`、`sitemap.xml`、`robots.txt`、`_headers`（嚴格 CSP）、`404.html`；根目錄依瀏覽器語言導向。
