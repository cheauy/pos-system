const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const file = ts.createSourceFile('pos.tsx', fs.readFileSync('app/(dashboard)/dashboard/pos/pos-client.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect' && node.arguments[0].getText(file).includes('if (!orderOpen) return')) effect = node.arguments[0];
  ts.forEachChild(node, visit);
}
visit(file);
const source = ts.transpileModule(`return (${effect.getText(file)})();`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

test('cart rotation follows the portrait-tablet layout and releases the temporary scroll lock', () => {
  let onWide;
  const closed = [];
  const media = { matches: false, addEventListener: (_, fn) => { onWide = fn; }, removeEventListener: (_, fn) => assert.equal(fn, onWide) };
  const document = { body: { style: { overflow: 'auto' } }, querySelector: () => null };
  const window = { matchMedia: query => {
    assert.equal(query, '(min-width: 801px) and (orientation: landscape), (min-width: 1025px)'); return media;
  }, addEventListener() {}, removeEventListener() {} };
  const cleanup = new Function('orderOpen', 'document', 'window', 'setOrderOpen', source)(true, document, window, value => closed.push(value));
  assert.equal(document.body.style.overflow, 'hidden');
  onWide(); assert.deepEqual(closed, []);
  media.matches = true; onWide(); assert.deepEqual(closed, [false]);
  cleanup(); assert.equal(document.body.style.overflow, 'auto');
});
