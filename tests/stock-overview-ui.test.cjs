const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('./helpers/load-ts.cjs');
const { default: StockOverview } = loadTs('app/(dashboard)/dashboard/inventory/inventory-client.tsx', {
  react: React,
  'next/navigation': { useRouter: () => ({ refresh() {}, push() {} }) },
  sonner: { toast: { error() {} } },
  '@/components/anchored-action-menu': { default: ({label, children}) => React.createElement('div', {}, label, children) },
  '@/lib/inventory/stock-adjustment': { stockAdjustmentLink: () => '' },
  '../products/actions': {},
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  '@/components/product-photo': { default: props => React.createElement('img', props) },
  'lucide-react': require('lucide-react'),
});
const products = ['normal', 'low', 'empty', 'other-branch'].map(id => ({
  id, name: id, stock_quantity: 999, low_stock_quantity: 1,
  cost_price: 2, selling_price: 5, sold_30d: 0, is_active: true,
}));
const props = {
  defaultBranchId: 'main', products, categories: [],
  locations: [{ id: 'main', name: 'Main', code: 'M' }],
  locationStock: [10, 1, 0].map((quantity, index) => ({
    location_id: 'main', product_id: products[index].id, quantity, low_stock_threshold: 2,
  })),
};
test('stock insights use selected branch quantities, not catalog stock', () => {
  const html = renderToStaticMarkup(React.createElement(StockOverview, props));
  assert.match(html, /1 in stock, 1 low stock, 1 out of stock/);
  assert.match(html, /\$22\.00/);
  assert.doesNotMatch(html, /other-branch|999/);
  assert.match(html, /Low stock alerts/);
  assert.match(html, /Stock distribution/);
  assert.match(html, /aria-label="Stock views"/);
  assert.match(html, /Low Stock \(1\)/);
  assert.match(html, /Out of Stock \(1\)/);
  assert.doesNotMatch(html, /aria-label="Stock view"|View details|Edit product/);
});
test('empty branch has a valid empty chart and no fabricated alerts', () => {
  const html = renderToStaticMarkup(React.createElement(StockOverview, { ...props, locationStock: [] }));
  assert.match(html, /0 in stock, 0 low stock, 0 out of stock/);
  assert.doesNotMatch(html, /NaN|Infinity|conic-gradient/);
  assert.match(html, /All items are above their stock thresholds/);
});

test('stock selection never opens details and sort keeps the selection', () => {
  let cursor = 0;
  const states = [];
  const { default: Inventory } = loadTs('app/(dashboard)/dashboard/inventory/inventory-client.tsx', {
    react: { useState: initial => { const id = cursor++; if (!(id in states)) states[id] = initial; return [states[id], value => { states[id] = typeof value === 'function' ? value(states[id]) : value; }]; }, useMemo: fn => fn(), useEffect() {} },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: 'a' }, 'next/navigation': { useRouter: () => ({}) },
    sonner: { toast: { error() {} } }, 'lucide-react': require('lucide-react'),
    '@/components/product-photo': { default: 'img' },
    '@/components/anchored-action-menu': { default: 'action-menu' },
    '@/lib/inventory/stock-adjustment': { stockAdjustmentLink: () => '' }, '../products/actions': {},
  });
  const render = () => { cursor = 0; return Inventory(props); };
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  const find = (tree, predicate) => nodes(tree).find(predicate);
  const row = find(render(), node => typeof node.type === 'function' && node.props.onToggle);
  const renderedRow = row.type(row.props);
  const rowActions = nodes(row.props.actions).filter(node => node.type === 'button');
  assert.equal(rowActions.length, 3);
  assert.deepEqual(rowActions.map(node => node.props.children.at(-1)), ['Adjust Stock', 'Hide', 'Delete']);
  find(renderedRow, node => node.type === 'input').props.onChange();
  const selectedRow = find(render(), node => typeof node.type === 'function' && node.props.onToggle && node.props.selected);
  assert.ok(selectedRow);
  assert.equal(find(render(), node => node.props.selectedBranchRows), undefined);
  assert.equal(find(render(), node => node.props.onClose && node.props.product), undefined, 'checkbox must not open detail drawer');
  assert.equal(find(render(), node => node.type === 'action-menu' && node.props.label.startsWith('Actions')).props.label, 'Actions (1)');
  find(render(), node => node.props['aria-label'] === 'Sort stock').props.onChange({ target: { value: 'stock' } });
  assert.equal(find(render(), node => typeof node.type === 'function' && node.props.onToggle).props.product.displayStock, 0);
  find(render(), node => node.props['aria-label'] === 'Select products on this page').props.onChange();
  assert.equal(find(render(), node => node.type === 'action-menu' && node.props.label.startsWith('Actions')).props.label, 'Actions (3)');
  find(render(), node => node.props['aria-label'] === 'Select products on this page').props.onChange();
  assert.equal(find(render(), node => node.type === 'action-menu' && node.props.label.startsWith('Actions')), undefined);
  row.props.onSelect();
  assert.ok(find(render(), node => node.props.onClose && node.props.product), 'row click still opens details');
});
