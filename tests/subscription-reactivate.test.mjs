import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function load(file, deps) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(id => deps[id] ?? {}, module, module.exports);
  return module.exports;
}
const plans = load('../lib/subscriptions/plans.ts', {});
const input = load('../lib/subscriptions/checkout-input.ts', { './plans': plans });
function setup({ role = 'owner', status = 'expired', plan = 'custom', existing = null } = {}) {
  const calls = [];
  const current = { subscription_plan_key: plan, subscription_user_limit: 7, subscription_branch_limit: 2, subscription_months: 6 };
  const db = { from(table) {
    const filters = {};
    const q = { select() { return q; }, eq(k, v) { filters[k] = v; return q; }, in() { return q; }, is() { return q; }, gt() { return q; }, order() { return q; }, limit() { return q; }, async maybeSingle() { return { data: table === 'businesses' ? current : filters.payment_provider ? null : existing, error: null }; } };
    return q;
  }, async rpc(name, args) { calls.push({ name, args }); return { data: { order_id: '11111111-1111-4111-8111-111111111111' }, error: null }; } };
  const actions = load('../app/(dashboard)/dashboard/settings/subscription/actions.ts', {
    '@/lib/subscriptions/checkout-input': input,
    '@/lib/subscriptions/plans': plans,
    '@/lib/business/get-current-business': { getCurrentBusinessForSubscription: async () => ({ id: 'business', role, subscriptionStatus: status }) },
    '@/lib/supabase/admin': { supabaseAdmin: db },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } }) },
    '@/lib/subscriptions/payment-expiry': { expireStaleSubscriptionPaymentRequestsForBusiness: async () => {}, isSubscriptionPaymentExpired: row => row.expired === true },
    'next/cache': { revalidatePath() {} },
    'next/navigation': { redirect: destination => { throw new Error(`REDIRECT:${destination}`); } },
  });
  const form = new FormData();
  form.set('expectedBusinessId', 'business');
  form.set('plan', 'solo');
  form.set('termMonths', '1');
  return { run: () => actions.reactivateCurrentSubscription({ error: null }, form), calls, form };
}
test('reactivation creates checkout with server-owned current plan, capacity and term', async () => {
  const s = setup();
  await assert.rejects(s.run, /REDIRECT:.*payment\/11111111/);
  assert.equal(s.calls.length, 1);
  assert.deepEqual(s.calls[0].args, { p_business_id: 'business', p_requesting_user_id: 'owner', p_plan_key: 'custom', p_term_months: 6, p_requested_user_limit: 7, p_requested_branch_limit: 2, p_keep_member_ids: null, p_keep_branch_ids: null });
});
test('matching pending and submitted payments are reused', async () => {
  for (const status of ['pending_payment', 'payment_submitted']) {
    const s = setup({ existing: { id: 'existing', status } });
    await assert.rejects(s.run, /REDIRECT:.*payment\/existing/);
    assert.equal(s.calls.length, 0);
  }
});
test('expired requests are replaced; trial accounts choose a paid plan', async () => {
  const s = setup({ existing: { id: 'old', status: 'pending_payment', expired: true } });
  await assert.rejects(s.run, /REDIRECT:.*payment\/11111111/);
  assert.equal(s.calls.length, 1);
  const trial = setup({ plan: 'trial' });
  await assert.rejects(trial.run, /REDIRECT:.*expired=change/);
  assert.equal(trial.calls.length, 0);
});
test('staff, active subscriptions and stale business forms cannot create payments', async () => {
  for (const config of [{ role: 'staff' }, { status: 'active' }]) {
    const s = setup(config);
    assert.ok((await s.run()).error);
    assert.equal(s.calls.length, 0);
  }
  const s = setup(); s.form.set('expectedBusinessId', 'other');
  assert.match((await s.run()).error, /active business changed/);
  assert.equal(s.calls.length, 0);
});
