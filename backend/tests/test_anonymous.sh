#!/usr/bin/env bash
# 以「未登入」身分遍歷讀取部署的所有端點，驗證沒有任何私人內容外洩（規劃書 6.6 驗收）。
# 前提：已在編輯器執行過 setupVault 與 devSeed。
# 用法：READ_URL="https://script.google.com/macros/s/xxxx/exec" bash test_anonymous_p1.sh
set -u
: "${READ_URL:?請先設定 READ_URL（讀取部署的網址）}"
pass=0; fail=0
ok()  { echo "通過  $1"; pass=$((pass+1)); }
bad() { echo "失敗  $1"; fail=$((fail+1)); }
has() { echo "$1" | grep -q -- "$2"; }
get()  { curl -sL "$READ_URL?action=$1${2:+&$2}"; }
post() { curl -sL -H 'Content-Type: text/plain' -d "$1" "$READ_URL"; }   # 不加 -X：轉址後 curl 改用 GET，GAS 需要如此

LIST=$(get listIndex)
has "$LIST" '20261022-j001' && ok "列表含公開的日記" || bad "列表缺少公開的日記"
has "$LIST" '20261022-p002' && ok "列表含私人主題內的公開筆記" || bad "列表缺少私人主題內的公開筆記"

ALL="$LIST"
for id in 20261022-p001 20261022-p002 20261022-j001 20261022-j002 20261022-zzzz not-an-id; do ALL="$ALL$(get getNote "id=$id")"; done
for tp in db-design journal nope; do ALL="$ALL$(get getBoard "topic=$tp")"; done
for sid in 20261022-v001 20261022-v002 20261022-zzzz; do ALL="$ALL$(get getSvg "id=$sid")"; done
ALL="$ALL$(get whoami)"

for w in 私人筆記標題 SECRET-BODY 日記（私人） 20261022-p001 20261022-j002 20261022-v002 driveFileId 資料庫設計 db-design '\.md'; do
  has "$ALL" "$w" && bad "回應含私人內容：$w" || ok "回應不含：$w"
done

P=$(get getNote id=20261022-p001); N=$(get getNote id=20261022-zzzz)
[ "$P" = "$N" ] && ok "私人筆記與不存在的回應完全相同" || bad "私人筆記與不存在的回應不同"
has "$(get getNote id=20261022-p002)" '未公開的筆記' && ok "公開筆記內的私人連結已轉成純文字" || bad "私人連結未轉換"
B=$(get getBoard topic=journal)
has "$B" 'keep-me' && ok "公開畫布保留 x- 自訂欄位" || bad "公開畫布遺失 x- 自訂欄位"
has "$B" '20261022-j002' && bad "公開畫布含私人卡片" || ok "公開畫布不含私人卡片"
has "$(get getSvg id=20261022-v001)" '<svg' && ok "被公開筆記引用的 SVG 讀得到" || bad "公開 SVG 讀不到"
[ "$(get getSvg id=20261022-v002)" = "$(get getSvg id=20261022-zzzz)" ] && ok "私人 SVG 與不存在的回應完全相同" || bad "私人 SVG 與不存在的回應不同"
has "$LIST" '"topics"' && ok "listIndex 含主題清單" || bad "listIndex 缺主題清單"
has "$LIST" '"id":"journal"' && ok "主題清單含公開主題 journal" || bad "主題清單缺 journal"
has "$(get getBoard topic=db-design)" '找不到' && ok "私人主題的畫布回「找不到」" || bad "私人主題的畫布外洩"

for body in '{"action":"saveTopic","id":"x","title":"x"}' '{"action":"saveNote","text":"---\ntitle: hacked\n---\n"}' '{"action":"deleteNote","id":"20261022-j001"}' '{"action":"rebuildIndex"}' '{"action":"uploadSvg","text":"<svg/>"}' '{"action":"saveBoard","topic":"journal","board":{}}'; do
  R=$(post "$body"); has "$R" '"ok":true' && bad "匿名寫入未被拒：$body" || ok "匿名寫入被拒：${body:0:30}"
done
for a in saveNote deleteNote rebuildIndex uploadSvg saveBoard saveTopic; do
  R=$(get "$a" 'id=20261022-j001'); has "$R" '"ok":true' && bad "匿名 GET 寫入未被拒：$a" || ok "匿名 GET 寫入被拒：$a"
done
echo; echo "通過 $pass　失敗 $fail"; [ "$fail" -eq 0 ]
