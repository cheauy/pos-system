const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
function context(options = {}) {
  const calls = [], writes = [], audit = [], branches = [];
  const transfer = { id: 'transfer', transfer_number: 'TR-1', note: 'Existing note', source_location_id: 'source', destination_location_id: 'destination', updated_at: '2026-09-30T00:00:00Z' };
  const db = { from(table) {
    assert.equal(table, 'stock_transfers');
    let write = false;
    const filters = [];
    const q = {
      select() { return q; },
      eq(key, value) { filters.push([key, value]); return q; },
      is(key, value) { filters.push([key, value]); return q; },
      update(value) { write = true; writes.push(value); return q; },
      async maybeSingle() {
        calls.push({ write, filters });
        return { data: write ? (options.conflict ? null : { id: transfer.id }) : (options.missing ? null : transfer), error: null };
      },
    }; return q;
  } };
  const action = loadTs('app/(dashboard)/dashboard/stock-transfers/actions.ts', {
    'next/cache': { revalidatePath() {} },
    '@/lib/audit/create-audit-log': { createAuditLog: async value => audit.push(value) },
    '@/lib/auth/require-permission': { requirePermission: async permission => { assert.equal(permission, 'transfers.manage'); if (options.denied) throw Error('Denied'); return { id: 'business' }; } },
    '@/lib/subscriptions/branch-limits': { assertBranchOperation: async (business, branch) => { assert.equal(business, 'business'); branches.push(branch); if (options.branchDenied) throw Error('Branch denied'); } },
    '@/lib/supabase/server': { createClient: async () => db },
  }).cancelDraftTransfer;
  const data = new FormData(); data.set('transferId', 'transfer'); data.set('reason', '  Wrong destination  ');
  return { action, data, calls, writes, audit, branches };
}
test('draft cancellation preserves notes and items, records reason, and scopes the conditional write', async () => {
  const c = context(); await c.action(c.data);
  assert.equal(c.writes.length, 1);
  assert.equal(c.writes[0].status, 'cancelled');
  assert.equal(c.writes[0].note, 'Existing note\n\nCancellation reason: Wrong destination');
  assert.deepEqual(c.branches, ['source', 'destination']);
  for (const call of c.calls) for (const filter of [['business_id','business'],['id','transfer'],['status','draft']]) assert.ok(call.filters.some(f => JSON.stringify(f) === JSON.stringify(filter)));
  assert.ok(c.calls[1].filters.some(([key, value]) => key === 'updated_at' && value === '2026-09-30T00:00:00Z'));
  assert.equal(c.audit[0].action, 'update'); assert.equal(c.audit[0].metadata.reason, 'Wrong destination');
});
test('cancellation requires a reason and rejects stale, sent or unauthorized drafts', async () => {
  for (const reason of ['', '   ', 'x'.repeat(501)]) {
    const c = context(); c.data.set('reason', reason); await assert.rejects(c.action(c.data), /reason/); assert.equal(c.writes.length, 0);
  }
  for (const option of ['missing', 'denied', 'branchDenied', 'conflict']) {
    const c = context({ [option]: true }); await assert.rejects(c.action(c.data)); assert.equal(c.audit.length, 0);
    if (option !== 'conflict') assert.equal(c.writes.length, 0);
  }
});
