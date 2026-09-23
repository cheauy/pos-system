import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function load(file, deps) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(id => {
    if (!(id in deps)) throw Error(`Unexpected import: ${id}`);
    return deps[id];
  }, module, module.exports);
  return module.exports;
}

test('expiry controls are available in development and require explicit production opt-in', () => {
  const keys = ['NODE_ENV', 'ENABLE_SUBSCRIPTION_EXPIRY_TEST_CONTROLS'];
  const saved = keys.map(key => process.env[key]);
  try {
    const { expiryTestsEnabled: allowed } = load('../lib/subscriptions/expiry-test-controls.ts', { 'server-only': {} });
    process.env.NODE_ENV = 'development';
    delete process.env.ENABLE_SUBSCRIPTION_EXPIRY_TEST_CONTROLS;
    assert.equal(allowed(), true);
    process.env.NODE_ENV = 'production';
    assert.equal(allowed(), false);
    process.env.ENABLE_SUBSCRIPTION_EXPIRY_TEST_CONTROLS = 'true';
    assert.equal(allowed(), true);
    process.env.ENABLE_SUBSCRIPTION_EXPIRY_TEST_CONTROLS = 'false';
    process.env.NODE_ENV = 'development';
    assert.equal(allowed(), false);
  } finally { keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; }); }
});

test('server action authorizes every call and refuses disabled or malformed requests', async () => {
  let enabled = false, authCalls = 0, rpcCalls = 0, deny = false;
  const { changeTestExpiry } = load('../app/(super-admin)/super-admin/businesses/[id]/expiry-test-actions.ts', {
    'next/cache': { revalidatePath() {} },
    '@/lib/auth/require-super-admin': { async requireSuperAdmin() { authCalls++; if (deny) throw Error('Forbidden'); return { id: 'admin' }; } },
    '@/lib/subscriptions/expiry-test-controls': { expiryTestsEnabled: () => enabled },
    '@/lib/supabase/admin': { supabaseAdmin: { async rpc(name, args) { rpcCalls++; assert.equal(name, 'tenh_test_subscription_expiry'); assert.deepEqual(args, { p_business: 'test', p_actor: 'admin', p_restore: true }); return { data: 'Restored', error: null }; } } },
  });
  assert.equal((await changeTestExpiry('test', 'expire')).success, false);
  enabled = true;
  assert.equal((await changeTestExpiry('test', 'delete')).success, false);
  deny = true;
  await assert.rejects(changeTestExpiry('test', 'restore'), /Forbidden/);
  assert.equal(rpcCalls, 0);
  deny = false;
  assert.equal((await changeTestExpiry('test', 'restore')).success, true);
  assert.equal(rpcCalls, 1);
  assert.equal(authCalls, 4);
});
