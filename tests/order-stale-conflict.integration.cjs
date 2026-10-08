/* eslint-disable @typescript-eslint/no-require-imports */
// Full captured manage-order body, real permission/auth/stock dependencies, disposable local DB.
// The pre-migration fixture is reconstructed by changing only the captured PT409 guard to 40001.
// FK/RLS/triggers/concurrent HTTP sessions are not exercised (see helpers/order-safety-db.cjs).
const fs=require('node:fs'),assert=require('node:assert/strict');
const {open,seed,id,V,functions}=require('./helpers/order-safety-db.cjs');
const migration=fs.readFileSync('supabase/migrations/20261007174209_fix_order_conflict_nonretryable_sqlstate.sql','utf8');
const SIG="'public.tenh_manage_order(uuid,uuid,timestamptz,text,jsonb)'::regprocedure";
const oldRaise="raise exception 'This order changed since you opened it. Refresh and try again.' using errcode='40001';";
const newRaise=oldRaise.replace('40001','PT409');
const call=(db,version)=>db.query('select public.tenh_manage_order($1,$2,$3,$4,$5)',[id(1),id(10),version,'edit',{note:'safe'}]).then(()=>null,e=>e.code);
const def=async db=>(await db.query(`select pg_get_functiondef(oid) d,prosecdef,proconfig,proowner,proacl::text acl from pg_proc where oid=${SIG}`)).rows[0];
(async()=>{const db=await open();try{
 await seed(db);
 const live=functions.find(f=>f.proname==='tenh_manage_order').definition;
 assert.ok(live.includes(newRaise));
 await db.exec(live.replace(newRaise,oldRaise));
 const before=await def(db);
 assert.equal(await call(db,'2026-09-01T00:00:00Z'),'40001');
 await db.exec(migration);
 const after=await def(db);
 assert.equal(await call(db,'2026-09-01T00:00:00Z'),'PT409');
 assert.equal(after.d,before.d.replace(oldRaise,newRaise),'only captured business guard changed');
 for(const k of ['prosecdef','proconfig','proowner','acl'])assert.deepEqual(after[k],before[k],k);
 await db.exec(migration);assert.deepEqual(await def(db),after);
 assert.equal(await call(db,V),null,'real successful edit runs full body, including audit insert');
 assert.equal((await db.query('select customer_note from orders')).rows[0].customer_note,'safe');
 // Drift fixture: real body with one deliberately altered guard; migration must fail closed.
 await db.exec(live.replace(newRaise,newRaise.replace('PT409','P0001')));
 await assert.rejects(db.exec(migration),/review (?:this )?migration/);await db.exec('rollback');
 assert.equal(await call(db,'2026-09-01T00:00:00Z'),'P0001');
 console.log('full captured manage-order conflict migration: ok (pre-code reconstructed; no app function stubs)');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
