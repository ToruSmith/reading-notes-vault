# CLAUDE.md — 給 AI 工程師的專案說明（請先讀完這份）

## 這是什麼
「讀書筆記 Vault」：個人知識庫。**後端** = Google Apps Script（資料放 Drive／Sheets），**前端** = 單一 `index.html`（無框架、純 JS，build 時把所有模組內嵌成一檔）。筆記是 Markdown＋YAML，畫布是 JSON Canvas（自訂欄位以 `x-` 開頭）。使用者以繁體中文溝通，介面有繁中／英文。

此 repo 是**原始碼與參考專案**，不需執行也能閱讀；部署＝把 `dist/` 兩個產物貼進 Apps Script（見 `docs/使用說明書.md`）。

## 先讀哪些
1. 本檔 → 2. `docs/維護指南.md`（流程、常見的坑、各功能讀碼導覽）→ 3. 要改哪個功能就 `grep` 對應檔案。
其他：`docs/使用說明書.md`（使用者視角）、`docs/安全自查報告.md`、`docs/測試索引.md`、`docs/history/`（歷史規劃書與驗收，**僅供查證，不是現行規格**）。

## 目錄地圖
```
backend/   Apps Script 原始碼（Yaml/Svg/Core/Sync/Store/Code .gs）＋ build.js ＋ tests/（node vm + fake_store）
  Core.gs    所有動作入口 handle_；WRITE_ACTIONS_ 列出只有擁有者能呼叫的動作
  Store.gs   Drive／Sheets 存取（測試用 tests/fake_store.js 取代）
  Sync.gs    自動備份、GitHub 靜態站同步
frontend/  前端原始碼（每個功能一個 .js）＋ style.css ＋ index.src.html（骨架）＋ modules.json（載入順序，唯一來源）
  i18n/      zh-Hant.json（key=value）、en.json
  tests/     Playwright 真實瀏覽器測試 + node 單元測試；harness.js 是共用工具
site/      靜態站產生器（零相依 node；給私人 GitHub repo + Cloudflare Pages 用）；lib/logic.js 是 frontend/logic.js 的副本
tools/     test_all.js（一鍵全測）
dist/      產物：index.html、Vault_all.gs（不要手改）
docs/      文件   examples/  範例畫布與樣本 vault
```

## 指令
- `node tools/test_all.js [關鍵字]`：重建並跑全部測試（約 70 秒；需要 Node 18+、playwright、esbuild）。**目前基準：50/50 全過。**
- `node frontend/build.js`（`NO_MINIFY=1` 不壓縮以便除錯）、`node backend/build.js`。
- `node tools/make_release.js`：產出 `release/讀書筆記Vault_發布版_v<版本>.zip`（版本取自 `package.json`）。
- 格式：Prettier（`.prettierrc.json`）。

## 發布流程（給接手者）
1. 改完 → `node tools/test_all.js` 全綠。
2. 更新 `CHANGELOG.md`，並把 `package.json` 的 `version` 加一。
3. `node tools/make_release.js` 產出發布版 ZIP；`dist/` 也已更新。
4. 交給使用者：新的 `dist/index.html`、`dist/Vault_all.gs`、發布版 ZIP，並說明要重新部署哪些部分（後端有改＝兩個部署都發新版）。
5. 使用者自己上傳 GitHub、到 Releases 建立 tag 並附上 ZIP（AI 沒有使用者的 GitHub 權限，不會自行發布）。

## 不可違反的規則
1. **只改原始檔**（`frontend/*`、`backend/*.gs`），不要改 `dist/`。新增前端 JS 要列進 `frontend/modules.json`。
2. 使用者可見字串一律 `T('中文')`，並同時加進 `frontend/i18n/zh-Hant.json` 與 `en.json`；不留用不到的鍵、不留裸中文。後端回傳的錯誤字串必須是固定字串並進詞典。
3. 改完必須 `node tools/test_all.js` 全綠才算完成；新功能要附測試（照 `p9_present_e2e.test.js`）。`index.html` 體積預算 ≤ 720 KB。
4. 改 `frontend/logic.js` 後執行 `cp frontend/logic.js site/lib/logic.js`。
5. **後端改動需在「讀取」與「編輯」兩個部署都發新版本**；只改前端則只需換 `index.html`。
6. 安全底線（不得放寬）：
   - 公開與否只由後端判斷；REST GET 一律當訪客；寫入動作只有擁有者（`OWNER_EMAIL`）能呼叫。
   - 嵌入的 HTML：srcdoc + sandbox，**絕不給 `allow-same-origin`／`allow-top-navigation`**；`allow-scripts` 僅在卡片 `x-scripts===true`；只允許 https 網址；訪客只能取得被公開主題畫布引用的 HTML。
   - SVG 上傳要消毒；上傳有大小上限（`LIMITS`）。
   - 不把 token／金鑰放進前端。
7. 保留未知的 `x-` 欄位（畫布讀寫要原樣保留）。

## 已知的坑
- 無頭 Chromium 的 `page.reload()` 後 localStorage 偶爾是 null → 測試用同一 context 開新頁；程式啟動時不要寫 localStorage。
- 測試的 `hasText` 是「包含」比對，用 `^…$` 正規式。
- 含效能門檻的測試（`canvas_e2e`、`p7_e2e`）要單獨跑，平行負載會誤判（`test_all.js` 已處理）。
- 不要同時跑多個 build／test_all。
- 預設 CSS：`.cv-view.edit .cv-node:not(.sel) iframe{pointer-events:none}` 會蓋過嵌入卡的互動，已有補丁，改 CSS 時小心。

## 路線圖（未排程；先問使用者再做）
拖曳排序、卡片庫「出現在哪些畫布」索引、區域關聯圖、屬性表、版本歷史、靜態站支援圖片／HTML 卡、工具列「允許腳本」開關。

## 開新對話怎麼做
把下方「啟動提示詞」貼給 AI，並附上此 repo（或 ZIP）。完成修改後請它產出新的 `dist/` 與更新 `CHANGELOG.md`。

### 啟動提示詞
> 你是「讀書筆記 Vault」的資深全端工程師。請先閱讀 repo 根目錄的 `CLAUDE.md`，再讀 `docs/維護指南.md`，確認你理解：目錄結構、只改原始檔不改 `dist/`、i18n 規則、安全底線、兩個部署的更新規則。然後執行 `node tools/test_all.js` 確認基準為全綠，再開始我的需求：＿＿＿。要求：先說明你打算改哪些檔案；改完全部測試要通過並新增對應測試；更新 `CHANGELOG.md` 與相關文件；最後交付新的 `dist/index.html`、`dist/Vault_all.gs`，並用繁體中文簡短說明改了什麼、我需要重新部署哪些部分。
