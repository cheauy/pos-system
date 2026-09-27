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

test('delete opens confirmation; Cancel preserves the offer and repeated confirmation deletes once', async () => {
  const {loadTs}=require('./helpers/load-ts.cjs');
  const state=[],refs=[],calls=[];let cursor=0,refCursor=0,finish;
  const react={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},useRef(initial){const i=refCursor++;return refs[i]??(refs[i]={current:initial});},useEffect(){},useActionState(){}};
  const Component=loadTs('app/(super-admin)/super-admin/discounts/discount-manager.tsx',{
    react,'react/jsx-runtime':require('react/jsx-runtime'),'lucide-react':require('lucide-react'),
    sonner:{toast:{success(){},error(){}}},'@/lib/subscriptions/plans':{subscriptionPlans:{},subscriptionTerms:[]},
    './actions':{managePromotion:async(...args)=>{calls.push(args);await new Promise(resolve=>{finish=resolve;});return {error:null};},savePromotion(){}},
  }).default;
  const rule={id,name:'September offer',enabled:true,discount_percent:10,starts_on:'2026-09-01',ends_on:'2026-09-30',apply_new:true,apply_existing:true};
  const render=()=>{cursor=0;refCursor=0;return Component({rules:[rule],today:'2026-09-26'});};
  const nodes=value=>Array.isArray(value)?value.flatMap(nodes):value&&typeof value==='object'?[value,...nodes(value.props?.children)]:[];
  const text=value=>Array.isArray(value)?value.map(text).join(''):typeof value==='string'?value:value?.props?text(value.props.children):'';
  const button=(tree,label)=>nodes(tree).find(n=>n.type==='button'&&text(n)===label);
  button(render(),'Delete').props.onClick();assert.deepEqual(calls,[]);
  let tree=render();assert.ok(text(nodes(tree).find(n=>n.type==='dialog')).includes('September offer'));
  button(tree,'Cancel').props.onClick();assert.deepEqual(calls,[]);assert.equal(button(render(),'Delete discount').props.disabled,true);
  button(render(),'Delete').props.onClick();tree=render();
  button(tree,'Delete discount').props.onClick();button(tree,'Delete discount').props.onClick();assert.deepEqual(calls,[[id,'delete']]);
  finish();await new Promise(resolve=>setImmediate(resolve));assert.equal(button(render(),'Delete discount').props.disabled,true);
});
