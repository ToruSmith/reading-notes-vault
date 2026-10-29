import json, os, zipfile, sys, shutil
import svgs

TOPIC = 'coffee-journey'
DATE = '2026-10-29'
NID = {k: f'20261029-cfa{i}' for i, k in enumerate(['origin', 'process', 'roast', 'brew', 'taste'], 1)}
SID = {k: f'20261029-cfs{i}' for i, k in enumerate(['altitude', 'cherry', 'roast', 'extract', 'wheel'], 1)}
SVGKEY = {'origin': 'altitude', 'process': 'cherry', 'roast': 'roast', 'brew': 'extract', 'taste': 'wheel'}

def note(key, title, tags, body):
    fm = f'---\nid: {NID[key]}\ntitle: {title}\ntopic: {TOPIC}\ndate: {DATE}\ntags: [{", ".join(tags)}]\nlang: zh-Hant\n---\n'
    return fm + body.strip() + '\n'

L = NID
NOTES = {
'origin': note('origin', '① 產地與品種：咖啡長在哪裡', ['咖啡', '產地', '品種'], f'''
# 產地與品種：咖啡長在哪裡

咖啡樹屬於茜草科咖啡屬（*Coffea*）。我們喝到的咖啡，絕大多數來自兩個品種：

| | 阿拉比卡 Arabica | 羅布斯塔 Robusta |
| --- | --- | --- |
| 適合海拔 | 約 900–2,000 m | 約 0–800 m |
| 咖啡因 | 約 1.2–1.5% | 約 2.2–2.7% |
| 風味 | 酸質明亮、層次細緻 | 苦、厚實、穀物與泥土感 |
| 性格 | 嬌貴，怕熱怕病 | 耐熱抗病，產量高 |
| 常見用途 | 精品咖啡、單品 | 即溶、義式配方 |

## 咖啡帶
咖啡主要種在**南北回歸線之間**（約北緯 25° 到南緯 25°）的高地：中南美洲、非洲東部、東南亞與亞洲產區。緯度越高，適合種植的海拔通常越低。

![咖啡樹的高度帶](assets/{SID['altitude']}.svg)

## 為什麼海拔重要？
常見的說法是：海拔高、日夜溫差大，果實成熟得慢，糖分與酸質累積得更多，風味更密。這是**經驗法則，不是絕對**——品種、土壤、栽培與處理法一樣會改變結果。

## 下一站
採收之後，果實要先經過處理，才會變成生豆：見 [[{L['process']}]]。
'''),
'process': note('process', '② 處理法：果實的第二次命運', ['咖啡', '處理法', '水洗', '日曬'], f'''
# 處理法：果實的第二次命運

咖啡豆其實是**果實裡的種子**。採收後，要把外果皮、果肉、黏膜拿掉，再乾燥到含水率約 10–12%，才是可以保存、運送的**生豆**。

![咖啡櫻桃的剖面](assets/{SID['cherry']}.svg)

## 三種常見處理法
- **水洗（Washed）**：先去皮去果肉，再發酵、洗掉黏膜，最後乾燥。風味**乾淨、明亮**，產地特色清楚。
- **日曬／自然（Natural）**：整顆果實直接曬乾，最後才脫殼。**果香濃、甜感重、口感厚**，但變化也較大。
- **蜜處理（Honey）**：去掉果皮果肉，**保留部分黏膜**一起乾燥。甜、圓潤，介於水洗與日曬之間。

> 這三種只是常見分類，各產區還有許多自己的做法與命名。

## 一個簡單的記法
黏膜（糖分）接觸豆子越久、越多 → 甜感與果香通常越重，但風險也越高（發酵過頭會有酒味）。

## 前後文
- 上一站：[[{L['origin']}]]
- 下一站：[[{L['roast']}]]
'''),
'roast': note('roast', '③ 烘焙：把生豆變成香氣', ['咖啡', '烘焙'], f'''
# 烘焙：把生豆變成香氣

生豆幾乎沒有咖啡香。烘焙時，豆子先**脫水**，再進入**梅納反應與焦糖化**，產生數百種香氣物質，豆子也會膨脹、變色、減重（約 12–20%）。

![烘焙曲線](assets/{SID['roast']}.svg)

## 兩個重要的聲音
- **一爆**（約 196°C）：豆子內的水氣與氣體衝出，發出像爆米花的劈啪聲。
- **二爆**（約 224°C）：纖維結構開始崩解，聲音更細碎，豆面開始出油。

## 烘焙度怎麼分
| 烘焙度 | 大約位置 | 風味傾向 |
| --- | --- | --- |
| 淺焙 | 一爆前後 | 酸質明亮、保留產地特色、花果香 |
| 中焙 | 一爆結束到二爆前 | 酸甜平衡、焦糖與堅果 |
| 深焙 | 二爆前後 | 苦甜、厚重、烘焙味與可可 |

> 溫度是常見的參考值，實際依烘焙機、豆量與量測位置而不同。

## 烘完不要馬上喝
剛烘好的豆子會持續排出氣體（排氣）。多數咖啡在烘焙後**幾天到數週**內風味最佳。

## 前後文
- 上一站：[[{L['process']}]]
- 下一站：[[{L['brew']}]]
'''),
'brew': note('brew', '④ 萃取：把風味沖進杯子', ['咖啡', '萃取', '手沖', '義式'], f'''
# 萃取：把風味沖進杯子

萃取就是用水把咖啡粉裡的可溶物質帶出來。先出來的是酸，接著是甜，最後才是苦與澀——所以**時間與細度**決定你喝到哪一段。

![萃取](assets/{SID['extract']}.svg)

## 四個主要變數
1. **研磨粗細**：越細，接觸面積越大，萃取越快。
2. **水溫**：常見約 90–96°C，越高萃取越多。
3. **粉水比**：手沖常見約 **1:15–1:17**；義式濃縮常見約 **1:2**（例如 18 g 粉出 36 g 液體，約 25–30 秒）。
4. **時間與攪動**：越久、越攪，萃取越多。

## 怎麼判斷與調整
- 酸、澀、薄 → 可能**萃取不足**，磨細一點或水溫高一點。
- 苦、乾、悶 → 可能**過度萃取**，磨粗一點或縮短時間。
- **一次只改一個變數**，並把參數記下來。

## 前後文
- 上一站：[[{L['roast']}]]
- 下一站：[[{L['taste']}]]
'''),
'taste': note('taste', '⑤ 風味與品嘗：怎麼形容一杯咖啡', ['咖啡', '風味', '杯測'], f'''
# 風味與品嘗：怎麼形容一杯咖啡

「好喝」很難溝通，「像莓果的酸、尾韻像蜂蜜」就容易多了。**風味輪**把常見的味道分成大類，幫你一步一步縮小描述。

![風味輪](assets/{SID['wheel']}.svg)

## 品嘗時可以注意
- **酸質**：明亮、清爽，還是尖銳？
- **甜感**：像糖、水果還是蜂蜜？
- **口感（體脂）**：像水、牛奶還是奶油？
- **餘韻**：吞下去之後，味道留多久？
- **平衡**：這些有沒有互相照顧？

## 杯測
專業評審用杯測（cupping）給咖啡打分：聞乾香 → 注水 → 破渣聞濕香 → 啜吸。依 SCA 的標準，**80 分以上**常被稱為精品咖啡（specialty coffee）。

## 回饋，下一杯更好
品嘗之後，把感受帶回前面的關卡：想要更甜？換處理法或烘淺一點？想要更乾淨？調整萃取？這就是咖啡的迴圈。

## 前後文
- 上一站：[[{L['brew']}]]
- 回到起點：[[{L['origin']}]]
'''),
}

# ───────── 畫布 ─────────
# 版面：左邊是中心主題，右邊 5 個「橫條群組」由上到下依旅程排列（右展開的樹狀心智圖）。
# 收合時每個群組縮成左上角的小方塊，5 個方塊整齊排成一列，一眼就是目錄；展開才看到內容。
# 群組由上到下排列，所以「簡報」模式（依 y→x 排序）的順序就是旅程順序。
GW, GH, PITCH = 1180, 390, 450
ORDER = ['origin', 'process', 'roast', 'brew', 'taste']
POS = {k: (0, i * PITCH) for i, k in enumerate(ORDER)}
GROUP = {
    'origin': ('① 產地', '4'), 'process': ('② 處理', '3'), 'roast': ('③ 烘焙', '1'),
    'brew': ('④ 萃取', '6'), 'taste': ('⑤ 風味', '2'),
}
LINKS = {
    'origin': ('https://en.wikipedia.org/wiki/Coffea', 'Coffea'),
    'process': ('https://en.wikipedia.org/wiki/Coffee_processing', 'Coffee processing'),
    'roast': ('https://en.wikipedia.org/wiki/Coffee_roasting', 'Coffee roasting'),
    'brew': ('https://en.wikipedia.org/wiki/Coffee_preparation', 'Coffee preparation'),
    'taste': ('https://sca.coffee/research/coffee-tasters-flavor-wheel', 'The Coffee Taster\'s Flavor Wheel'),
}
POINTS = {
    'origin': '**重點**\n\n- 兩大品種：阿拉比卡、羅布斯塔\n- 咖啡帶：南北回歸線之間\n- 海拔高 → 風味通常更密\n- 品種決定「上限」',
    'process': '**重點**\n\n- 豆子＝果實的種子\n- 水洗：乾淨明亮\n- 日曬：果香濃、甜\n- 蜜處理：圓潤，居中',
    'roast': '**重點**\n\n- 一爆約 196°C，二爆約 224°C\n- 越深：越苦、越厚、酸越少\n- 烘完需要「養豆」幾天',
    'brew': '**重點**\n\n- 四個變數：細度、水溫、粉水比、時間\n- 酸澀＝不足；苦乾＝過度\n- 一次只改一個變數',
    'taste': '**重點**\n\n- 用風味輪由大類往細項描述\n- 注意酸、甜、口感、餘韻、平衡\n- 品嘗的結果回饋到前面每一站',
}

def build_board(collapsed):
    nodes, edges = [], []
    def add(n): nodes.append(n); return n['id']
    total = (len(ORDER) - 1) * PITCH + GH
    mid = total // 2
    add({'id': 'hub', 'type': 'text', 'x': -640, 'y': mid - 100, 'width': 400, 'height': 200, 'color': '5', 'x-fontsize': 'l',
         'text': '# ☕ 咖啡的旅程\n\n從一顆種子到一杯咖啡，要走過五個關卡。'})
    add({'id': 'howto', 'type': 'text', 'x': -1140, 'y': mid - 150, 'width': 420, 'height': 300, 'color': '5',
         'text': '### 怎麼讀這張壁畫\n\n- 點群組左上的 **▸** 展開一站，**▾** 收合（唯讀分享時也可以）\n- 雙擊筆記卡或按 **↗** 開啟筆記\n- 虛線箭頭是旅程順序\n- 工具列的「簡報」會依 ① → ⑤ 逐站導覽'})
    for key in ORDER:
        label, color = GROUP[key]
        gx, gy = POS[key]
        gid = 'g-' + key
        g = {'id': gid, 'type': 'group', 'label': label, 'x': gx, 'y': gy, 'width': GW, 'height': GH, 'color': color}
        if collapsed and key != 'origin': g['x-collapsed'] = True  # 第一站預設展開，其餘收合
        add(g)
        nid, sid, tid, lid = ('n-' + key, 's-' + key, 't-' + key, 'l-' + key)
        add({'id': nid, 'type': 'file', 'file': f'notes/{NID[key]}.md', 'x': gx + 40, 'y': gy + 70, 'width': 300, 'height': 270, 'x-parent': gid})
        add({'id': sid, 'type': 'file', 'file': f'assets/{SID[SVGKEY[key]]}.svg', 'x': gx + 380, 'y': gy + 70, 'width': 420, 'height': 290, 'x-parent': gid})
        add({'id': tid, 'type': 'text', 'text': POINTS[key], 'x': gx + 840, 'y': gy + 70, 'width': 300, 'height': 170, 'x-fontsize': 's', 'x-parent': gid})
        url, ttl = LINKS[key]
        add({'id': lid, 'type': 'link', 'url': url, 'x': gx + 840, 'y': gy + 256, 'width': 300, 'height': 104, 'x-parent': gid,
             'x-preview': {'title': ttl, 'site': 'sca.coffee' if 'sca.coffee' in url else 'en.wikipedia.org'}})
        edges += [
            {'id': f'e-{key}-1', 'fromNode': nid, 'toNode': sid, 'fromEnd': 'none', 'toEnd': 'arrow', 'label': '圖解', 'color': color},
            {'id': f'e-{key}-2', 'fromNode': sid, 'toNode': tid, 'fromEnd': 'none', 'toEnd': 'arrow', 'label': '重點', 'color': color},
            {'id': f'e-{key}-3', 'fromNode': tid, 'toNode': lid, 'fromEnd': 'none', 'toEnd': 'arrow', 'label': '延伸閱讀', 'color': color, 'x-style': 'dashed'},
            {'id': f'e-hub-{key}', 'fromNode': 'hub', 'toNode': gid, 'fromEnd': 'none', 'toEnd': 'none', 'color': color},
        ]
    labels = ['採收後', '烘成熟豆', '磨粉、沖煮', '入口品嘗', '回饋：下次想試什麼豆']
    for i, key in enumerate(ORDER):
        nxt = ORDER[(i + 1) % 5]
        e = {'id': f'e-trip-{i+1}', 'fromNode': 'g-' + key, 'toNode': 'g-' + nxt, 'fromEnd': 'none', 'toEnd': 'arrow',
             'label': labels[i], 'color': GROUP[nxt][1], 'x-style': 'dashed'}
        if i == 4: e.update({'fromSide': 'right', 'toSide': 'right'})
        edges.append(e)
    return {'nodes': nodes, 'edges': edges}

def write_all(outdir, collapsed=True):
    shutil.rmtree(outdir, ignore_errors=True)
    for d in ('notes', 'assets', 'topics', 'boards'): os.makedirs(f'{outdir}/{d}')
    for k, t in NOTES.items(): open(f'{outdir}/notes/{NID[k]}.md', 'w', encoding='utf8').write(t)
    for k, f in svgs.ALL.items(): open(f'{outdir}/assets/{SID[k]}.svg', 'w', encoding='utf8').write(f())
    json.dump({'id': TOPIC, 'title': '咖啡的旅程：從種子到一杯', 'category': '生活與興趣', 'status': '示範', 'defaultPublic': False},
              open(f'{outdir}/topics/{TOPIC}.json', 'w', encoding='utf8'), ensure_ascii=False, indent=2)
    json.dump(build_board(collapsed), open(f'{outdir}/boards/{TOPIC}.canvas.json', 'w', encoding='utf8'), ensure_ascii=False, indent=2)
    json.dump({'format': 'vault-backup', 'version': 1, 'exportedAt': '2026-10-29T00:00:00.000Z',
               'counts': {'notes': 5, 'assets': 5, 'topics': 1, 'boards': 1}, 'missing': []},
              open(f'{outdir}/manifest.json', 'w', encoding='utf8'), indent=2)

def zip_dir(src, out):
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(src):
            for f in sorted(files):
                p = os.path.join(root, f); z.write(p, os.path.relpath(p, src))

if __name__ == '__main__':
    collapsed = '--expanded' not in sys.argv
    write_all('pkg', collapsed)
    zip_dir('pkg', sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'coffee.zip')
    print('ok', collapsed)
