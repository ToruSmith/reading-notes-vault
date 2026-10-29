# 測試索引

> 由各測試檔第一行註解整理。執行：`node tools/test_all.js [關鍵字]`。

| 測試檔 | 說明 |
| --- | --- |
| `backend/tests/p1.test.js` | P1 後端離線測試：以假儲存層驗證 Core.gs / Svg.gs 的行為。真實 Drive、Sheets 行為需部署後手動驗收。 |
| `backend/tests/p14_order.test.js` | P14 後端離線測試：書櫃與分類頁簽的順序（權限、驗證、訪客不外洩私人分類） |
| `backend/tests/p15_html.test.js` | P15 後端離線測試：HTML 卡片（上傳驗證、權限、公開規則、匯出、備份清單） |
| `backend/tests/p16_cleanup.test.js` | P16 後端離線測試：清理未使用檔案（跨畫布判斷、7 天寬限、權限、只移垃圾桶、過期清單不誤刪） |
| `backend/tests/p5_sync.test.js` | P5 後端離線測試：自動備份（分段、核對、保留份數、還原一致）與 GitHub 同步（差異、只送公開、不外洩 token） |
| `backend/tests/p6_preview.test.js` | P6 後端離線測試：連結預覽（網址檢查、解析、權限、不被利用去連內網）、刪除畫布 |
| `backend/tests/p7_image.test.js` | P7b-2 後端離線測試：圖片卡（上傳驗證、權限、公開規則、匯出、備份） |
| `backend/tests/security_audit.test.js` | P4 安全自查：匿名存取私人內容、上傳端點濫用、惡意 SVG。結果同時寫成報告（docs/SECURITY_AUDIT.md）。 |
| `frontend/tests/build.test.js` | 建置清單檢查：modules.json 與資料夾一致，避免「新增了檔案卻沒被內嵌／沒被翻譯檢查掃到」。 |
| `frontend/tests/canvas.test.js` | 畫布純邏輯測試（node）。介面行為由 canvas_e2e.test.js 在真實瀏覽器驗證。 |
| `frontend/tests/canvas_e2e.test.js` | 畫布端對端測試：真實 Chromium ＋ 真實的 build 後 index.html ＋ 真實的後端邏輯（Core.gs 跑在假儲存層上）。 |
| `frontend/tests/i18n.test.js` | 雙語、主題、檢視的邏輯測試（node）：漏翻檢查、字典完整性、主題對比、圖庫日曆邏輯 |
| `frontend/tests/logic.test.js` | 前端純邏輯測試（node）。畫面（DOM）部分無法在這裡測，需由使用者目視確認。 |
| `frontend/tests/p10_fullbar_e2e.test.js` | 全螢幕工具列收成下拉；橫向手機（矮螢幕）畫布夠高；閱讀模式／訪客的畫布佔滿寬度 |
| `frontend/tests/p11_logic.test.js` | P11 純邏輯：[[ 觸發判斷、搜尋排序、從文字推標題 |
| `frontend/tests/p11_obsidian_e2e.test.js` | P11 端對端：[[ 自動完成（含建立新筆記）、Ctrl+K 快速切換、編輯即時預覽、畫布文字卡轉筆記 |
| `frontend/tests/p12_layout_e2e.test.js` | P12 版面：寬螢幕左右擴張、書櫃收成側邊小條（可浮動展開、可固定）、手機版不受影響 |
| `frontend/tests/p13_drafts_read_e2e.test.js` | P13：未編輯不留草稿、新筆記只留一份、過期自動清；閱讀頁置中與字級；書櫃按鈕 |
| `frontend/tests/p14_cats_e2e.test.js` | P14：首頁「分類」頁簽（依順序列出、可收合、擁有者調整順序並同步到書櫃；訪客只讀且不見私人分類） |
| `frontend/tests/p14_logic.test.js` | P14 純邏輯：書櫃／分類頁簽的順序（buildShelf 的 order、moveCategory、moveTopic） |
| `frontend/tests/p15_embed_e2e.test.js` | P15：畫布嵌入卡片（HTML 檔：預設不執行腳本、可開腳本、最多同時 3 個；嵌入網頁：只收 https；選檔上傳；訪客可看） |
| `frontend/tests/p15_logic.test.js` | P15 純邏輯：嵌入卡片（htmlIdOf／embedUrl／embedDoc／zipKind 的 html） |
| `frontend/tests/p16_cleanup_e2e.test.js` | P16：設定頁「清理未使用檔案」（掃描、預設全選、取消勾選、移到垃圾桶；訪客看不到） |
| `frontend/tests/p35_e2e.test.js` | P3.5 端對端：沉浸閱讀、刪除筆記、主題管理 |
| `frontend/tests/p36_e2e.test.js` | P3.6 端對端：多選與批次修改主題／公開 |
| `frontend/tests/p37_e2e.test.js` | 設定疊在目前畫面上：從筆記、編輯器、沉浸閱讀開設定，關掉後回到原處 |
| `frontend/tests/p3a_e2e.test.js` | P3 批次一端對端：目錄、語法高亮、全文索引快取 |
| `frontend/tests/p3b_e2e.test.js` | P3 批次二端對端：雙語、主題、圖庫、日曆、三種檢視切換 |
| `frontend/tests/p4_e2e.test.js` | P4 端對端：公開閱讀、語言、路由、發布檢查（個資掃描）、批次刪除、手機版 |
| `frontend/tests/p4_logic.test.js` | P4 純邏輯：個資掃描、路由、上下篇、翻譯連結、語言篩選 |
| `frontend/tests/p4b_e2e.test.js` | P4.1 端對端：畫布全螢幕、單擊放大／雙擊開筆記、手機表頭選單 |
| `frontend/tests/p5_e2e.test.js` | P5 端對端：同步與備份頁（擁有者專用） |
| `frontend/tests/p6_e2e.test.js` | 主題公開標示與刪除畫布：真實 Chromium ＋ 真實 build 後 index.html ＋ 真實後端邏輯（假儲存層）。 |
| `frontend/tests/p6_logic.test.js` | P6 純邏輯：預覽資料檢查、圖片網址判斷、自動排版 |
| `frontend/tests/p6b_e2e.test.js` | P6 畫布豐富化端對端：筆記卡 meta／封面、連結預覽、縮圖開關（預設不連外）、SVG 卡、自動排版、訪客權限、惡意匯入資料 |
| `frontend/tests/p6c_e2e.test.js` | 分享連結（主題、畫布）、直接開啟畫布的連結、從全螢幕畫布開筆記的版面 |
| `frontend/tests/p7_e2e.test.js` | P7a 端對端：工具列分組選單、對齊吸附、對齊／等距、複製貼上、畫布內搜尋、體積與效能預算 |
| `frontend/tests/p7_logic.test.js` | P7 純邏輯：對齊吸附、對齊與等距、複製貼上、搜尋 |
| `frontend/tests/p7b_e2e.test.js` | P7b 端對端：文字大小、邊緣拉線（點一下／拖到卡片／拖到空白）、手繪存成 SVG 卡 |
| `frontend/tests/p7c_e2e.test.js` | P7b-2 端對端：圖片卡（選檔上傳、儲存、訪客檢視、拒絕非圖片）、連線文字大小與位置 |
| `frontend/tests/p8_mode_e2e.test.js` | 閱讀／編輯模式：擁有者預設閱讀（沒有任何編輯入口、畫布不能動）；切換後才能編輯；選擇會記住；畫布有未存修改時切回閱讀要確認 |
| `frontend/tests/p9_present_e2e.test.js` | P7c 端對端：簡報模式、匯出 SVG／PNG、群組轉大綱筆記、筆記頁「出現在哪些畫布」 |
| `frontend/tests/ui_smoke.test.js` | 介面冒煙測試：用極簡假 DOM 執行 ui.js，檢查流程不出錯、畫面文字正確。不能取代真實瀏覽器的目視確認。 |
| `site/tests/site.test.js` | 靜態站：與後端內容一致、不含私人內容、連結不失效、跳脫與 CSP、雙語、決定性 |
| `site/tests/site_e2e.test.js` | 靜態站瀏覽器測試：套用 _headers 的 CSP 後，搜尋、畫布平移縮放、語言切換、手機版面都要正常，且 CSP 不得擋到自己的資源 |
