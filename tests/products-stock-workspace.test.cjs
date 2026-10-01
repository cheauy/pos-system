const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('./helpers/load-ts.cjs');
const h = React.createElement;
function pageFor(allowed) {
  const loaded = [], permissions = [];
  const view = name => { loaded.push(name); return { default: () => h('section', null, name + ' content') }; };
  const deps = {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: ({prefetch, ...props}) => h('a', props) },
    'lucide-react': { Boxes: () => null, Package: () => null, SlidersHorizontal: () => null },
    '@/lib/auth/require-permission': { requireAnyPermission: async required => { permissions.push(required); if (!allowed.length) throw Error('Denied'); return {id:'shop',role:'staff'}; } },
    '@/lib/auth/effective-permissions': { businessHasPermission: async (_, permission) => allowed.includes(permission) },
  };
  Object.defineProperty(deps, './products-view', { get: () => view('products') });
  Object.defineProperty(deps, '../inventory/inventory-view', { get: () => view('stock') });
  const Page = loadTs('app/(dashboard)/dashboard/products/page.tsx', deps).default;
  return { loaded, permissions, render: async params => renderToStaticMarkup(await Page({searchParams:Promise.resolve(params)})) };
}
test('merged workspace loads only the selected view and exposes both tabs without prefetching analytics', async () => {
  for (const [params, expected] of [[{},'products'],[{view:'stock'},'stock']]) {
    const c = pageFor(['products.view','inventory.view']); const html = await c.render(params);
    assert.deepEqual(c.loaded, [expected]); assert.match(html,/Products &amp; Stock/);
    assert.match(html,/href="\/dashboard\/products"/); assert.match(html,/href="\/dashboard\/products\?view=stock"/);
    assert.deepEqual(c.permissions, [['products.view','inventory.view']]);
  }
});
test('inventory-only and product-only staff keep their original access boundary', async () => {
  const stock = pageFor(['inventory.view']); const stockHtml = await stock.render({});
  assert.deepEqual(stock.loaded,['stock']); assert.doesNotMatch(stockHtml,/href="\/dashboard\/products"/);
  const products = pageFor(['products.view']); const productHtml = await products.render({view:'stock'});
  assert.deepEqual(products.loaded,['products']); assert.doesNotMatch(productHtml,/\?view=stock/);
  const denied = pageFor([]); await assert.rejects(denied.render({}), /Denied/); assert.deepEqual(denied.loaded,[]);
});
test('old Inventory bookmarks redirect to the merged Stock view', () => {
  const Page = loadTs('app/(dashboard)/dashboard/inventory/page.tsx', {'next/navigation':{redirect:path=>{throw Error(path);}}}).default;
  assert.throws(Page,/\/dashboard\/products\?view=stock/);
});
test('header offers Adjust Stock only on the stock tab with adjustment permission', async () => {
  const permitted = ['products.view', 'inventory.view', 'products.stock_adjust'];
  assert.match(await pageFor(permitted).render({view:'stock'}), /Adjust Stock/);
  assert.doesNotMatch(await pageFor(permitted).render({}), /Adjust Stock/);
  assert.doesNotMatch(await pageFor(['inventory.view']).render({view:'stock'}), /Adjust Stock/);
});
