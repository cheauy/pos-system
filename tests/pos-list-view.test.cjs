const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const ts = require('typescript');
const jsx = require('react/jsx-runtime'), icons = require('lucide-react');
const { translateUiText } = require('./helpers/load-ts.cjs').loadTs('lib/i18n/translations.ts');
const file = ts.createSourceFile('pos.tsx', fs.readFileSync('app/(dashboard)/dashboard/pos/pos-client.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate) {
  let result;
  function visit(node) { if (predicate(node)) result = node; ts.forEachChild(node, visit); }
  visit(file); assert.ok(result, 'Expected POS source node'); return result;
}
const catalog = find(node => ts.isJsxElement(node) && node.openingElement.attributes.getText(file).includes("view === 'grid' ? s.productGrid : s.productList"));
const toggle = find(node => ts.isJsxElement(node) && node.openingElement.attributes.getText(file).includes('s.viewToggle'));
function evaluate(node, context) {
  const code = ts.transpileModule(`function render(){return ${node.getText(file)};}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  return new Function('require', 'exports', ...Object.keys(context), `${code};return render();`)(() => jsx, {}, ...Object.values(context));
}
function nodes(node) { return !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]; }
const base = { key: 'simple', name: 'A long product name ដែលមានឈ្មោះវែង', price: 12, stock: 7, threshold: 2, category: 'Category', favorite: false, image: null, variants: [{ id: 'simple', sku: 'SKU-1' }] };
function context(view, groups) {
  return { ...icons, s: new Proxy({}, { get: (_, key) => key }), view, groups, shown: 32, lines: [], branch: 'branch', data: {}, frozen: false,
    inventoryFor: () => ({ unassigned: 0 }), isVariantGroup: group => group.variants.length > 1 || group.variants.some(p => p.product_type === 'variant'),
    cash: value => `$${value.toFixed(2)}`, translateText: value => value, formatUiText: (_, values) => values.join(' '),
    ProductImage: () => null, chooseGroup() {}, favorite() {} };
}

test('List View exposes compact selection, meaningful variant pricing, stock and separate favorites', () => {
  const variant = { ...base, key: 'variant', stock: 1, variants: [{ id: 'a' }, { id: 'b' }] };
  const empty = { ...base, key: 'empty', stock: 0 };
  const selected = [], favorites = [], ctx = context('list', [base, variant, empty]);
  ctx.chooseGroup = group => selected.push(group); ctx.favorite = key => favorites.push(key);
  const tree = nodes(evaluate(catalog, ctx)), cards = tree.filter(n => n.type === 'article');
  assert.equal(cards.length, 3); assert.ok(cards.every(n => n.props.className === 'compactProduct'));
  assert.deepEqual(cards.map(n => n.props['data-stock']), ['available', 'low', 'empty']);
  const selection = tree.filter(n => n.type === 'button' && n.props.className === 'compactSelect');
  selection.forEach(button => button.props.onClick()); assert.deepEqual(selected, [base, variant, empty]);
  assert.match(selection[1].props['aria-label'], /^Choose Options /);
  assert.match(selection[2].props['aria-label'], /^View stock /);
  assert.equal(selection[0].props.title, base.name);
  assert.equal(nodes(cards[1]).find(n => n.props?.className === 'compactPrice').props.children, '$12.00');
  assert.ok(!tree.some(n => ['sku', 'addButton', 'productInfo', 'stockBadge'].includes(n.props?.className)));
  tree.find(n => n.type === 'button' && n.props.className.startsWith('compactFavorite')).props.onClick();
  assert.deepEqual(favorites, ['simple']); assert.equal(selected.length, 3);
  assert.equal(tree.find(n => n.type === ctx.ProductImage).props.src, null);
  assert.ok(nodes(evaluate(catalog, { ...ctx, frozen: true })).filter(n => n.props?.className === 'compactSelect').every(n => n.props.disabled));
});

test('Grid View retains detailed cards and original add and favorite actions', () => {
  const ctx = context('grid', [base]), selected = []; ctx.chooseGroup = group => selected.push(group);
  const tree = nodes(evaluate(catalog, ctx));
  assert.equal(tree[0].props.className, 'productGrid');
  assert.ok(tree.some(n => n.type === 'article' && n.props.className === 'productCard'));
  assert.ok(tree.some(n => n.props?.className === 'sku'));
  const add = tree.find(n => n.type === 'button' && n.props.className === 'addButton');
  add.props.onClick(); assert.deepEqual(selected, [base]);
  assert.ok(!tree.some(n => n.props?.className === 'compactProduct'));
});

test('one native button switches Grid to List to Grid with the next-view icon and localized labels', () => {
  for (const language of ['en', 'km']) {
    let view = 'grid';
    for (const expected of ['grid', 'list', 'grid']) {
      assert.equal(view, expected);
      const tree = nodes(evaluate(toggle, { ...icons, s: { viewToggle: 'toggle', activeView: 'active' }, view,
        translateText: text => translateUiText(text, language), setView: update => view = update(view) }));
      const buttons = tree.filter(n => n.type === 'button');
      assert.equal(buttons.length, 1);
      const button = buttons[0], label = translateUiText(view === 'grid' ? 'Switch to List View' : 'Switch to Grid View', language);
      assert.equal(button.props.type, 'button');
      assert.equal(button.props['aria-label'], label); assert.equal(button.props.title, label);
      if (language === 'km') assert.match(label, /ប្តូរទៅទិដ្ឋភាព/);
      assert.equal(button.props.className, 'active');
      assert.equal(button.props.children.type, view === 'grid' ? icons.List : icons.Grid2X2);
      assert.equal(evaluate(catalog, context(view, [base])).props.className, view === 'grid' ? 'productGrid' : 'productList');
      button.props.onClick();
    }
  }
});

test('both price displays use the same variant amount and currency formatter without a prefix', () => {
  const variant = { ...base, key: 'variant', price: 19.75, variants: [{ id: 'a' }, { id: 'b' }] };
  for (const view of ['grid', 'list']) for (const language of ['en', 'km']) {
    const amounts = [], ctx = context(view, [variant]);
    ctx.translateText = text => translateUiText(text, language);
    ctx.cash = amount => { amounts.push(amount); return 'KHR 79,000'; };
    const tree = nodes(evaluate(catalog, ctx));
    const price = view === 'list' ? tree.find(n => n.props?.className === 'compactPrice') : nodes(tree.find(n => n.props?.className === 'priceRow')).find(n => n.type === 'strong');
    assert.equal(price.props.children, 'KHR 79,000'); assert.deepEqual(amounts, [19.75]);
  }
});

test('compact selection still enters the existing variant, stock and configurable option flows', () => {
  const choose = find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'chooseGroup');
  const code = ts.transpileModule(choose.getText(file), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let groupChosen, productChosen, dialog;
  const run = new Function('isVariantGroup', 'setVariantGroup', 'open', 'chooseProduct', `${code};return chooseGroup;`)(
    context('list', []).isVariantGroup, group => groupChosen = group, next => dialog = next, product => productChosen = product);
  run({ ...base, variants: [{ id: 'a' }, { id: 'b' }] }); assert.equal(dialog, 'variant'); assert.equal(groupChosen.variants.length, 2);
  run({ ...base, stock: 0 }); assert.equal(dialog, 'variant'); assert.equal(groupChosen.stock, 0);
  const configurable = { ...base, variants: [{ id: 'options', product_type: 'configurable' }] };
  run(configurable); assert.equal(productChosen, configurable.variants[0]);
  run(base); assert.equal(productChosen, base.variants[0]);
  const productFlow = find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'chooseProduct');
  const productCode = ts.transpileModule(productFlow.getText(file), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let options, added;
  const select = new Function('data','setOptionProduct','setOptionIds','open','addProduct',`${productCode};return chooseProduct;`)(
    { options: [{ id: 'default', product_id: 'options', is_active: true, is_default: true }] }, () => {}, value => options = value, value => dialog = value, value => added = value);
  select(configurable.variants[0]); assert.equal(dialog, 'options'); assert.deepEqual(options, ['default']);
  select(base.variants[0]); assert.equal(added, base.variants[0]);
});
