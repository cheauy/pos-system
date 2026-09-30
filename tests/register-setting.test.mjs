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
