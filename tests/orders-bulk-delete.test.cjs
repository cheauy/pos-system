/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source fixtures use the repository's TS loader. */
// Executes the real bulk-delete server action with an RPC double. No database writes.
const test = require('node:test');
const assert = require('node:assert/strict');
const {loadTs} = require('./helpers/load-ts.cjs');

const A = '00000000-0000-4000-8000-00000000000a', B = '00000000-0000-4000-8000-00000000000b', C = '00000000-0000-4000-8000-00000000000c';
function load({business = 'biz', failId = B} = {}) {
  const calls = [], permissions = [];
  const db = {from: () => ({select: () => ({eq: () => ({eq: () => ({maybeSingle: async () => ({data: {updated_at: '2026-10-02T00:00:00Z'}})})})})}), rpc: async (name, args) => {
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

test('bulk status runs the single-order status RPC per order and reports partial failures', async () => {
  const h = load();
  const v = '2026-10-01T00:00:00Z';
  const r = await h.api.changeOrderWorkspaceStatuses([{id: A, updatedAt: v, steps: ['pending']}, {id: B, updatedAt: v, steps: ['preparing']}, {id: A, updatedAt: v, steps: ['pending']}, {id: C, updatedAt: null, steps: ['completed']}], 'biz');
  assert.equal(r.success, true);
  assert.deepEqual(r.data.updated, [A]);
  assert.deepEqual(r.data.failed.map(f => f.id), [B, C], 'RPC failure and stale version are both reported, not skipped silently');
  assert.equal(h.calls.length, 2, 'duplicates and versionless rows are not submitted');
  for (const call of h.calls) {
    assert.equal(call.name, 'tenh_manage_order');
    assert.equal(call.args.p_action, 'status');
    assert.equal(call.args.p_expected_updated_at, v);
  }
  assert.deepEqual(h.calls.map(c => c.args.p_payload.status), ['pending', 'preparing']);
  assert.deepEqual(h.permissions, ['orders.update']);
});

test('bulk status refuses cancellation, other businesses and bad input before any RPC', async () => {
  const v = load();
  const cancel = await v.api.changeOrderWorkspaceStatuses([{id: A, updatedAt: '2026-10-01T00:00:00Z', steps: ['cancelled']}], 'biz');
  assert.equal(cancel.success, true); assert.deepEqual(cancel.data.updated, []); assert.equal(cancel.data.failed.length, 1);
  assert.equal((await v.api.changeOrderWorkspaceStatuses([], 'biz')).success, false);
  assert.equal((await v.api.changeOrderWorkspaceStatuses(Array.from({length: 51}, () => ({id: C, updatedAt: null, steps: ['pending']})), 'biz')).success, false);
  const h = load({business: 'other'});
  assert.equal((await h.api.changeOrderWorkspaceStatuses([{id: A, updatedAt: '2026-10-01T00:00:00Z', steps: ['pending']}], 'biz')).success, false);
  assert.equal(h.calls.length + v.calls.length, 0);
});

test('bulk status turns a thrown RPC into a reported, unconfirmed failure', async () => {
  const h = load();
  h.calls.push = () => { throw new Error('network'); };
  const r = await h.api.changeOrderWorkspaceStatuses([{id: A, updatedAt: '2026-10-01T00:00:00Z', steps: ['pending']}], 'biz');
  assert.deepEqual(r.data.updated, []);
  assert.match(r.data.failed[0].message, /could not be confirmed/);
});

test('orders selection bar exposes one Actions menu with Change status and Delete, no standalone bulk Delete', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../app/(dashboard)/dashboard/orders/orders-workspace.tsx'), 'utf8');
  const bar = src.slice(src.indexOf('className={styles.selectionBar}'), src.indexOf('<div className={styles.tableScroll}>'));
  assert.match(bar, /Actions<ChevronDown/);
  assert.doesNotMatch(bar, /setBulkDeleteOpen|Trash2/, 'bulk delete only lives in the Actions menu');
  const menu = src.slice(src.indexOf('function BulkActionsMenu'), src.indexOf('function useMenuDismiss'));
  assert.match(menu, /Change status/); assert.match(menu, /onClick=\{onDelete\}/);
  assert.match(src, /onAction\("delete", menu\.row\)/, 'single-order delete preserved');
});

test('mixed selections: every next step maps to exactly one bulk target, final orders to none', () => {
  const {nextStatuses} = loadTs('app/(dashboard)/dashboard/orders/order-workspace-types.ts', {});
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../app/(dashboard)/dashboard/orders/orders-workspace.tsx'), 'utf8');
  const groups = [...src.slice(src.indexOf('const bulkTargets'), src.indexOf('];', src.indexOf('const bulkTargets'))).matchAll(/values: \[([^\]]+)\]/g)].map(m => JSON.parse(`[${m[1]}]`));
  const row = (source, status, onlineStatus = null) => ({source, status, onlineStatus});
  const cases = [[row('pos', 'new'), 0], [row('pos', 'pending'), 1], [row('pos', 'in_progress'), 2],
    [row('online', 'new', 'new'), 0], [row('online', 'pending', 'accepted'), 1], [row('online', 'in_progress', 'preparing'), 2], [row('qr', 'in_progress', 'ready'), 2]];
  for (const [r, group] of cases) {
    const next = nextStatuses(r, true)[0].value;
    assert.deepEqual(groups.map((g, i) => g.includes(next) ? i : -1).filter(i => i >= 0), [group], `${r.source}/${r.status}`);
  }
  for (const status of ['completed', 'cancelled', 'refunded']) assert.deepEqual(nextStatuses(row('pos', status), true), []);
});

test('bulk status walks normal steps with each step\'s fresh version, and reports a stop mid-way', async () => {
  const h = load({failId: null});
  const r = await h.api.changeOrderWorkspaceStatuses([{id: A, updatedAt: '2026-10-01T00:00:00Z', steps: ['in_progress', 'completed']}], 'biz');
  assert.deepEqual(r.data.updated, [A]);
  assert.deepEqual(h.calls.map(c => [c.args.p_payload.status, c.args.p_expected_updated_at]), [['in_progress', '2026-10-01T00:00:00Z'], ['completed', '2026-10-02T00:00:00Z']]);
  const f = load();
  const r2 = await f.api.changeOrderWorkspaceStatuses([{id: B, updatedAt: '2026-10-01T00:00:00Z', steps: ['in_progress', 'completed']}], 'biz');
  assert.deepEqual(r2.data.updated, []);
  assert.equal(f.calls.length, 1, 'a failed step stops the chain');
  const g = load();
  const bad = await g.api.changeOrderWorkspaceStatuses([{id: A, updatedAt: '2026-10-01T00:00:00Z', steps: ['in_progress', 'cancelled']}], 'biz');
  assert.equal(bad.data.failed.length, 1); assert.equal(g.calls.length, 0, 'a cancel anywhere in the chain is refused before any write');
});
