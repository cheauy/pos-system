/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source fixtures use the repository's TS loader. */
// Executes the real bulk-delete server action with an RPC double. No database writes.
const test = require('node:test');
const assert = require('node:assert/strict');
const {loadTs} = require('./helpers/load-ts.cjs');

const A = '00000000-0000-4000-8000-00000000000a', B = '00000000-0000-4000-8000-00000000000b', C = '00000000-0000-4000-8000-00000000000c';
function load({business = 'biz', failId = B} = {}) {
  const calls = [], permissions = [];
  const db = {rpc: async (name, args) => {
    calls.push({name, args});
    return args.p_order_id === failId ? {error: {code: 'P0001', message: 'This order has payment history.'}} : {error: null};
  }};
  const api = loadTs('app/(dashboard)/dashboard/orders/order-workspace-actions.ts', {
    'next/cache': {revalidatePath() {}},
    '@/lib/auth/require-permission': {requirePermission: async key => {permissions.push(key); return {id: business};}},
    '@/lib/supabase/branch-server': {createClient: async () => db},
    '@/lib/audit/create-audit-log': {createAuditLog: async () => {}},
    './order-workspace-data': {loadOrderDetail: async () => ({})},
  });
  return {api, calls, permissions};
}

test('bulk delete runs the single-order delete RPC per selected order and reports partial failures', async () => {
  const h = load();
  const r = await h.api.deleteOrderWorkspaceOrders([{id: A, updatedAt: '2026-10-01T00:00:00Z'}, {id: B, updatedAt: '2026-10-01T00:00:00Z'}, {id: A, updatedAt: '2026-10-01T00:00:00Z'}], ' duplicate ', 'biz');
  assert.equal(r.success, true);
  assert.deepEqual(r.data.deleted, [A]);
  assert.deepEqual(r.data.failed, [{id: B, message: 'This order has payment history.'}]);
  assert.equal(h.calls.length, 2, 'duplicates are submitted once');
  for (const call of h.calls) {
    assert.equal(call.name, 'tenh_manage_order');
    assert.equal(call.args.p_business_id, 'biz');
    assert.equal(call.args.p_action, 'delete');
    assert.deepEqual(call.args.p_payload, {reason: 'duplicate'});
  }
  assert.deepEqual(h.permissions, ['orders.cancel']);
});

test('bulk delete never crosses businesses and validates input before any RPC', async () => {
  const h = load({business: 'other'});
  assert.equal((await h.api.deleteOrderWorkspaceOrders([{id: A, updatedAt: null}], 'r', 'biz')).success, false);
  const v = load();
  assert.equal((await v.api.deleteOrderWorkspaceOrders([], 'r', 'biz')).success, false);
  assert.equal((await v.api.deleteOrderWorkspaceOrders([{id: A, updatedAt: null}], '  ', 'biz')).success, false);
  assert.equal((await v.api.deleteOrderWorkspaceOrders(Array.from({length: 51}, () => ({id: C, updatedAt: null})), 'r', 'biz')).success, false);
  const bad = await v.api.deleteOrderWorkspaceOrders([{id: 'not-a-uuid', updatedAt: null}], 'r', 'biz');
  assert.equal(bad.success, true); assert.equal(bad.data.failed.length, 1);
  assert.equal(h.calls.length + v.calls.length, 0);
});
