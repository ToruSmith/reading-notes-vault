# 產生 5 張 SVG 簡圖（純向量、有 viewBox、無 script／外部連結）
import math
FONT = "system-ui, 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif"
def wrap(body, title, sub=None):
    s = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 440" width="640" height="440" font-family="{FONT}">\n'
    s += '<rect x="0" y="0" width="640" height="440" rx="14" fill="#fffaf2"/>\n'
    s += f'<text x="24" y="38" font-size="22" font-weight="700" fill="#4a2c17">{title}</text>\n'
    if sub:
        s += f'<text x="24" y="60" font-size="13" fill="#8a6a50">{sub}</text>\n'
    return s + body + '</svg>\n'

def svg_altitude():
    b = ''
    y = lambda m: 400 - m * 0.15
    # 高度帶
    b += f'<rect x="70" y="{y(2000)}" width="550" height="{y(900)-y(2000)}" fill="#7da35f" fill-opacity="0.28"/>\n'
    b += f'<rect x="70" y="{y(800)}" width="550" height="{y(0)-y(800)}" fill="#e0912f" fill-opacity="0.28"/>\n'
    b += f'<line x1="70" y1="{y(850)}" x2="620" y2="{y(850)}" stroke="#a98b6f" stroke-dasharray="5 4"/>\n'
    # 坡面
    b += '<path d="M70,400 L70,330 C150,325 210,290 270,250 C340,205 400,150 470,120 C530,95 580,100 620,115 L620,400 Z" fill="#8a6a4a" fill-opacity="0.38" stroke="#5e4630" stroke-width="2"/>\n'
    # 座標軸
    b += '<line x1="70" y1="85" x2="70" y2="400" stroke="#5e4630" stroke-width="2"/>\n'
    for m in (0, 500, 1000, 1500, 2000):
        b += f'<line x1="64" y1="{y(m)}" x2="70" y2="{y(m)}" stroke="#5e4630" stroke-width="2"/>'
        b += f'<text x="58" y="{y(m)+4}" font-size="12" text-anchor="end" fill="#5e4630">{m:,} m</text>\n'
    # 標籤
    b += '<text x="90" y="128" font-size="17" font-weight="700" fill="#2f5a1e">阿拉比卡 Arabica</text>\n'
    b += '<text x="90" y="150" font-size="13" fill="#2f5a1e">約 900–2,000 m ・酸質明亮、風味細緻</text>\n'
    b += '<text x="90" y="170" font-size="13" fill="#2f5a1e">占全球產量約六成</text>\n'
    b += '<text x="110" y="352" font-size="17" font-weight="700" fill="#6e3a05">羅布斯塔 Robusta</text>\n'
    b += '<text x="110" y="374" font-size="13" fill="#6e3a05">約 0–800 m ・耐熱抗病、苦而厚實</text>\n'
    # 小咖啡樹
    for x, yy in ((330, 232), (400, 188), (480, 150), (200, 303), (140, 322)):
        b += f'<rect x="{x-1.5}" y="{yy}" width="3" height="12" fill="#5e4630"/><circle cx="{x}" cy="{yy-5}" r="9" fill="#3f7a35"/><circle cx="{x-3}" cy="{yy-4}" r="2" fill="#c0392b"/><circle cx="{x+4}" cy="{yy-7}" r="2" fill="#c0392b"/>\n'
    b += '<text x="620" y="426" font-size="11" text-anchor="end" fill="#8a6a50">示意圖：數字為常見範圍，實際依產區緯度而異</text>\n'
    return wrap(b, '咖啡樹的高度帶', '緯度越高，適合的海拔通常越低')

def svg_cherry():
    cx, cy = 215, 252
    S = 0.82
    b = ''
    layers = [
        (172, 192, '#c0392b'), (152, 172, '#e8837a'), (120, 140, '#f3d27a'),
        (106, 126, '#efe3c6'), (90, 110, '#cfc8bd'),
    ]
    for rx, ry, c in layers:
        rx, ry = rx * S, ry * S
        b += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx:.1f}" ry="{ry:.1f}" fill="{c}" stroke="#5e4630" stroke-width="1.5"/>\n'
    # 兩半種子
    for dx in (-36, 36):
        dx *= S
        b += f'<ellipse cx="{cx+dx}" cy="{cy}" rx="{38*S:.1f}" ry="{88*S:.1f}" fill="#8a9a5b" stroke="#4d5a2c" stroke-width="2"/>\n'
    b += f'<path d="M{cx},{cy-70} C{cx-9},{cy-26} {cx+9},{cy+26} {cx},{cy+70}" fill="none" stroke="#4d5a2c" stroke-width="3"/>\n'
    # 標註
    # 錨點沿「右上→中心」的斜線，依層由外而內，連線不交叉
    mids = [(162, 182), (142, 162), (113, 133), (98, 118), (82, 102)]
    ang = math.radians(-38)
    anchors = [(cx + rx * S * math.cos(ang), cy + ry * S * math.sin(ang)) for rx, ry in mids]
    anchors.append((cx + 30, cy + 10))
    texts = [('外果皮', '成熟變紅'), ('果肉', '帶甜味'), ('黏膜', '糖分多、滑滑的'), ('羊皮層', '內果皮，硬殼'), ('銀皮', '薄膜，烘焙時脫落'), ('種子', '＝ 生豆（通常兩顆）')]
    items = [(t[0], t[1], 118 + i * 57, anchors[i][0], anchors[i][1]) for i, t in enumerate(texts)]
    for name, desc, ty, px, py in items:
        b += f'<line x1="{px}" y1="{py}" x2="440" y2="{ty}" stroke="#8a6a50" stroke-width="1.2"/><circle cx="{px}" cy="{py}" r="3.5" fill="#5e4630"/>\n'
        b += f'<text x="446" y="{ty-2}" font-size="16" font-weight="700" fill="#4a2c17">{name}</text><text x="446" y="{ty+15}" font-size="12" fill="#8a6a50">{desc}</text>\n'
    b += '<text x="24" y="432" font-size="12" fill="#8a6a50">處理法＝決定外果皮、果肉、黏膜怎麼被拿掉</text>\n'
    return wrap(b, '咖啡櫻桃的剖面', '一顆果實，由外到內共六層')

def catmull(pts):
    d = f'M{pts[0][0]:.1f},{pts[0][1]:.1f}'
    for i in range(len(pts) - 1):
        p0 = pts[max(i - 1, 0)]; p1 = pts[i]; p2 = pts[i + 1]; p3 = pts[min(i + 2, len(pts) - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f' C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}'
    return d

def svg_roast():
    X = lambda t: 70 + t * 42
    Y = lambda c: 390 - (c - 50) * 1.45
    b = ''
    # 烘焙度色帶
    for t0, t1, c, name in ((9.0, 10.3, '#d9a566', '淺焙'), (10.3, 11.6, '#a8683a', '中焙'), (11.6, 12.8, '#4e2d1a', '深焙')):
        b += f'<rect x="{X(t0)}" y="70" width="{X(t1)-X(t0)}" height="320" fill="{c}" fill-opacity="0.18"/>\n'
        b += f'<text x="{(X(t0)+X(t1))/2}" y="92" font-size="14" font-weight="700" text-anchor="middle" fill="{c}">{name}</text>\n'
    # 座標
    b += '<line x1="70" y1="390" x2="620" y2="390" stroke="#5e4630" stroke-width="2"/><line x1="70" y1="70" x2="70" y2="390" stroke="#5e4630" stroke-width="2"/>\n'
    for c in (50, 100, 150, 200, 250):
        b += f'<line x1="64" y1="{Y(c)}" x2="70" y2="{Y(c)}" stroke="#5e4630"/><text x="58" y="{Y(c)+4}" font-size="11" text-anchor="end" fill="#5e4630">{c}°C</text>\n'
    for t in range(0, 13, 2):
        b += f'<line x1="{X(t)}" y1="390" x2="{X(t)}" y2="396" stroke="#5e4630"/><text x="{X(t)}" y="410" font-size="11" text-anchor="middle" fill="#5e4630">{t}</text>\n'
    b += '<text x="620" y="426" font-size="11" text-anchor="end" fill="#8a6a50">時間（分鐘）　示意曲線，實際依烘焙機與批量而異</text>\n'
    pts = [(X(0), Y(200)), (X(1.2), Y(100)), (X(2), Y(98)), (X(4), Y(135)), (X(6.5), Y(165)), (X(9), Y(196)), (X(10.5), Y(210)), (X(11.8), Y(224)), (X(12.8), Y(232))]
    b += f'<path d="{catmull(pts)}" fill="none" stroke="#b5461f" stroke-width="3.5" stroke-linecap="round"/>\n'
    # 事件
    ev = [(2.0, 98, '回溫點', '豆子最冷', -14, 28), (9.0, 196, '一爆', '約 196°C', -64, -14), (11.8, 224, '二爆', '約 224°C', -70, -8)]
    for t, c, n, d, dx, dy in ev:
        b += f'<circle cx="{X(t)}" cy="{Y(c)}" r="6" fill="#fffaf2" stroke="#b5461f" stroke-width="3"/>\n'
        b += f'<text x="{X(t)+dx}" y="{Y(c)+dy}" font-size="14" font-weight="700" fill="#4a2c17">{n}</text><text x="{X(t)+dx}" y="{Y(c)+dy+15}" font-size="11" fill="#8a6a50">{d}</text>\n'
    b += f'<text x="{X(0)+8}" y="{Y(200)+4}" font-size="12" fill="#4a2c17">入豆</text>\n'
    b += f'<text x="{X(4.5)}" y="{Y(115)+8}" font-size="12" fill="#8a6a50">脫水期　→　梅納反應</text>\n'
    return wrap(b, '烘焙曲線（豆溫）', '一爆前後決定淺中深，二爆之後進入深焙')

def svg_extract():
    b = ''
    # 漸層長條
    b += '<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#d9d36a"/><stop offset="0.45" stop-color="#b9873d"/><stop offset="0.6" stop-color="#7a4a22"/><stop offset="1" stop-color="#2e1a0e"/></linearGradient></defs>\n'
    b += '<rect x="40" y="110" width="560" height="54" rx="10" fill="url(#g)"/>\n'
    # 理想區
    b += '<rect x="262" y="100" width="116" height="74" rx="10" fill="none" stroke="#2f7a3e" stroke-width="4"/>\n'
    b += '<text x="320" y="92" font-size="14" font-weight="700" text-anchor="middle" fill="#2f7a3e">理想：18–22%</text>\n'
    for x, t in ((40, '萃取不足'), (600, '過度萃取')):
        b += f'<text x="{x}" y="190" font-size="15" font-weight="700" text-anchor="{"start" if x==40 else "end"}" fill="#4a2c17">{t}</text>\n'
    b += '<text x="40" y="208" font-size="12" fill="#8a6a50">萃取率 &lt; 18%</text><text x="600" y="208" font-size="12" text-anchor="end" fill="#8a6a50">萃取率 &gt; 22%</text>\n'
    # 三種口感
    cards = [(60, '酸、澀、薄', '#d9d36a', '像沒熟的水果，餘韻短'), (230, '甜、平衡、乾淨', '#2f7a3e', '酸甜苦平衡，餘韻舒服'), (400, '苦、乾、悶', '#7a4a22', '口感粗糙，舌頭發乾')]
    for x, t, c, d in cards:
        b += f'<rect x="{x}" y="232" width="170" height="74" rx="10" fill="#fff" stroke="{c}" stroke-width="2.5"/>\n'
        b += f'<text x="{x+85}" y="262" font-size="16" font-weight="700" text-anchor="middle" fill="#4a2c17">{t}</text><text x="{x+85}" y="284" font-size="11.5" text-anchor="middle" fill="#8a6a50">{d}</text>\n'
    # 調整箭頭
    b += '<path d="M60,352 L580,352" stroke="#5e4630" stroke-width="2.5" marker-end="url(#a)"/><defs><marker id="a" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#5e4630"/></marker></defs>\n'
    b += '<text x="60" y="340" font-size="13" fill="#4a2c17">想「多萃取一點」：磨細一點、水溫高一點、時間久一點、粉水比小一點</text>\n'
    b += '<text x="60" y="378" font-size="13" fill="#4a2c17">想「少萃取一點」：反過來調。一次只改一個變數。</text>\n'
    b += '<text x="620" y="426" font-size="11" text-anchor="end" fill="#8a6a50">18–22% 為 SCA 建議的萃取率範圍（濾泡式），僅供參考</text>\n'
    return wrap(b, '萃取：不足、理想、過度', '酸澀 ← 甜感平衡 → 苦乾')

def svg_wheel():
    cx, cy = 205, 254
    K = 0.95
    cats = [
        ('水果', '莓果', '#d94b5a'), ('酸／發酵', '酒香', '#d9a021'), ('青草', '青草', '#5f9a3d'),
        ('其他', '紙味', '#8a8a8a'), ('烘焙', '穀物', '#8a5a34'), ('香料', '肉桂', '#b5651d'),
        ('堅果／可可', '杏仁', '#7a4a2e'), ('甜', '蜂蜜', '#e0a43a'), ('花香', '茉莉', '#c45fa8'),
    ]
    n = len(cats); step = 2 * math.pi / n
    def pol(r, a): return cx + r * K * math.cos(a), cy + r * K * math.sin(a)
    def sector(r0, r1, a0, a1):
        x0, y0 = pol(r1, a0); x1, y1 = pol(r1, a1); x2, y2 = pol(r0, a1); x3, y3 = pol(r0, a0)
        return f'M{x0:.1f},{y0:.1f} A{r1*K:.1f},{r1*K:.1f} 0 0 1 {x1:.1f},{y1:.1f} L{x2:.1f},{y2:.1f} A{r0*K:.1f},{r0*K:.1f} 0 0 0 {x3:.1f},{y3:.1f} Z'
    b = ''
    for i, (name, ex, c) in enumerate(cats):
        a0 = -math.pi / 2 + i * step; a1 = a0 + step; am = (a0 + a1) / 2
        b += f'<path d="{sector(62, 128, a0, a1)}" fill="{c}" stroke="#fffaf2" stroke-width="2"/>\n'
        b += f'<path d="{sector(128, 186, a0, a1)}" fill="{c}" fill-opacity="0.45" stroke="#fffaf2" stroke-width="2"/>\n'
        x, y = pol(95, am)
        fs = 12 if len(name) > 3 else 14
        b += f'<text x="{x:.1f}" y="{y+4:.1f}" font-size="{fs}" font-weight="700" text-anchor="middle" fill="#fff">{name}</text>\n'
        x, y = pol(157, am)
        b += f'<text x="{x:.1f}" y="{y+4:.1f}" font-size="12" text-anchor="middle" fill="#3a2410">{ex}</text>\n'
    b += f'<circle cx="{cx}" cy="{cy}" r="55" fill="#fffaf2" stroke="#5e4630" stroke-width="2"/><text x="{cx}" y="{cy-2}" font-size="15" font-weight="700" text-anchor="middle" fill="#4a2c17">咖啡</text><text x="{cx}" y="{cy+16}" font-size="15" font-weight="700" text-anchor="middle" fill="#4a2c17">風味輪</text>\n'
    # 右側說明
    tx = 420
    b += f'<text x="{tx}" y="130" font-size="15" font-weight="700" fill="#4a2c17">怎麼讀</text>\n'
    for i, t in enumerate(('由內往外：大類 → 細項', '先抓大方向，再慢慢縮小', '例：水果 → 莓果 → 藍莓')):
        b += f'<text x="{tx}" y="{154+i*22}" font-size="12.5" fill="#5e4630">{t}</text>\n'
    b += f'<text x="{tx}" y="250" font-size="15" font-weight="700" fill="#4a2c17">杯測五步</text>\n'
    for i, t in enumerate(('① 聞乾香', '② 注水、靜置 4 分鐘', '③ 破渣，聞濕香', '④ 撈渣，啜吸入口', '⑤ 記錄並打分')):
        b += f'<text x="{tx}" y="{274+i*22}" font-size="12.5" fill="#5e4630">{t}</text>\n'
    b += '<text x="620" y="426" font-size="11" text-anchor="end" fill="#8a6a50">簡化示意；完整版請見 SCA 風味輪（右側連結）</text>\n'
    return wrap(b, '風味輪（簡化版）', '九大類：把「說不出的味道」變成可以描述的詞')

ALL = {'altitude': svg_altitude, 'cherry': svg_cherry, 'roast': svg_roast, 'extract': svg_extract, 'wheel': svg_wheel}
if __name__ == '__main__':
    import os
    os.makedirs('svg', exist_ok=True)
    for k, f in ALL.items():
        open(f'svg/{k}.svg', 'w', encoding='utf8').write(f())
    print('ok')
