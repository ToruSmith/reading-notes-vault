// 產生測試用畫布：300 張以上的卡片（含巢狀群組、連線、x- 自訂欄位與未知欄位）。
const CL = require('../canvaslogic.js');
function gen({ files = [], total = 320, seedStr = 1 } = {}) {
  let r = seedStr;
  const rnd = () => (r = (r * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const nodes = [],
    edges = [];
  const COLS = 20,
    CW = 300,
    CH = 220;
  // 5 個外層群組（各含 2 個內層群組）
  for (let g = 0; g < 5; g++) {
    nodes.push({
      id: 'g' + g,
      type: 'group',
      label: '第 ' + (g + 1) + ' 章',
      x: g * 1200 - 40,
      y: -80,
      width: 1160,
      height: 1000,
      color: String((g % 6) + 1),
      'x-collapsed': false
    });
    for (let h = 0; h < 2; h++)
      nodes.push({
        id: 'g' + g + 'h' + h,
        type: 'group',
        label: g + 1 + '.' + (h + 1) + ' 小節',
        x: g * 1200 + h * 560,
        y: -20,
        width: 540,
        height: 900,
        'x-parent': 'g' + g
      });
  }
  let i = 0,
    fi = 0;
  while (nodes.length < total) {
    const col = i % COLS,
      row = Math.floor(i / COLS),
      x = col * 300 + 20,
      y = row * 220 + 40;
    const gi = Math.min(4, Math.floor(x / 1200)),
      hi = x % 1200 >= 560 ? 1 : 0;
    const id = 'n' + i,
      base = { id, x, y, width: 260, height: 170 };
    const kind = i % 10;
    let node;
    if (kind === 3 && fi < files.length)
      node = Object.assign(base, { type: 'file', file: 'notes/' + files[fi++] + '.md' });
    else if (kind === 7)
      node = Object.assign(base, {
        type: 'link',
        url: i % 20 === 7 ? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' : 'https://example.com/page' + i,
        height: 150
      });
    else
      node = Object.assign(base, {
        type: 'text',
        text:
          '## 卡片 ' +
          i +
          '\n這是第 ' +
          i +
          ' 張卡片的內容，含 **粗體**、`程式碼` 與清單：\n\n- 項目一\n- 項目二\n\n> 引用：讀書心得 ' +
          i
      });
    if (i % 4 === 0) node.color = String((i % 6) + 1);
    if (i % 9 === 0) node['x-note'] = '自訂欄位 ' + i;
    if (i % 17 === 0) node.futureField = { nested: [i, true, null] };
    if (x < 5 * 1200 - 40 && y < 800) node['x-parent'] = 'g' + gi + 'h' + hi;
    nodes.push(node);
    i++;
  }
  const cards = nodes.filter(n => n.type !== 'group');
  for (let k = 1; k < cards.length; k += 1) {
    if (k % 20 === 0) continue;
    const e = {
      id: 'e' + k,
      fromNode: cards[k - 1].id,
      toNode: cards[k].id,
      fromEnd: 'none',
      toEnd: 'arrow'
    };
    if (k % 5 === 0) e.label = '關聯 ' + k;
    if (k % 7 === 0) e['x-style'] = 'dashed';
    if (k % 3 === 0) e.color = String((k % 6) + 1);
    if (k % 31 === 0) e.futureEdgeField = 'keep-me';
    edges.push(e);
  }
  return { 'x-board': { generatedBy: 'gen_canvas', v: 1 }, futureTopLevel: [1, 2, 3], nodes, edges };
}
module.exports = gen;
if (require.main === module) {
  const fs = require('fs'),
    path = require('path');
  const b = gen({ files: [] });
  const bad = CL.validateCanvas(b);
  if (bad.length) throw new Error(bad.slice(0, 5).join('\n'));
  fs.mkdirSync(path.join(__dirname, '..', 'samples'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'samples', 'canvas300.canvas'), JSON.stringify(b, null, 2));
  console.log(
    '已產生 samples/canvas300.canvas：' +
      b.nodes.length +
      ' 個節點、' +
      b.edges.length +
      ' 條連線，格式檢查無問題'
  );
}
