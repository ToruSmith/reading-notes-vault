// 一次性轉換工具：把介面程式裡的中文字串改成 T('…')（以原中文為鍵）。
// 字串相加（'已選取 ' + n + ' 張'）會合併成範本 T('已選取 {1} 張', n)。用法：node tools/i18n_convert.js [--write] 檔案…
const fs = require('fs'),
  path = require('path');
let acorn;
for (const p of ['acorn', '/opt/npm-tools/node_modules/acorn', '/opt/node-tools/node_modules/acorn']) {
  try {
    acorn = require(p);
    break;
  } catch (e) {
    /* next */
  }
}
const CJK = /[　-〿一-鿿＀-￯]/;
const lit = s =>
  "'" +
  String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r') +
  "'";
const write = process.argv.includes('--write'),
  files = process.argv.slice(2).filter(a => !a.startsWith('--'));
const report = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 2020, preserveParens: true, locations: true });
  const edits = [],
    manual = [];
  const isStr = n => n.type === 'Literal' && typeof n.value === 'string';
  const flatten = n =>
    n.type === 'BinaryExpression' && n.operator === '+' ? flatten(n.left).concat(flatten(n.right)) : [n];
  const hasCjkLit = n => {
    let found = false;
    (function w(x) {
      if (!x || typeof x !== 'object' || found) return;
      if (Array.isArray(x)) return x.forEach(w);
      if (isStr(x) && CJK.test(x.value)) found = true;
      for (const k in x) if (k !== 'loc' && k !== 'type') w(x[k]);
    })(n);
    return found;
  };
  const handled = new Set();
  (function walk(node, parent, key) {
    if (!node || typeof node.type !== 'string') return;
    // 已經是 T(...) 的參數就不再處理
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'T')
      return;
    if (node.type === 'BinaryExpression' && node.operator === '+' && !handled.has(node)) {
      const parts = flatten(node);
      const anyStr = parts.some(isStr),
        anyCjk = parts.some(p => isStr(p) && CJK.test(p.value));
      if (anyStr && anyCjk) {
        const firstLit = parts.findIndex(isStr);
        if (firstLit > 1) {
          manual.push([node.loc.start.line, '字串相加前有多個非字串運算元，需人工處理']);
        } else {
          let tpl = '',
            args = [];
          parts.forEach(p => {
            if (isStr(p)) tpl += p.value;
            else {
              args.push(src.slice(p.start, p.end));
              tpl += '{' + args.length + '}';
            }
          });
          edits.push({
            start: node.start,
            end: node.end,
            text: 'T(' + lit(tpl) + args.map(a => ', ' + a).join('') + ')',
            line: node.loc.start.line,
            key: tpl
          });
          // 運算元內部（例如括號裡的三元運算）仍要處理：只往非字串運算元裡走
          parts.forEach(p => {
            if (!isStr(p)) walk(p, node, 'part');
          });
          return;
        }
      }
    }
    if (isStr(node) && CJK.test(node.value)) {
      const bad =
        parent &&
        ((parent.type === 'Property' && key === 'key') ||
          parent.type === 'SwitchCase' ||
          (parent.type === 'BinaryExpression' && /^[=!]=/.test(parent.operator)) ||
          parent.type === 'ImportDeclaration' ||
          (parent.type === 'MemberExpression' && key === 'property'));
      if (bad)
        manual.push([node.loc.start.line, '不適合自動包裝（比較、屬性鍵等）：' + node.value.slice(0, 30)]);
      else
        edits.push({
          start: node.start,
          end: node.end,
          text: 'T(' + lit(node.value) + ')',
          line: node.loc.start.line,
          key: node.value
        });
      return;
    }
    if (node.type === 'TemplateLiteral' && node.quasis.some(q => CJK.test(q.value.cooked)))
      manual.push([node.loc.start.line, '樣板字串含中文，需人工處理']);
    for (const k in node) {
      if (k === 'loc' || k === 'type') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(c => walk(c, node, k));
      else if (v && typeof v.type === 'string') walk(v, node, k);
    }
  })(ast, null, null);
  // 巢狀：外層範本內已含內層的字串運算元不會重複（因為只往非字串運算元走），但可能與其內部的編輯重疊；由外往內排序後去掉被包含的編輯
  edits.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  edits.forEach(e => {
    const last = kept[kept.length - 1];
    if (last && e.start >= last.start && e.end <= last.end) {
      /* 被外層範本的參數涵蓋：參數文字已用原始碼，需改成處理後的文字 */ last.inner = (
        last.inner || []
      ).concat(e);
    } else kept.push(e);
  });
  // 外層的參數原文裡若含內層編輯，要把內層編輯套進去
  kept.forEach(e => {
    if (!e.inner) return;
    let t = e.text;
    e.inner
      .sort((a, b) => b.start - a.start)
      .forEach(i => {
        const orig = src.slice(i.start, i.end);
        t = t.replace(orig, i.text);
      });
    e.text = t;
  });
  let out = src;
  kept
    .sort((a, b) => b.start - a.start)
    .forEach(e => {
      out = out.slice(0, e.start) + e.text + out.slice(e.end);
    });
  report.push({ f, n: kept.length, manual, keys: kept.map(e => e.key) });
  if (write) fs.writeFileSync(f, out);
  else fs.writeFileSync(f + '.i18n.preview', out);
}
report.forEach(r => {
  console.log(r.f + '：自動轉換 ' + r.n + ' 處；需人工 ' + r.manual.length + ' 處');
  r.manual.forEach(m => console.log('   行 ' + m[0] + '：' + m[1]));
});
