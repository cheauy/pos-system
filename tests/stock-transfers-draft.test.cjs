/* eslint-disable @typescript-eslint/no-require-imports -- Standalone service-double tests use CommonJS. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

// Execute the real draft action with explicit service doubles; no stock/database calls.
function fixture(options = {}) {
  const queries = [], writes = [], branches = [], audits = [], refreshed = [];
  const db = {
    auth: { getUser: async () => ({ data: { user: options.loggedOut ? null : { id: 'cashier' } } }) },
    from(table) {
      const call = { table, filters: [], mutation: null }; queries.push(call);
      const query = {
        select() { return query; },
        eq(...args) { call.filters.push(args); return query; },
        in(...args) { call.filters.push(args); return query; },
        insert(value) { call.mutation = 'insert'; writes.push({ table, value }); return query; },
        delete() { call.mutation = 'delete'; writes.push({ table, delete: true }); return query; },
        single() { return query; },
        then(resolve, reject) {
          let result;
          if (table === 'product_location_stock') result = { data: [{ product_id: 'shirt', quantity: options.insufficient ? 1 : 8 }, { product_id: 'bag', quantity: 10 }], error: null };
          else if (table === 'business_locations') result = { data: options.foreignBranch ? [] : [{ id: 'central' }, { id: 'north' }], error: null };
          else if (table === 'products') result = { data: options.foreignProduct ? [] : [{ id: 'shirt' }, { id: 'bag' }], error: null };
          else if (table === 'stock_transfers') result = { data: { id: 'draft-fixture' }, error: null };
          else if (table === 'stock_transfer_items') result = { error: options.itemFailure ? { message: 'Fixture item insert failed' } : null };
          else throw Error('Unexpected table: ' + table);
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const action = loadTs('app/(dashboard)/dashboard/stock-transfers/actions.ts', {
    'next/cache': { revalidatePath: value => refreshed.push(value) },
    '@/lib/audit/create-audit-log': { createAuditLog: async value => audits.push(value) },
    '@/lib/auth/require-permission': { requirePermission: async permission => { assert.equal(permission, 'transfers.manage'); if (options.denied) throw Error('Denied'); return { id: 'fixture-business' }; } },
    '@/lib/subscriptions/branch-limits': { assertBranchOperation: async (business, branch) => { assert.equal(business, 'fixture-business'); branches.push(branch); if (options.branchDenied) throw Error('Branch denied'); } },
    '@/lib/supabase/server': { createClient: async () => db },
  }).createTransfer;
  const data = new FormData();
  data.set('sourceLocationId', 'central'); data.set('destinationLocationId', 'north'); data.set('note', '  fixture reference  ');
  data.set('itemsJson', JSON.stringify([{ productId: 'shirt', quantity: 2 }, { productId: 'shirt', quantity: 1 }, { productId: 'bag', quantity: 4 }]));
  return { action, data, queries, writes, branches, audits, refreshed };
}

test('draft creation preserves quantity aggregation, branch/business checks, reference and draft-only writes', async () => {
  const f = fixture(); await f.action(f.data);
  assert.deepEqual(f.branches, ['central', 'north']);
  assert.deepEqual(f.writes.map(write => write.table), ['stock_transfers', 'stock_transfer_items']);
  assert.equal(f.writes[0].value.business_id, 'fixture-business'); assert.equal(f.writes[0].value.note, 'fixture reference');
  assert.equal(f.writes[0].value.status, undefined, 'existing default draft lifecycle is retained');
  assert.deepEqual(f.writes[1].value.map(item => [item.product_id, item.quantity]), [['shirt', 3], ['bag', 4]]);
  assert.ok(f.writes[1].value.every(item => item.business_id === 'fixture-business' && item.transfer_id === 'draft-fixture'));
  for (const table of ['product_location_stock', 'business_locations', 'products']) assert.ok(f.queries.find(query => query.table === table).filters.some(([key, value]) => key === 'business_id' && value === 'fixture-business'));
  assert.equal(f.audits[0].metadata.total_quantity, 7); assert.deepEqual(f.refreshed, ['/dashboard/stock-transfers']);
});

test('invalid draft branches/items are rejected before writes', async () => {
  for (const change of [
    data => data.set('sourceLocationId', ''), data => data.set('destinationLocationId', 'central'),
    data => data.set('itemsJson', '[]'), data => data.set('itemsJson', '{broken'),
    ...[0, -1, 1.5].map(quantity => data => data.set('itemsJson', JSON.stringify([{ productId: 'shirt', quantity }]))),
  ]) { const f = fixture(); change(f.data); await assert.rejects(f.action(f.data)); assert.equal(f.writes.length, 0); }
});

test('permissions, branch scope, business isolation and insufficient stock are enforced before draft writes', async () => {
  for (const option of ['denied', 'loggedOut', 'branchDenied', 'foreignBranch', 'foreignProduct', 'insufficient']) {
    const f = fixture({ [option]: true }); await assert.rejects(f.action(f.data)); assert.equal(f.writes.length, 0); assert.equal(f.audits.length, 0);
  }
});

test('item failure rolls back only the newly created business-scoped draft', async () => {
  const f = fixture({ itemFailure: true }); await assert.rejects(f.action(f.data), /Fixture item insert failed/);
  const cleanup = f.queries.find(query => query.mutation === 'delete');
  assert.equal(cleanup.table, 'stock_transfers');
  assert.deepEqual(cleanup.filters, [['id', 'draft-fixture'], ['business_id', 'fixture-business'], ['status', 'draft']]);
  assert.equal(f.audits.length, 0); assert.equal(f.refreshed.length, 0);
});
