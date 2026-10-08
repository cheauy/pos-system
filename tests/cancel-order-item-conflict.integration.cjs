/* eslint-disable @typescript-eslint/no-require-imports */
// Captured real cancel-item body and real auth/permission/branch dependencies, local PGlite only.
// No mocked functions. Fixture schema limits are listed in helpers/order-safety-db.cjs.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {open,seed,identity,id,V,functions}=require('./helpers/order-safety-db.cjs');
const migration=fs.readFileSync('supabase/migrations/20261008001000_cancel_order_item_nonretryable_conflict.sql','utf8');
const SIG="'public.tenh_cancel_order_item(uuid,uuid,uuid,timestamptz,text)'::regprocedure";
(async()=>{const db=await open();try{
 await seed(db);
 const meta=async()=>(await db.query(`select pg_get_functiondef(oid) d,prosecdef,proconfig,proacl::text acl,proowner from pg_proc where oid=${SIG}`)).rows[0];
 const cancel=version=>db.query('select public.tenh_cancel_order_item($1,$2,$3,$4,$5)',[id(1),id(10),id(20),version,'Unavailable']).then(()=>null,e=>[e.code,e.message]);
 const before=await meta();
 assert.deepEqual(await cancel('2026-09-01'),['40001','This order changed. Refresh before cancelling an item.']);
 await db.exec(migration);const after=await meta();
 assert.deepEqual(await cancel('2026-09-01'),['PT409','This order changed. Refresh before cancelling an item.']);
 assert.equal(after.d,before.d.replace("errcode='40001'","errcode='PT409'"));
 for(const k of ['prosecdef','proconfig','acl','proowner'])assert.deepEqual(after[k],before[k],k);
 await identity(db,id(99),id(3));assert.equal((await cancel(V))[0],'42501','real branch guard');
 await identity(db,id(77),id(2));assert.equal((await cancel(V))[0],'42501','real permission guard');
 await identity(db,id(99),id(2));
 await db.exec('update orders set archived_at=now()');
 assert.deepEqual(await cancel(V),['P0001','Order not found.']);
 await db.exec(migration);assert.equal((await meta()).d,after.d,'idempotent');
 const live=functions.find(f=>f.proname==='tenh_cancel_order_item').definition;
 await db.exec(live.replace("errcode='40001'","errcode='P0001'"));
 await assert.rejects(db.exec(migration),/review this migration/);await db.exec('rollback');
 console.log('full captured cancel-item conflict migration: ok (no app function stubs)');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
