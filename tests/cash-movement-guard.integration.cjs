const {readFileSync} = require('node:fs');
const assert = require('node:assert/strict');
const {PGlite} = require('./helpers/pglite.cjs');

(async () => {
  const db = new PGlite();
  const business='10000000-0000-0000-0000-000000000001', branch='20000000-0000-0000-0000-000000000001', user='30000000-0000-0000-0000-000000000001', shift='40000000-0000-0000-0000-000000000001';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$select '${user}'::uuid$$;
      create table business_members(business_id uuid,user_id uuid,role text,is_active boolean);
      create table business_locations(id uuid,business_id uuid,is_active boolean,plan_disable_pending boolean);
      create table cash_register_shifts(id uuid,business_id uuid,location_id uuid,status text,opened_by uuid);
      create table cash_movements(id uuid default gen_random_uuid(),business_id uuid,shift_id uuid,location_id uuid,created_by uuid,movement_type text,amount numeric,reason text,reference text);
      create function tenh_request_branch(uuid) returns uuid language sql as $$select nullif(current_setting('test.branch',true),'')::uuid$$;
      create function tenh_assert_effective_permission(uuid,text) returns void language plpgsql as $$begin if current_setting('test.permission',true) is distinct from 'allowed' then raise exception 'Permission denied';end if;end$$;
      insert into business_members values('${business}','${user}','cashier',true);
      insert into business_locations values('${branch}','${business}',true,false);
      insert into cash_register_shifts values('${shift}','${business}','${branch}','open','${user}');
      set test.permission='allowed'; set test.branch='${branch}';`);
    const migration=readFileSync('supabase/migrations/20260926005000_cash_movement_permission_guard.sql','utf8');
    await db.exec(migration); await db.exec(migration);
    const move=(amount=5,type='cash_in',reason='Float')=>db.query('select record_cash_movement($1,$2,$3,$4,$5)',[business,shift,type,amount,reason]);
    await move(); await move(2,'cash_out');
    for(const amount of ['NaN','Infinity','-Infinity',0,-1,0.001,1000000000]) await assert.rejects(move(amount),/positive amount/);
    await assert.rejects(move(1,null),/movement type/); await assert.rejects(move(1,'cash_in',' '),/Reason/);
    await db.exec("set test.permission='denied'"); await assert.rejects(move(),/Permission denied/);
    await db.exec("set test.permission='allowed';set test.branch=''"); await assert.rejects(move(),/another branch/);
    await db.exec(`set test.branch='${branch}';update business_locations set plan_disable_pending=true`); await assert.rejects(move(),/drawer to close/);
    await db.exec(`update business_locations set plan_disable_pending=false;update cash_register_shifts set opened_by='${branch}'`); await assert.rejects(move(),/own open register/);
    await db.exec(`update cash_register_shifts set opened_by='${user}',status='closed'`); await assert.rejects(move(),/Open register/);
    assert.equal((await db.query('select count(*)::int n from cash_movements')).rows[0].n,2);
    console.log('PASS: authorized cash in/out, role and branch isolation, closed/pending drawer guards, valid money and no writes on rejection.');
  } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
