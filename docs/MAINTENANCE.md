# 維護指南

## 每次改完程式，照這個順序
1. 改原始碼（`frontend/*.js`、`frontend/style.css`、`backend/*.gs`），不要直接改 `dist/index.html`／`dist/Vault_all.gs`（它們是產物）。
2. 新增介面文字一律用 `T('中文')`，並在 `frontend/i18n/zh-Hant.json`（鍵＝值）與 `en.json`（英文）各加一筆；新增的 JS 檔只要加進 `frontend/modules.json` 的 `modules`（載入順序、i18n 掃描、建置都讀這一份；`build.test.js` 會檢查有沒有漏列）。
3. 跑 `node tools/test_all.js`（約 1 分鐘）。它會先重建 `index.html` 與 `Vault_all.gs`，再平行跑後端、前端、靜態站全部測試（`dist/` 是產物，已隨 repo 附上最新版），最後列出失敗項目的最後 25 行輸出。
   - 只想跑部分：`node tools/test_all.js canvas p11`（檔名含關鍵字）。
   - 含效能門檻的測試（`canvas_e2e`、`p7_e2e`）會自動排在最後單獨跑，避免平行負載造成誤判。
4. 全綠後，把 `dist/index.html` 貼進／換掉前端，`dist/Vault_all.gs` 貼進 Apps Script；**後端有改時，讀取與編輯兩個部署都要發新版本**。

5. 要發布：更新 `CHANGELOG.md`、`package.json` 的 `version`，執行 `node tools/make_release.js`，得到 `release/` 底下的發布版 ZIP。

## 常見的坑
| 現象 | 原因／處理 |
| --- | --- |
| i18n 測試說「字典沒有多餘的鍵」 | 刪功能後要把字典裡不用的鍵一起刪 |
| 瀏覽器測試找不到按鈕 | `hasText` 是「包含」比對（「圖片」會先命中「SVG 圖片」）；用 `^…$` 正規式 |
| 測試改了介面但行為沒變 | 忘了 `node frontend/build.js`；`test_all.js` 會自動重建 |
| 擁有者看不到編輯入口 | 預設是閱讀模式；測試環境會把 `vault-editmode` 設成 1，要測閱讀模式用 `newPage(..., { reading: true })` |
| 後端訊息要翻譯 | 後端回傳的錯誤字串必須是固定字串（不要串變數），並加進詞典 |
| `index.html` 太大 | 建置已用 esbuild 去掉註解與空白（找不到 esbuild 會照原樣內嵌，只是大一點）；體積預算 720 KB 在 `p7_e2e` 檢查；要看未縮小版本用 `NO_MINIFY=1 node frontend/build.js` |

## 架構一頁版
- 後端 `backend/`：Apps Script，`Core.gs` 的 `handle_` 是所有動作入口；`WRITE_ACTIONS_` 列出只有擁有者能呼叫的動作；`Store.gs` 是 Drive／Sheets 存取，測試用 `tests/fake_store.js` 取代。
- 前端 `frontend/`：`ui.js`（主畫面）、`edit.js`（編輯器）、`quick.js`（`[[` 自動完成、Ctrl+K）、`canvas*.js`（畫布；`canvas.js` 是核心，其餘透過 `VaultUI.cv` 這個小介面溝通）、`canvaslogic.js`／`canvasops.js`（畫布純函式，單元測試最多）。
- 資料：筆記是 Markdown＋YAML；畫布是 JSON Canvas，自訂欄位以 `x-` 開頭並原樣保留（`x-parent`、`x-collapsed`、`x-style`、`x-fontsize`、`x-labelsize`、`x-labelpos`、`x-preview`）；圖片卡是 `assets/<id>.img`（資料網址文字檔）。
- 權限：REST GET 一律當訪客；公開與否只由後端判斷；前端的「閱讀／編輯」只是介面保護。

## 給 Claude 的讀碼導覽
- 單檔都不大（最大 `canvas.js` 約 700 行）；找東西先 `grep` 函式名，不必整檔讀。`index.src.html` 只有骨架與 `/*__NAME__*/` 佔位，`frontend/modules.json` 決定拼接順序；發佈檔 `dist/index.html` 是壓縮過的，**永遠只改 `frontend/` 原始檔**，除錯時用 `NO_MINIFY=1 node frontend/build.js`。
- 慣例：每段功能用 `/* ───── 標題 ───── */` 分段；JSDoc 一句話說明「做什麼」；使用者可見字串一律 `T('中文')`，中文就是詞典 key。
- 草稿（`edit.js`）：`Drafts`＝IndexedDB 包裝（get/put/del/all/prune/clear）；`dirty()` 比對 `E.orig` 快照，未編輯不存；新筆記草稿以 `isNew` 標記，`findDraft` 只還原最近一份；啟動時 `prune(30)`。
- 閱讀版型：CSS 變數 `--fs`（字級倍率，`ui.js` 的 `fontScale/setFontScale`）與 `--col`（欄寬，訪客版 40rem）；`#main:has(> .md)` 讓標題到內文同欄置中。
- 書櫃側條樣式集中在 `style.css` 的「書櫃側條」段。

- 順序（P14）：後端 `Core.gs` 的 `saveOrder_`／`readOrder_`（存 `VAULT_ORDER`，訪客版會過濾掉私人分類與主題）；前端 `logic.js` 的 `buildShelf(items, topics, order)`、`moveCategory`、`moveTopic` 是純函式（`p14_logic.test.js`）；畫面在 `categories.js`；`views.js` 的 `U.viewMode()` 決定實際檢視（有篩選時「分類」退回列表）。
- 嵌入（P15）：後端 `Core.gs` 的 `uploadHtml_／getHtml_／exportHtml_`（存 `assets/<id>.html`，內容不改寫，大小上限 `LIMITS.HTML_BYTES`；公開判斷與圖片共用 `isAssetReferencedPublic_`）；前端 `canvas_embed.js`（`K.embed`，由 `canvas.js` 的 `fillContent`、`canvas_insp.js`、`canvas_tools.js` 呼叫）；純函式 `htmlIdOf／embedUrl／embedDoc` 在 `canvaslogic.js`。沙箱值集中在 `CL.embedSandbox(scripts)`（卡片內與新分頁共用）。**安全底線：srcdoc＋sandbox 不給 allow-same-origin，腳本只有 `x-scripts: true` 才開；不要放寬。**

- 靜態站 `site/lib/logic.js` 是 `frontend/logic.js` 的副本：改了 logic.js 要 `cp frontend/logic.js site/lib/logic.js`（`build.test.js` 會檢查）。
- 程式碼格式：Prettier（`.prettierrc.json`，printWidth 110）；改完可 `npx prettier --write "frontend/*.js" "backend/*.gs"`。

- 清理（P16）：後端 `Core.gs` 的 `unusedAssets_／scanAssets_／trashAssets_`（掃全部 `boards/` 的 file 卡；`ASSET_GRACE_DAYS=7`；只 `trash`，不永久刪除；移除時重算）；前端 `cleanup.js`（`U.cleanupSection`，由 `settings.js` 掛上）。

## 加一個新功能的最短路徑
純邏輯寫進 `logic.js` 或 `canvasops.js`（有 Node 單元測試）→ 畫面接在對應檔案 → 詞典 → 寫一個 `pNN_xxx_e2e.test.js`（照 `p9_present_e2e.test.js` 的樣子，用 `makeEnv`／`newPage`）→ `node tools/test_all.js`。
