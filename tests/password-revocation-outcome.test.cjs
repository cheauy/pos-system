const {test} = require('node:test');
const assert = require('node:assert/strict');
const {loadTs} = require('./helpers/load-ts.cjs');
const policy = loadTs('lib/auth/password-policy.ts');

function fixture({revocation = 'success', updateError = null} = {}) {
  const calls = [];
  const auth = {
    getUser: async () => ({data: {user: {id: 'test', email: 'test@example.invalid', identities: [{provider: 'email'}]}}}),
    signInWithPassword: async () => ({error: null}),
    updateUser: async () => { calls.push('update'); return {error: updateError}; },
    signOut: async options => {
      calls.push('revoke');
      assert.deepEqual(options, {scope: 'others'});
      if (revocation === 'throw') throw new Error('Session revocation unavailable');
      return {error: revocation === 'error' ? {message: 'Session revocation unavailable'} : null};
    },
  };
  const actions = loadTs('app/(dashboard)/dashboard/settings/security/actions.ts', {
    '@/lib/auth/password-policy': policy,
    'next/headers': {},
    '@/lib/supabase/server': {createClient: async () => ({auth})},
    '@/lib/supabase/admin': {},
    '@/lib/storefront/checkout-validation': {},
    '@/lib/tenancy/domain': {},
  });
  const form = new FormData();
  form.set('current_password', 'OldPassword1!');
  form.set('new_password', 'NewPassword2!');
  form.set('confirm_password', 'NewPassword2!');
  return {calls, run: () => actions.changePassword({success: false, message: ''}, form)};
}

for (const revocation of ['error', 'throw']) {
  test(`confirmed password save survives session revocation ${revocation} with accurate guidance`, async () => {
    const f = fixture({revocation});
    const result = await f.run();
    assert.equal(result.success, true);
    assert.match(result.message, /password was saved/i);
    assert.match(result.message, /could not be signed out/i);
    assert.match(result.message, /Sign out other devices/);
    assert.doesNotMatch(result.message, /sessions were signed out/);
    assert.deepEqual(f.calls, ['update', 'revoke']);
  });
}

test('confirmed password and session revocation keep the existing success response', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(), {success: true, message: 'Password changed successfully. Other device sessions were signed out.'});
  assert.deepEqual(f.calls, ['update', 'revoke']);
});

test('failed password update does not revoke other sessions', async () => {
  const f = fixture({updateError: {message: 'Password update rejected'}});
  assert.deepEqual(await f.run(), {success: false, message: 'Password update rejected'});
  assert.deepEqual(f.calls, ['update']);
});
