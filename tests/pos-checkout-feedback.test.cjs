const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { loadTs } = require('./helpers/load-ts.cjs');

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}

test('sale confirmation shows a spinner and prevents another click while saving', () => {
  const icons = require('lucide-react');
  const { CheckoutPanel } = loadTs('app/(dashboard)/dashboard/pos/pos-workspace-flow.tsx', {
    react: { useState: initial => [initial === false ? true : initial, () => {}], useEffect() {} },
    'react/jsx-runtime': require('react/jsx-runtime'), 'lucide-react': icons,
    './pos-workspace-helpers': {}, './pos-currency-components': {}, './pos-customer-helpers': {},
    './pos-currency': { quoteMoney: value => `$${value}` }, './pos-workspace-components': {},
    './pos-checkout-controls': {}, './pos-workspace.module.css': { default: { spin: 'spin' } },
  });
  const confirm = () => {};
  const props = { shipping: { method: 'in_store' }, lines: [], note: '', method: 'cash',
    tenders: [], total: 10, received: 10, paid: '10', busy: true, error: null, onConfirm: confirm };
  let tree = nodes(CheckoutPanel(props));
  let button = tree.find(node => node.type === 'button' && node.props.onClick === confirm);
  assert.equal(button.props.disabled, true); assert.equal(button.props['aria-busy'], true);
  assert.ok(nodes(button).some(node => node.type === icons.RefreshCw && node.props.className === 'spin'));
  assert.ok(button.props.children.includes('Saving sale…'));
  tree = nodes(CheckoutPanel({ ...props, busy: false }));
  button = tree.find(node => node.type === 'button' && node.props.onClick === confirm);
  assert.equal(button.props.disabled, false); assert.equal(button.props['aria-busy'], false);
  assert.ok(!nodes(button).some(node => node.type === icons.RefreshCw));
});

test('completion hides routine success notices but keeps uncertain customer warnings and balances', async () => {
  const source = ts.createSourceFile('pos.tsx', fs.readFileSync('app/(dashboard)/dashboard/pos/pos-client.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let finish;
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'finishReceipt') finish = node; ts.forEachChild(node, visit); }
  visit(source); assert.ok(finish);
  const code = ts.transpileModule(finish.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const unconfirmed of [false, true]) {
    let notice, saved;
    const context = { lines: [], data: { products: [] }, method: 'cod',
      recoveryRef: { current: unconfirmed ? { createCustomer: true } : null },
      setSaleMeta() {}, setPending() {}, setReceipt: value => saved = value, clearCart() {},
      setDialog() {}, setNotice: value => notice = value, refresh: async () => {} };
    const receipt = { orderId: 'sale', orderNumber: 'POS-123', lines: [], remaining: 10 };
    await new Function(...Object.keys(context), `${code};return finishReceipt;`)(...Object.values(context))(receipt);
    assert.equal(saved, receipt); assert.equal(saved.remaining, 10);
    if (unconfirmed) { assert.equal(notice.kind, 'error'); assert.match(notice.text, /Do not repeat the sale/); }
    else assert.equal(notice, null);
  }
});
