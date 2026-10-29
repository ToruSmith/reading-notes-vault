// 掃出所有 T('…') 的鍵與未包裝的中文字串。用法：node tools/i18n_keys.js [--bare]
const fs = require('fs'),
  path = require('path');
function req(n) {
  for (const b of ['', '/opt/npm-tools/node_modules/', '/opt/node-tools/node_modules/']) {
    try {
      return require(b + n);
    } catch (e) {}
  }
  throw new Error('找不到 ' + n);
}
const acorn = req('acorn'),
  walk = req('acorn-walk');
const root = path.join(__dirname, '..');
const CFG = JSON.parse(fs.readFileSync(path.join(root, 'modules.json'), 'utf8'));
const FILES = CFG.modules.filter(f => !CFG.skipI18nScan.includes(f)); // 來源：modules.json
const CJK = /[　-〿一-鿿＀-￯]/;
function scan(dir) {
  const keys = new Set(),
    bare = [];
  for (const f of FILES) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    const ast = acorn.parse(src, { ecmaVersion: 2020, locations: true });
    const inT = new Set();
    walk.ancestor(ast, {
      CallExpression(n) {
        const c = n.callee;
        const isT =
          (c.type === 'Identifier' && (c.name === 'T' || c.name === 'Tr' || c.name === 'K')) ||
          (c.type === 'MemberExpression' && c.object.name === 'T' && c.property.name === 'all');
        if (!isT) return;
        n.arguments.forEach(a => {
          if (a.type === 'Literal' && typeof a.value === 'string') {
            keys.add(a.value);
            inT.add(a);
          } else if (a.type === 'TemplateLiteral' && a.expressions.length === 0) {
            keys.add(a.quasis[0].value.cooked);
            inT.add(a);
          } else if (a.type === 'ArrayExpression')
            a.elements.forEach(e => {
              if (e && e.type === 'Literal' && typeof e.value === 'string') {
                keys.add(e.value);
                inT.add(e);
              }
            });
          else if (a.type === 'ConditionalExpression')
            [a.consequent, a.alternate].forEach(e => {
              if (e.type === 'Literal' && typeof e.value === 'string') {
                keys.add(e.value);
                inT.add(e);
              }
            });
          else if (a.type === 'LogicalExpression')
            [a.left, a.right].forEach(e => {
              if (e.type === 'Literal' && typeof e.value === 'string') {
                keys.add(e.value);
                inT.add(e);
              }
            });
        });
      }
    });
    walk.full(ast, n => {
      if (n.type === 'Literal' && typeof n.value === 'string' && CJK.test(n.value) && !inT.has(n))
        bare.push({ f, line: n.loc.start.line, v: n.value });
      if (n.type === 'TemplateElement' && CJK.test(n.value.cooked))
        bare.push({ f, line: n.loc.start.line, v: n.value.cooked, tpl: 1 });
    });
  }
  // 靜態 HTML：data-i18n* 屬性的值也是翻譯鍵
  const html = fs.readFileSync(path.join(dir, 'index.src.html'), 'utf8');
  html.replace(/data-i18n(?:-ph|-label|-title)?="([^"]+)"/g, (m, k) => {
    keys.add(k);
    return m;
  });
  return { keys: [...keys], bare };
}
module.exports = scan;
if (require.main === module) {
  const r = scan(path.join(__dirname, '..'));
  console.log('keys', r.keys.length, 'bare', r.bare.length);
  if (process.argv.includes('--bare'))
    r.bare.forEach(b => console.log(b.f + ':' + b.line, JSON.stringify(b.v).slice(0, 90)));
}
