/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source fixtures use the repository's TS loader. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const {loadTs} = require('./helpers/load-ts.cjs');
const currency = loadTs('lib/currency-format.ts');
const posCurrency = loadTs('app/(dashboard)/dashboard/pos/pos-currency.ts', {'@/lib/currency-format': currency});
const helperPath = 'app/(dashboard)/dashboard/pos/pos-workspace-helpers.ts';
const indexed = loadTs(helperPath, {'./pos-currency': posCurrency});
// Equivalence oracle: execute the former full-array lookup expressions with
// the same arithmetic, grouping, cart validation and held-order code.
const source = fs.readFileSync(path.join(__dirname, '..', helperPath), 'utf8');
assert.ok(source.includes('stockIndex(data.stock).byProduct.get(product.id) ?? []'));
const referenceSource = source
  .replace('stockIndex(data.stock).byProduct.get(product.id) ?? []', 'data.stock.filter(row => row.product_id === product.id)')
  .replace('stockIndex(data.stock).byProductBranch.get(product.id)?.get(branchId)?.low_stock_threshold', 'data.stock.find(row => row.location_id === branchId && row.product_id === product.id)?.low_stock_threshold');
const referenceModule = {exports: {}};
const referenceCode = ts.transpileModule(referenceSource, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;
new Function('require', 'module', 'exports', referenceCode)(id => {
  assert.equal(id, './pos-currency'); return posCurrency;
}, referenceModule, referenceModule.exports);
const reference = referenceModule.exports;
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); Object.values(value).forEach(freeze);
  }
  return value;
}

test('indexed stock preserves inventory, thresholds and catalog filters across branch/quantity edge cases', () => {
  let seed = 1729;
  const random = n => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n;};
  const odd = [null, undefined, -1, 0, 1, 2, 10, 1.5, NaN, Infinity, '3', 'broken', Number.MAX_SAFE_INTEGER + 1];
  for (let trial = 0; trial < 120; trial++) {
    const products = Array.from({length: 8}, (_, i) => ({id: 'p' + i, name: 'P ' + i, stock_quantity: odd[random(odd.length)], low_stock_quantity: odd[random(odd.length)], selling_price: i * 10, created_at: '2026-10-04T00:00:00Z', variant_group_id: i < 3 ? 'group' : null, color: i % 2 ? 'Red' : 'Blue', size: String(i), category_id: 'c' + i % 2, sold: i}));
    const stock = Array.from({length: 18}, () => ({product_id: 'p' + random(10), location_id: 'b' + random(3), quantity: odd[random(odd.length)], low_stock_threshold: odd[random(odd.length)]}));
    const data = freeze({products, stock, branches: [{id: 'b0'}, {id: 'b1'}], inventoryVersion: trial % 2 ? 2 : 1, inventoryLocationCount: trial % 3 ? 2 : 1, categories: [{id: 'c0', name: 'C0'}, {id: 'c1', name: 'C1'}], groups: [], options: []});
    for (const branch of ['', 'b0', 'b1', 'b2', 'missing']) for (const product of products) {
      assert.deepEqual(indexed.inventoryFor(product, branch, data), reference.inventoryFor(product, branch, data));
      assert.deepEqual(indexed.thresholdFor(product, branch, data), reference.thresholdFor(product, branch, data));
    }
    for (const filters of [indexed.EMPTY_FILTERS, {...indexed.EMPTY_FILTERS, stock: 'in', sort: 'name'}, {...indexed.EMPTY_FILTERS, stock: 'out', color: 'Blue', sort: 'priceDesc'}, {...indexed.EMPTY_FILTERS, search: 'P 1', favoritesOnly: true}, {...indexed.EMPTY_FILTERS, category: 'c1', stock: 'low'}]) {
      assert.deepEqual(indexed.productGroups(data, 'b0', filters, ['variant:group', 'p4']), reference.productGroups(data, 'b0', filters, ['variant:group', 'p4']));
    }
  }
});

test('a refreshed stock snapshot is reindexed; first duplicate remains the branch record', () => {
  const product = {id: 'p', name: 'Product', stock_quantity: 20, low_stock_quantity: 2};
  const data = {stock: [{product_id: 'p', location_id: 'b', quantity: 3, low_stock_threshold: 1}, {product_id: 'p', location_id: 'b', quantity: 4, low_stock_threshold: 9}], branches: [{id: 'b'}], inventoryVersion: 2, inventoryLocationCount: 2};
  assert.equal(indexed.stockFor(product, 'b', data), 3);
  assert.equal(indexed.inventoryFor(product, 'b', data).assigned, 7);
  assert.equal(indexed.thresholdFor(product, 'b', data), 1);
  const fresh = {...data, stock: [{product_id: 'p', location_id: 'b', quantity: 8, low_stock_threshold: 5}]};
  assert.equal(indexed.stockFor(product, 'b', fresh), 8);
  assert.equal(indexed.thresholdFor(product, 'b', fresh), 5);
  assert.equal(indexed.stockFor(product, 'b', data), 3);
});

test('grouping builds one stock index rather than scanning the catalog for every product', () => {
  let reads = 0;
  const products = Array.from({length: 1000}, (_, i) => ({id: 'p' + i, name: 'P ' + i, selling_price: 10, stock_quantity: 20, low_stock_quantity: 5, created_at: '2026-10-04T00:00:00Z'}));
  const data = {products, stock: products.map(p => ({get product_id() {reads++; return p.id;}, location_id: 'b', quantity: 20, low_stock_threshold: 5})), categories: [], branches: [{id: 'b'}], inventoryVersion: 2, inventoryLocationCount: 1};
  assert.equal(indexed.productGroups(data, 'b', indexed.EMPTY_FILTERS, []).length, 1000);
  assert.equal(reads, products.length, 'Index construction must visit each stock row once');
  const coldReads = reads;
  indexed.productGroups(data, 'b', indexed.EMPTY_FILTERS, []);
  assert.equal(reads, coldReads, 'Warm grouping must reuse this immutable snapshot');
});

test('stock indexing preserves stale price/stock rejection and held-order currency checks', () => {
  const product = {id: 'p', name: 'Product', selling_price: 10, stock_quantity: 9, low_stock_quantity: 2, product_type: 'standard'};
  const data = {products: [product], stock: [{product_id: 'p', location_id: 'b', quantity: 7, low_stock_threshold: 4}], branches: [{id: 'b'}], inventoryVersion: 2, inventoryLocationCount: 2, settings: {currency: 'USD'}, groups: [], options: [], customers: [], categories: []};
  for (const quantity of [1, 4, 10]) for (const unitPrice of [10, 9]) {
    const lines = [{productId: 'p', name: 'Product', quantity, unitPrice, optionIds: []}];
    assert.deepEqual(indexed.cartIssue(lines, 'b', data), reference.cartIssue(lines, 'b', data));
  }
  const held = {draft: {baseCurrency: 'USD', branchId: 'b', lines: [{productId: 'p', name: 'Product', quantity: 1, optionIds: []}], customerId: '', discount: '0', deliveryFee: '0', points: '0', note: '', paymentMethod: 'cash'}};
  assert.deepEqual(indexed.restoreHeldDraft(held, data), reference.restoreHeldDraft(held, data));
  assert.throws(() => indexed.restoreHeldDraft({...held, draft: {...held.draft, baseCurrency: 'KHR'}}, data), /currency changed/);
});
