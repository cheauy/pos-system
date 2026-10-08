// Unit tests with an RPC double: they run the real order server actions but never reach a
// database. They are not E2E tests. The SQL migrations are exercised separately in disposable
// PGlite databases: tests/order-stale-conflict.integration.cjs (full captured body) and
// tests/cancel-order-item-conflict.integration.cjs (captured production body); npm run test:sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTs} from './helpers/load-ts.cjs';

const A = '00000000-0000-4000-8000-00000000000a', B = '00000000-0000-4000-8000-00000000000b';
const V = '2026-10-01T00:00:00Z';
const stale = {code: 'PT409', message: 'This order changed since you opened it. Refresh and try again.'};

function load(error = stale) {
  const calls = [], reads = [];
  const db = {
    from: () => { reads.push('orders'); return {select: () => ({eq: () => ({eq: () => ({maybeSingle: async () => ({data: {updated_at: V}})})})})}; },
    rpc: async (name, args) => { calls.push({name, args}); return {error}; },
  };
  const api = loadTs('app/(dashboard)/dashboard/orders/order-workspace-actions.ts', {
    'next/cache': {revalidatePath() { throw new Error('a failed action must not revalidate'); }},
    '@/lib/auth/require-permission': {requirePermission: async () => ({id: 'biz'})},
    '@/lib/supabase/branch-server': {createClient: async () => db},
    '@/lib/audit/create-audit-log': {createAuditLog: async () => {}},
    './order-workspace-data': {loadOrderDetail: async () => ({})},
  });
  return {api, calls, reads};
}

test('single-order actions show refresh guidance for a PT409 stale conflict and call the RPC once', async () => {
  for (const run of [
    api => api.changeOrderWorkspaceStatus(A, V, 'completed', '', 'biz'),
    api => api.saveOrderWorkspaceDetails(A, V, {note: 'x'}, 'biz'),
    api => api.deleteOrderWorkspaceOrder(A, V, 'dup', 'biz'),
  ]) {
    const h = load();
    const r = await run(h.api);
    assert.equal(r.success, false);
    assert.equal(r.message, stale.message, 'the database refresh message is shown, not the generic error');
    assert.doesNotMatch(r.message, /Error PT409/);
    assert.equal(h.calls.length, 1, 'no automatic retry');
    assert.equal(h.calls[0].name, 'tenh_manage_order');
  }
});

test('PT409 without a message still tells the user to refresh', async () => {
  const r = await load({code: 'PT409', message: ''}).api.changeOrderWorkspaceStatus(A, V, 'completed', '', 'biz');
  assert.match(r.message, /Refresh/);
});

test('bulk status stops a stale order at the first step and does not retry or re-read it', async () => {
  const h = load();
  const r = await h.api.changeOrderWorkspaceStatuses([{id: A, updatedAt: V, steps: ['in_progress', 'completed']}, {id: B, updatedAt: V, steps: ['pending']}], 'biz');
  assert.deepEqual(r.data.updated, []);
  assert.deepEqual(r.data.failed, [{id: A, message: stale.message}, {id: B, message: stale.message}]);
  assert.equal(h.calls.length, 2, 'one RPC per order, none repeated');
  assert.equal(h.reads.length, 0, 'no fresh-version re-read after a conflict');
});

test('bulk delete reports each stale order once with refresh guidance', async () => {
  const h = load();
  const r = await h.api.deleteOrderWorkspaceOrders([{id: A, updatedAt: V}, {id: B, updatedAt: V}], 'dup', 'biz');
  assert.deepEqual(r.data.failed.map(f => f.message), [stale.message, stale.message]);
  assert.equal(h.calls.length, 2);
});

test('legacy 40001 is still shown as-is for databases without the forward migration', async () => {
  const r = await load({code: '40001', message: 'This order changed. Refresh.'}).api.changeOrderWorkspaceStatus(A, V, 'completed', '', 'biz');
  assert.equal(r.message, 'This order changed. Refresh.');
});

test('forward migration keeps the production version and never writes a 40001 raise', () => {
  const sql = fs.readFileSync('supabase/migrations/20261007174209_fix_order_conflict_nonretryable_sqlstate.sql', 'utf8');
  assert.match(sql, /tenh_manage_order\(uuid,uuid,timestamptz,text,jsonb\)/);
  assert.match(sql, /execute replace\(source, old_raise, new_raise\)/);
  assert.match(sql, /new_raise constant text := [^\n]*errcode='PT409'/);
  assert.doesNotMatch(sql, /execute old_raise|execute replace\(source, new_raise/);
});

const itemStale = {code: 'PT409', message: 'This order changed. Refresh before cancelling an item.'};

test('item cancel shows refresh guidance for a PT409 stale conflict and calls the RPC once', async () => {
  const h = load(itemStale);
  const r = await h.api.cancelOrderWorkspaceItem(A, B, V, 'Out of stock', 'biz');
  assert.deepEqual(r, {success: false, status: 409, message: itemStale.message});
  assert.deepEqual(h.calls.map(c => [c.name, c.args.p_expected_updated_at]), [['tenh_cancel_order_item', V]], 'no automatic retry');
  const blank = await load({code: 'PT409', message: ''}).api.cancelOrderWorkspaceItem(A, B, V, 'Out of stock', 'biz');
  assert.match(blank.message, /Refresh before cancelling an item/);
});

test('item cancel recognizes the exact legacy guard and hides real serialization/server errors', async () => {
  assert.equal((await load({code: '40001', message: itemStale.message}).api.cancelOrderWorkspaceItem(A, B, V, 'r', 'biz')).status, 409);
  assert.equal((await load({code: '40001', message: 'could not serialize access due to concurrent update'}).api.cancelOrderWorkspaceItem(A, B, V, 'r', 'biz')).status, 503);
  assert.equal((await load({code: 'XX000', message: 'internal detail'}).api.cancelOrderWorkspaceItem(A, B, V, 'r', 'biz')).message, 'The item could not be cancelled. Refresh and try again.');
});

test('item-cancel migration changes only the stale raise and refuses an unexpected body', () => {
  const sql = fs.readFileSync('supabase/migrations/20261008001000_cancel_order_item_nonretryable_conflict.sql', 'utf8');
  assert.match(sql, /tenh_cancel_order_item\(uuid,uuid,uuid,timestamptz,text\)/);
  assert.match(sql, /new_raise constant text := [^\n]*errcode='PT409'/);
  assert.match(sql, /if old_count <> 1 then\s+raise exception/);
  assert.doesNotMatch(sql, /tenh_run_branch_stock|tenh_manage_order/, 'separate migration per function');
});
