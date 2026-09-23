const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const {PGlite}=require(path.join(process.env.TEMP,'tenh-branch-sql-check/node_modules/@electric-sql/pglite'));
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid()returns uuid language sql as $$select current_setting('test.user')::uuid$$;
 create table business_members(id uuid,business_id uuid,user_id uuid,role text,is_active boolean);
 create table products(id uuid,business_id uuid,name text,api_key text);create table orders(id uuid,business_id uuid,total numeric);create table order_items(id uuid,order_id uuid,name text);
 create table profiles(id uuid,email text,password_hash text);
 `);
 await db.exec(fs.readFileSync('supabase/migrations/20260923210000_business_export.sql','utf8'));
 const b='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002',u='20000000-0000-0000-0000-000000000001',o='30000000-0000-0000-0000-000000000001';
 await db.query("select set_config('test.user',$1,false)",[u]);await db.query("insert into business_members values($1,$2,$1,'owner',true)",[u,b]);
 await db.query("insert into products values($1,$2,'Mine','secret'),($2,$3,'Other','secret')",[u,b,other]);
 await db.query('insert into orders values($1,$2,12),($2,$3,20)',[o,b,other]);await db.query("insert into order_items values($1,$1,'Mine'),($2,$2,'Other')",[o,b]);
 const run=(id=b,tables=['products','orders','order_items'])=>db.query('select tenh_export_business($1,$2) data',[id,tables]);
 let result=(await run()).rows[0].data;assert.equal(result.products.length,1);assert.equal(result.products[0].api_key,undefined);assert.equal(result.order_items.length,1);assert.equal(result.order_items[0].name,'Mine');
 await assert.rejects(run(other),/Only the business owner/);await assert.rejects(run(b,['auth.users']),/valid data/);await assert.rejects(run(b,[]),/valid data/);
 await db.exec("update business_members set role='staff'");await assert.rejects(run(),/Only the business owner/);await db.exec("update business_members set role='owner'");
 await db.query("insert into products select gen_random_uuid(),$1,'Bulk',null from generate_series(1,10001)",[b]);assert.equal((await run(b,['products'])).rows[0].data.products.length,10002);
 console.log('PASS: owner-only export, business and child isolation, token redaction, table allowlist, over 10,000 records');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
