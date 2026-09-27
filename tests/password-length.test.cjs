const test = require('node:test'), assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const policy = loadTs('lib/auth/password-policy.ts');
const { createIssue } = loadTs('lib/users/team-model.ts', {
  '@/lib/auth/user-role-options': { getAssignableRoles: () => ['staff'] },
  '@/lib/auth/password-policy': policy,
});
const base = { requestId: '00000000-0000-4000-8000-000000000001', branchId: '00000000-0000-4000-8000-000000000002', name: 'Test staff', email: 'staff@example.com', phone: '', role: 'staff', sendInvite: false, requirePasswordChange: true };
test('new staff and web password setup enforce the same 8–72 character boundaries', async () => {
  const calls = [];
  const { completeTeamPasswordSetup } = loadTs('app/team-setup/actions.ts', {
    '@/lib/auth/password-policy': policy,
    '@/lib/supabase/server': { createClient: async () => ({ auth: {
      getUser: async () => ({ data: { user: { id: 'staff-id' } } }),
      updateUser: async body => { calls.push(body); return {}; },
    } }) },
    '@/lib/supabase/admin': { supabaseAdmin: { rpc: async (name, args) => { assert.equal(name, 'tenh_users_finish_setup'); assert.equal(args.p_user, 'staff-id'); return {}; } } },
  });
  for (const length of [7, 8, 72, 73]) {
    const password = 'Aa1!' + 'X'.repeat(length - 4), valid = length >= 8 && length <= 72;
    assert.equal(createIssue({ ...base, password }, 'owner') === null, valid);
    assert.equal((await completeTeamPasswordSetup(password, password)).success, valid);
  }
  assert.deepEqual(calls.map(value => value.password.length), [8, 72]);
  assert.equal((await completeTeamPasswordSetup('Password1', 'Mismatch1')).success, false);
});
