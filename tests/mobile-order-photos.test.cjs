const test = require('node:test'), assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { loadMobileOrderPhotos } = loadTs('lib/mobile/order-photos.ts');
function database(orders, products, failure) {
  const calls = [];
  return { calls, from(table) {
    const log = { table, steps: [] }; calls.push(log);
    const query = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit']) query[method] = (...args) => { log.steps.push([method, ...args]); return query; };
    query.then = resolve => Promise.resolve({ data: table === 'orders' ? orders : products, error: failure === table ? { message: 'Unavailable' } : null }).then(resolve);
    return query;
  } };
}
test('order photo previews stay on the authorized page and branch and prefer branch variant images', async () => {
  const db = database([{ id: 'order-1', order_items: [{ id: 'item-1', product_id: 'product-1', product_name: 'Blue shirt', products: { image_url: 'shared.jpg', variant_image_url: null } }] }], [{ id: 'product-1', image_url: 'branch.jpg', variant_image_url: 'blue.webp' }]);
  const photos = await loadMobileOrderPhotos(db, 'business-1', 'branch-1', ['order-1']);
  assert.deepEqual(photos.get('order-1'), [{ id: 'item-1', name: 'Blue shirt', imageUrl: 'blue.webp', fallbackImageUrl: 'branch.jpg' }]);
  assert.ok(db.calls[0].steps.some(step => JSON.stringify(step) === JSON.stringify(['eq', 'business_id', 'business-1'])));
  assert.ok(db.calls[0].steps.some(step => JSON.stringify(step) === JSON.stringify(['eq', 'location_id', 'branch-1'])));
  assert.ok(db.calls[0].steps.some(step => JSON.stringify(step) === JSON.stringify(['in', 'id', ['order-1']])));
  assert.ok(db.calls[0].steps.some(step => JSON.stringify(step) === JSON.stringify(['limit', 3, { referencedTable: 'order_items' }])));
  assert.ok(db.calls[1].steps.some(step => JSON.stringify(step) === JSON.stringify(['eq', 'business_id', 'business-1'])));
});
test('empty pages make no extra requests and products without photos are allowed', async () => {
  const empty = database([], []);
  assert.equal((await loadMobileOrderPhotos(empty, 'business', 'branch', [])).size, 0);
  assert.equal(empty.calls.length, 0);
  const deleted = database([{ id: 'order', order_items: [{ id: 'item', product_id: null, product_name: 'Deleted item', products: null }] }], []);
  assert.equal((await loadMobileOrderPhotos(deleted, 'business', 'branch', ['order'])).get('order')[0].imageUrl, null);
});
test('photo query failures can be reported without suppressing the order list', async () => {
  await assert.rejects(loadMobileOrderPhotos(database([], [], 'orders'), 'business', 'branch', ['order']), /photos could not be loaded/);
});
