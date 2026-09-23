const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { PGlite } = require(path.join(process.env.TEMP, 'tenh-branch-sql-check/node_modules/@electric-sql/pglite'));
(async () => {
 const db = new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
   create function auth.role() returns text language sql as $$select 'service_role'::text$$;
   create table businesses(id uuid primary key);
   create table business_members(business_id uuid,user_id uuid,role text,is_active boolean);
   create table subscription_orders(id uuid primary key,business_id uuid,status text,order_kind text,pricing_version int,
    payment_expired_at timestamptz,payment_expires_at timestamptz,created_at timestamptz default now(),pricing_locked_until timestamptz,
    payment_method text,payment_provider text,payway_tran_id text,proof_path text,monthly_price numeric,
    term_months int,discount_percent numeric,subtotal_amount numeric,term_price_amount numeric,extension_amount numeric,
    total_amount numeric,remaining_credit_amount numeric,upgrade_prorated_amount numeric,updated_at timestamptz);
   create function update_pending_upgrade_billing_term(uuid,uuid,uuid,integer) returns table(order_id uuid,order_status text)
    language sql as $$select $3,'upgrade delegated'::text$$;
  `);
  await db.exec(fs.readFileSync('supabase/migrations/20260923180000_reactivation_checkout_term.sql','utf8'));
  const b='10000000-0000-0000-0000-000000000001', u='20000000-0000-0000-0000-000000000001', o='30000000-0000-0000-0000-000000000001';
  await db.query('insert into businesses values($1)',[b]);
  await db.query("insert into business_members values($1,$2,'owner',true)",[b,u]);
  await db.query("insert into subscription_orders(id,business_id,status,order_kind,pricing_version,payment_expires_at,monthly_price) values($1,$2,'pending_payment','reactivation',7,now()+interval '10 minutes',55)",[o,b]);
  const change=(months,actor=u,business=b)=>db.query('select * from update_pending_subscription_billing_term($1,$2,$3,$4)',[business,actor,o,months]);
  for(const [months,total] of [[1,55],[3,156.75],[6,303.60],[12,594]]) {
   await change(months);
   const row=(await db.query('select * from subscription_orders where id=$1',[o])).rows[0];
   assert.equal(Number(row.total_amount),total); assert.equal(row.term_months,months); assert.equal(row.order_kind,'reactivation');
  }
  await assert.rejects(change(0),/Choose 1/); await assert.rejects(change(null),/Choose 1/);
  await assert.rejects(change(1,o),/owner access/);
  await assert.rejects(change(1,u,o),/owner access/);
  for(const field of ['payment_method','payment_provider','payway_tran_id','proof_path']) {
   await db.exec(`update subscription_orders set ${field}='started'`);
   await assert.rejects(change(3),/locked after payment/);
   await db.exec(`update subscription_orders set ${field}=null`);
  }
  for(const status of ['approved','payment_submitted','cancelled']) {
   await db.query('update subscription_orders set status=$1',[status]);
   await assert.rejects(change(3),/no longer waiting/);
  }
  await db.exec("update subscription_orders set status='pending_payment',payment_expires_at=now()-interval '1 second'");
  await assert.rejects(change(3),/expired/);
  await db.exec("update subscription_orders set payment_expires_at=now()+interval '10 minutes',order_kind='upgrade'");
  assert.equal((await change(0)).rows[0].order_status,'upgrade delegated');
  console.log('PASS: term pricing, authorization, payment locks, expiry and existing upgrade delegation');
 } finally { await db.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
