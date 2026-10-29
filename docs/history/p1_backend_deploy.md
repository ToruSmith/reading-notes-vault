# P1 後端：部署與驗收步驟（第二版）

> 第二版新增：`getSvg`、`saveTopic`、`listIndex` 回傳主題清單、索引新增 `svgs` 欄位、SVG 拒絕內嵌點陣圖。**已部署過第一版的人請看「六、從第一版更新」。**

這一步只交付後端（Apps Script）。前端單檔 HTML 在下一步交付，所以這裡的驗收都用編輯器函式與網址完成。全程免費，不需信用卡。

## 一、建立專案

1. 用擁有者帳號開啟 https://script.google.com，新增專案，命名為 `Vault`。這是新專案，不要沿用原型專案。
2. 把下列 5 個檔案依序建立並貼上內容（左側「檔案」旁的「＋」→「指令碼」，檔名不用加 `.gs`）：
   `Code`、`Core`、`Store`、`Svg`、`Yaml`。`Yaml` 內容很長，是內嵌的 js-yaml，貼上後不要改動。
3. 上方函式下拉選 `setupVault`，按「執行」並授權。成功後 Drive 會出現 `Vault/` 資料夾（含 notes、assets、topics、boards 等）與「Vault 索引」試算表。
   - 原型建立的 `Vault/_proto` 可保留或自行刪除，不影響正式版。
4. 再執行 `devSeed`，建立示範資料（4 則筆記、1 個 SVG、1 張畫布）。執行紀錄應顯示全部 `ok`。

## 二、建立兩個部署

與原型相同：「部署」→「新增部署作業」→「網頁應用程式」。

| | 讀取部署 | 編輯部署 |
| --- | --- | --- |
| 執行身分 | 我 | 存取網頁應用程式的使用者 |
| 誰可以存取 | 任何人 | 擁有 Google 帳戶的任何人 |

每次改程式都要把兩個部署各更新一次。版本上限 200 個，請用「管理部署作業 → 編輯」更新，不要一直新增部署。

## 三、驗收清單

| # | 做法 | 預期結果 | 結果 |
| --- | --- | --- | --- |
| A1 | 無痕視窗開 `讀取網址?action=listIndex` | 只有 2 則：`20261022-j001`、`20261022-p002`；`p002` 的 `topic` 是空字串 | |
| A2 | 無痕視窗開 `讀取網址?action=getNote&id=20261022-p001` | 顯示「找不到」 | |
| A3 | 無痕視窗開 `讀取網址?action=getNote&id=20261022-p002` | 內文中對 p001 的連結變成「（未公開的筆記）」，對 j001 的連結保留 | |
| A4 | 無痕視窗開 `讀取網址?action=getBoard&topic=journal` | 沒有私人群組、沒有 `j002` 卡片；保留 `keep-me` | |
| A5 | 無痕視窗開 `讀取網址?action=getBoard&topic=db-design` | 顯示「找不到」 | |
| A6 | 無痕視窗開 `讀取網址?action=saveNote` | 顯示「無法完成」 | |
| A7 | 若你能用終端機：`READ_URL="讀取網址" bash tests/test_anonymous_p1.sh` | 全部通過、失敗 0 | |
| B1 | 編輯器先執行 `devClearIndex`，再開 Sheets 的 `index` 分頁 | 資料列清空 | |
| B2 | 執行 `devRebuild`，再看 `index` 分頁 | 4 則筆記全部回來，`tags`、`links` 正確 | |
| B3 | 在 Drive 的 `Vault/notes/` 開任一 `.md` | 是一般文字檔，不是 Google 文件；檔名是 id | |
| B4 | 開 `Vault/assets/20261022-v001.svg` 的內容 | 沒有 `<script>`、沒有 `onclick` | |
| B5 | 再執行一次 `devSeed` | 全部顯示 `ok`，Drive 的 `notes/` 沒有多出重複檔案 | |
| C1 | 無痕視窗開 `讀取網址?action=listIndex` | 多了 `topics`，只有 `journal`；看不到「資料庫設計」 | |
| C2 | 無痕視窗開 `讀取網址?action=getSvg&id=20261022-v001` | 回傳 SVG 文字（被公開筆記引用） | |
| C3 | 無痕視窗開 `讀取網址?action=getSvg&id=20261022-v002` | 顯示「找不到」（只被私人筆記引用） | |
| C4 | 編輯器執行 `devTopicDemo` | 紀錄顯示「需要確認」與 `affectedNotes: 1`；主題沒有被改動 | |

A1 到 A6 與 B1 到 B5 只需要看畫面，不必貼任何東西給我；只有看到不是預期的結果時，才告訴我是哪一項。

## 四、新增項目說明

- **SVG 引用規則**：筆記內文用標準語法 `![說明](assets/<id>.svg)` 嵌入 SVG；被公開筆記（內文或封面）或公開主題的畫布引用的 SVG 即為公開。
- **主題改公開的保護**：把私人主題改為公開時，若有未明確設定 `public` 的筆記，必須附 `confirmPublic: true`，否則不執行並回報受影響筆記數。
- **點陣圖**：SVG 含內嵌 base64 點陣圖（png、jpeg 等）一律拒絕。

## 五、本步驟刻意沒有的東西

- 前端、手機介面、搜尋、書櫃導覽、批次匯入、ZIP 匯出入、IndexedDB 草稿，這些在後續步驟。
- 主題的刪除與改名、SVG 的刪除（規劃書未列）。

## 六、從第一版更新

1. 把 `Code`、`Core`、`Store`、`Svg` 四個檔案整份換成新版（`Yaml` 不變）。
2. 執行 `setupVault`（會補上索引的 `svgs` 欄位標題，不會清掉資料）。
3. 執行 `devSeed`，再執行 `devRebuild`（讓既有筆記補上 `svgs`）。
4. 兩個部署各更新一次版本。
