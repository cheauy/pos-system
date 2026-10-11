// Real validation and action code; service doubles never contact a database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as stock from '../lib/inventory/stock-adjustment.ts';
const require = createRequire(import.meta.url);
const { loadTs } = require('./helpers/load-ts.cjs');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const item = (mode = 'increase', quantity = 2) => ({ productId: id(11), mode, quantity, expectedQuantity: 47 });

test('actual stock calculations preserve all three modes and negative previews', () => {
  assert.equal(stock.stockAfter(47, 'increase', 5), 52);
  assert.equal(stock.stockAfter(47, 'decrease', 5), 42);
  assert.equal(stock.stockAfter(47, 'set', 0), 0);
  assert.equal(stock.stockAfter(0, 'decrease', 1), -1);
});
test('mixed per-item draft preserves SKU identities and expected stock', () => {
  const rows = [item('decrease', 3), { ...item('set', 0), productId: id(12), expectedQuantity: 18 }];
  assert.deepEqual(stock.parseStockAdjustmentItems(JSON.stringify(rows)), rows);
});
for (const [name, rows] of Object.entries({ empty: [], duplicate: [item(), item()], fraction: [item('increase', 1.5)], negative: [item('set', -1)], zero: [item('decrease', 0)], overflow: [item('set', 2147483648)], identity: [{ ...item(), productId: 'wrong' }] })) {
  test(`draft validation rejects ${name}`, () => assert.throws(() => stock.parseStockAdjustmentItems(JSON.stringify(rows))));
}
function fixture(options = {}) {
  const calls = [], permissions = [], paths = [];
  const api = loadTs('app/(dashboard)/dashboard/inventory/adjustments/actions.ts', {
    '@/lib/inventory/stock-adjustment': stock,
    '@/lib/auth/require-permission': { requirePermission: async permission => { permissions.push(permission); if (options.denied) throw Error('Denied'); return { id: id(1), slug: 'fixture' }; } },
    '@/lib/branches/context': { assertOperatingBranch: async branch => { if (branch !== id(2)) throw Error('Wrong branch'); } },
    '@/lib/subscriptions/branch-limits': { assertBranchOperation: async () => { if (options.inactive) throw Error('Inactive branch'); } },
    '@/lib/supabase/branch-server': { createClient: async () => ({ rpc: async (name, args) => { calls.push({ name, args }); if (options.interrupted) throw Error('Interrupted'); return { data: { items: [] }, error: options.error ?? null }; } }) },
    'next/cache': { revalidatePath: path => { paths.push(path); if (options.cacheFailure) throw Error('Cache failure'); } },
    './state': { initialStockAdjustmentState: { success: false, message: '' } },
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({ locationId: id(2), requestId: id(80), items: JSON.stringify([item(), { ...item('set', 0), productId: id(12), expectedQuantity: 18 }]), reason: 'Stock count correction', reference: 'FIXTURE-ONLY', notes: 'Counted two shelves' })) form.set(key, value);
  return { save: () => api.submitStockAdjustmentBatch({}, form), form, calls, permissions, paths };
}
test('Save keeps one atomic batch request, branch/permission checks and audit fields', async () => {
  const f = fixture(); assert.equal((await f.save()).success, true);
  assert.deepEqual(f.permissions, ['products.stock_adjust']); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].name, 'tenh_adjust_branch_stock_batch');
  assert.equal(f.calls[0].args.p_items.length, 2);
  assert.equal(f.calls[0].args.p_location_id, id(2)); assert.equal(f.calls[0].args.p_request_id, id(80));
  assert.equal(f.calls[0].args.p_reason, 'Stock count correction — Counted two shelves');
  assert.equal(f.calls[0].args.p_reference, 'FIXTURE-ONLY');
  assert.ok(f.paths.includes('/dashboard/inventory/adjustments'));
});
test('Save accepts increase, decrease and exact zero together without changing quantities', async () => {
  const f = fixture(), items = [item('increase', 5), { ...item('decrease', 3), productId: id(12), expectedQuantity: 18 }, { ...item('set', 0), productId: id(13) }];
  f.form.set('items', JSON.stringify(items)); assert.equal((await f.save()).success, true);
  assert.equal(f.calls.length, 1); assert.deepEqual(f.calls[0].args.p_items, items);
});
for (const option of ['denied', 'inactive']) test(`Save blocks ${option} before any write`, async () => { const f = fixture({ [option]: true }); assert.equal((await f.save()).success, false); assert.equal(f.calls.length, 0); });
for (const [field, value] of [['locationId', id(3)], ['requestId', 'invalid'], ['items', '[]'], ['reason', 'x'], ['notes', 'x'.repeat(501)], ['reference', 'x'.repeat(201)]]) test(`Save validates ${field} before any write`, async () => { const f = fixture(); f.form.set(field, value); assert.equal((await f.save()).success, false); assert.equal(f.calls.length, 0); });
test('confirmed stock rejection keeps batch failed; interrupted response keeps safe retry', async () => {
  const rejection = await fixture({ error: { code: 'P0001', message: 'Not enough stock' } }).save();
  assert.equal(rejection.success, false); assert.equal(rejection.uncertain, false);
  assert.equal((await fixture({ interrupted: true }).save()).uncertain, true);
});
test('cache failure after saving cannot report a committed batch as failed', async () => assert.equal((await fixture({ cacheFailure: true }).save()).success, true));
