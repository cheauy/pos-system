const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load({ denied = false, missing = false } = {}) {
  const calls = [];
  const query = {
    delete() { calls.push(['delete']); return this; },
    update(value) { calls.push(['update', value]); return this; },
    eq(...args) { calls.push(['eq', ...args]); return this; },
    select() { return this; },
    async maybeSingle() { return { data: missing ? null : { id: 'saved' }, error: null }; },
  };
  const exports = {};
  const source = fs.readFileSync('app/(super-admin)/super-admin/discounts/actions.ts', 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports,
    require(name) {
      if (name === 'next/cache') return { revalidatePath: path => calls.push(['refresh', path]) };
      if (name.includes('require-super-admin')) return { requireSuperAdmin: async () => { if (denied) throw new Error('Forbidden'); return { id: 'admin' }; } };
      if (name.includes('supabase/admin')) return { supabaseAdmin: { from: table => { calls.push(['table', table]); return query; } } };
      if (name.includes('promotions')) return { validatePromotion: () => null };
      throw new Error(name);
    },
  });
  return { action: exports.managePromotion, calls };
}
const id = '11111111-1111-4111-8111-111111111111';
test('discount management rejects non-admins before touching data', async () => {
  const { action, calls } = load({ denied: true });
  await assert.rejects(action(id, 'delete'), /Forbidden/);
  assert.equal(calls.length, 0);
});
test('invalid discount IDs and operations cannot mutate data', async () => {
  const { action, calls } = load();
  assert.ok((await action('bad-id', 'delete')).error);
  assert.ok((await action(id, 'unknown')).error);
  assert.equal(calls.length, 0);
});
test('enable and disable update only the selected offer', async () => {
  for (const operation of ['enable', 'disable']) {
    const { action, calls } = load();
    assert.equal((await action(id, operation)).error, null);
    const update = calls.find(call => call[0] === 'update')[1];
    assert.equal(update.enabled, operation === 'enable');
    assert.equal(update.updated_by, 'admin');
    assert.deepEqual(calls.find(call => call[0] === 'eq'), ['eq', 'id', id]);
    assert.equal(calls.filter(call => call[0] === 'refresh').length, 2);
  }
});
test('delete touches only the offer table, preserving saved order quotes', async () => {
  const { action, calls } = load();
  assert.equal((await action(id, 'delete')).error, null);
  assert.deepEqual(calls.filter(call => call[0] === 'table'), [['table', 'subscription_promotions']]);
  assert.deepEqual(calls.find(call => call[0] === 'eq'), ['eq', 'id', id]);
  assert.ok(calls.some(call => call[0] === 'delete'));
});
test('a missing offer is not reported as successfully changed', async () => {
  const { action, calls } = load({ missing: true });
  assert.ok((await action(id, 'delete')).error);
  assert.ok(!calls.some(call => call[0] === 'refresh'));
});
