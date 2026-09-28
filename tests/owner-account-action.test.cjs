const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

test('account erasure deletes only owned businesses, then storage and Auth', async () => {
  const owner = '00000000-0000-4000-8000-000000000001';
  const business = '00000000-0000-4000-8000-000000000002';
  const events = [];
  const from = table => {
    const query = { table, operation: 'read' };
    for (const method of ['select', 'like', 'order', 'range', 'limit']) {
      query[method] = () => query;
    }
    query.eq = (field, value) => {
      if (table === 'businesses' && field === 'owner_id') assert.equal(value, owner);
      return query;
    };
    query.delete = () => { query.operation = 'delete'; return query; };
    query.maybeSingle = async () => {
      if (table === 'profiles') return { data: { role: 'owner' }, error: null };
      if (table === 'businesses' && query.operation === 'delete') {
        events.push('delete business');
        return { data: { id: business }, error: null };
      }
      throw new Error(`Unexpected single query: ${table}`);
    };
    query.then = (ok, fail) => {
      if (table === 'businesses') return Promise.resolve({ data: [{ id: business }], error: null }).then(ok, fail);
      if (['business_members', 'orders'].includes(table)) return Promise.resolve({ data: [], error: null }).then(ok, fail);
      if (table === 'profiles' && query.operation === 'delete') return Promise.resolve({ error: null }).then(ok, fail);
      if (table === 'business_subscription_purge_log') return Promise.resolve({ error: null }).then(ok, fail);
      throw new Error(`Unexpected list query: ${table}`);
    };
    return query;
  };
  const storage = {
    from(bucket) {
      return {
        list: async () => ({ data: bucket === 'product-images' ? [{ id: 'file', name: 'image.jpg' }] : [], error: null }),
        remove: async () => { events.push(`remove ${bucket}`); return { error: null }; },
      };
    },
  };
  const action = loadTs('app/(dashboard)/dashboard/settings/security/actions.ts', {
    '@/lib/auth/password-policy': { passwordIssue: () => null },
    'next/headers': { cookies: async () => ({ delete: () => {} }) },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) } }) },
    '@/lib/supabase/admin': { supabaseAdmin: { from, storage, auth: { admin: { deleteUser: async id => { events.push(`delete Auth ${id}`); return { error: null }; } } } } },
    '@/lib/storefront/checkout-validation': { PAYMENT_PROOF_BUCKET: 'storefront-payment-proofs', proofPath: () => null },
    '@/lib/tenancy/domain': { SELECTED_BUSINESS_COOKIE: 'business' },
  }).deleteOwnAccount;
  const form = new FormData();
  form.set('confirmation', 'DELETE');
  const result = await action({}, form);
  assert.equal(result.success, true, result.message);
  assert.deepEqual(events, ['delete business', 'remove product-images', `delete Auth ${owner}`]);
});
