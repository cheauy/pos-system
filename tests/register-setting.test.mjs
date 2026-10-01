import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs,queryDouble} from './helpers/load-ts.cjs';

test('register requirement changes only the active branch field and rejects non-owners',async()=>{
  const queries=[];let role='owner',active='branch';
  const api=loadTs('app/(dashboard)/dashboard/settings/register-setting-actions.ts',{
    'next/cache':{revalidatePath(){}},
    '@/lib/auth/require-permission':{requirePermission:async()=>({id:'business',role})},
    '@/lib/branches/context':{assertOperatingBranch:async branch=>{if(branch!==active)throw Error('Branch changed');}},
    '@/lib/supabase/branch-server':{createClient:async()=>({from:table=>queryDouble(table,{data:{location_id:'branch'},error:null},queries)})},
  });
  await api.saveRegisterRequirement('business','branch',false);
  assert.deepEqual(queries[0].steps.find(step=>step[0]==='update'),['update',{require_open_register:false}]);
  assert.ok(queries[0].steps.some(step=>step[0]==='eq'&&step[1]==='location_id'&&step[2]==='branch'));
  assert.ok(queries[0].steps.some(step=>step[0]==='eq'&&step[1]==='business_id'&&step[2]==='business'));
  await api.saveRegisterRequirement('business','branch',true);
  assert.deepEqual(queries[1].steps.find(step=>step[0]==='update'),['update',{require_open_register:true}]);
  await assert.rejects(api.saveRegisterRequirement('other','branch',false),/owner/);
  role='staff';await assert.rejects(api.saveRegisterRequirement('business','branch',false),/owner/);
  role='owner';active='other';await assert.rejects(api.saveRegisterRequirement('business','branch',false),/Branch changed/);
  await assert.rejects(api.saveRegisterRequirement('business','other','false'),/Choose/);
  assert.equal(queries.length,2);
});


test('register toggle saves immediately, prevents duplicate saves and keeps its value on failure',async()=>{
  const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
  const state=[],refs=[],calls=[];let cursor=0,refCursor=0,finish;
  const Component=loadTs('app/(dashboard)/dashboard/settings/register-setting.tsx',{
    react:{useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=v;}];},useRef:initial=>{const i=refCursor++;return refs[i]??(refs[i]={current:initial});}},
    'react/jsx-runtime':require('react/jsx-runtime'),sonner:{toast:{success(){},error(){}}},
    './register-setting-actions':{saveRegisterRequirement:(...args)=>{calls.push(args);return new Promise((resolve,reject)=>{finish={resolve,reject};});}},
  }).default;
  const walk=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(walk):[node,...walk(node.props?.children)];
  const render=()=>{cursor=0;refCursor=0;return walk(Component({businessId:'business',branchId:'branch',branchName:'Main',required:true}));};
  const toggle=()=>render().find(n=>n.props?.role==='switch');
  toggle().props.onClick();toggle().props.onClick();
  assert.equal(calls.length,1);assert.deepEqual(calls[0],['business','branch',false]);assert.equal(toggle().props.disabled,true);
  finish.resolve();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(toggle().props['aria-checked'],false);
  toggle().props.onClick();finish.reject(new Error('Unable to save'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(toggle().props['aria-checked'],false);assert.equal(toggle().props.disabled,false);
  assert.ok(render().some(n=>n.props?.role==='alert'&&n.props.children==='Unable to save'));
});
