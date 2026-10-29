# 讀書筆記 Vault

個人讀書筆記知識庫：**Google Apps Script + Drive/Sheets 當後端、單一 HTML 當前端**，不用伺服器、不用資料庫、免費可自架。支援 Markdown 筆記、主題與分類書櫃、JSON Canvas 畫布（卡片、連線、圖片、嵌入 HTML／網頁、簡報模式）、公開／私人分離、自動備份、可選的 GitHub + Cloudflare Pages 靜態站。

> 這個 repo 是**原始碼與參考專案**：在 GitHub 上直接閱讀即可，不需要執行任何東西。想自己用，請看下方「自架」。

## 特色
- **單檔前端**：`dist/index.html`（約 650 KB，無框架），所有模組由 `frontend/modules.json` 組合。
- **權限在後端**：公開／私人由後端判斷；讀取部署以訪客身分執行，編輯部署僅擁有者可寫。
- **畫布**：相容 JSON Canvas，並以 `x-` 欄位保留額外資訊；可嵌入 HTML 檔或網頁（沙箱隔離）。
- **雙語、多主題**、閱讀／編輯模式、草稿保護、批次修改、全文搜尋。
- **50 組自動測試**（真實 Chromium + 後端離線測試），安全自查報告見 `docs/安全自查報告.md`。

## 目錄
| 路徑 | 內容 |
| --- | --- |
| `backend/` | Apps Script 原始碼與測試 |
| `frontend/` | 前端原始碼、樣式、i18n、測試 |
| `site/` | 靜態站產生器（可選） |
| `dist/` | 建置產物：`index.html`、`Vault_all.gs` |
| `docs/` | 使用說明書、維護指南、測試索引、安全自查、歷史文件 |
| `examples/` | 範例畫布與樣本 vault |

## 自架（約 15 分鐘）
完整步驟（含截圖式說明）在 [`docs/使用說明書.md`](docs/使用說明書.md)。概要：
1. 在 Google Apps Script 建立專案，貼上 `dist/Vault_all.gs`，設定 `OWNER_EMAIL`。
2. 部署兩次：「讀取」（以我身分、任何人可存取）與「編輯」（僅限擁有者）。
3. 另建一個前端 Apps Script 網頁（或任何靜態空間），貼上 `dist/index.html`。

## 開發
需要 Node 18+、`playwright`、`esbuild`：
```
node tools/test_all.js     # 重建並跑全部測試
node frontend/build.js     # 只建前端 → dist/index.html
node backend/build.js      # 只建後端 → dist/Vault_all.gs
node tools/make_release.js # 產出發布版 ZIP → release/
```
給 AI 協作者：請先讀 [`CLAUDE.md`](CLAUDE.md)。

## 授權
MIT，見 [`LICENSE`](LICENSE)。
