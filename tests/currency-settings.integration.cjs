const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(path.join(process.env.TEMP,'tenh-branch-sql-check/node_modules/@electric-sql/pglite'));
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;
 create table business_storefronts(business_id uuid primary key,currency text default 'USD',pos_dual_currency_enabled boolean,pos_usd_khr_rate numeric);
 create table products(business_id uuid);create table orders(business_id uuid);
 create function tenh_pos_guard(uuid)returns text language sql as $$select current_setting('test.role')$$;
 create function tenh_pos_currency_settings(b uuid,e boolean,r numeric)returns jsonb language plpgsql as $$begin
 if r is null or r<1 or r>1000000 then raise exception 'Invalid rate';end if;
 update public.business_storefronts set pos_dual_currency_enabled=e,pos_usd_khr_rate=r where business_id=b;return '{}';end;$$;
 set test.role='owner';`);
 await db.exec(fs.readFileSync('supabase/migrations/20260923200000_currency_format_settings.sql','utf8'));
 const b='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002';
 await db.query('insert into business_storefronts(business_id) values($1),($2)',[b,other]);
 const format={symbol:'$',position:'after',decimals:2,rounding:'half-up',format:'de-DE'};
 const save=(currency='USD',rate=4100,fmt=format)=>db.query('select tenh_save_currency_format($1,$2,$3,$4)',[b,currency,rate,JSON.stringify(fmt)]);
 await save();let row=(await db.query('select * from business_storefronts where business_id=$1',[b])).rows[0];
 assert.deepEqual(row.currency_format,format);assert.equal(Number(row.pos_usd_khr_rate),4100);assert.equal(row.pos_dual_currency_enabled,false);
 assert.deepEqual((await db.query('select currency_format from business_storefronts where business_id=$1',[other])).rows[0].currency_format,{});
 await db.exec("set test.role='cashier'");await assert.rejects(save(),/Only the owner/);await db.exec("set test.role='owner'");
 await assert.rejects(save('EUR'),/valid currency/);await assert.rejects(save('USD',0),/Invalid rate/);await assert.rejects(save('USD',4100,{...format,decimals:9}),/valid currency/);
 await save('KHR');assert.equal((await db.query('select currency from business_storefronts where business_id=$1',[b])).rows[0].currency,'KHR');
 await db.query('insert into products values($1)',[b]);await assert.rejects(save(),/already has products/);
 await save('KHR',4200);assert.equal(Number((await db.query('select pos_usd_khr_rate from business_storefronts where business_id=$1',[b])).rows[0].pos_usd_khr_rate),4200);
 console.log('PASS: saved settings reload, owner access, validation, tenant isolation and existing price protection');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
