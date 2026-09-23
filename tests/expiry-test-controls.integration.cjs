const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(path.join(process.env.TEMP, 'tenh-branch-sql-check/node_modules/@electric-sql/pglite'));

(async () => {
 const db = new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create table profiles(id uuid primary key,role text,is_active boolean);
   create table businesses(id uuid primary key,subscription_expires_at timestamptz,trial_expires_at timestamptz,subscription_status text,
    is_active boolean default true,archived_at timestamptz,disabled_reason text,disabled_at timestamptz,expired_at timestamptz,
    deletion_scheduled_at timestamptz,scheduled_deletion_at timestamptz,subscription_user_limit integer default 5,subscription_branch_limit integer default 2);
  `);
  await db.exec(fs.readFileSync('supabase/migrations/20260923120000_subscription_expiry_tests.sql', 'utf8'));
  const b = '10000000-0000-0000-0000-000000000001', admin = '20000000-0000-0000-0000-000000000001', staff = '20000000-0000-0000-0000-000000000002';
  await db.query("insert into profiles values($1,'super_admin',true),($2,'cashier',true)", [admin, staff]);
  await db.query("insert into businesses(id,subscription_expires_at,subscription_status) values($1,now()+interval '30 days','active')", [b]);
  const snapshot = async () => (await db.query('select * from businesses where id=$1', [b])).rows[0];
  const change = async (restore, actor = admin) => (await db.query('select tenh_test_subscription_expiry($1,$2,$3) result', [b, actor, restore])).rows[0].result;
  const before = await snapshot();
  await assert.rejects(change(false, staff), /Super Admin/);
  await db.exec('set role authenticated');
  await assert.rejects(change(false), /permission denied/);
  await db.exec('reset role');
  await change(false);
  const forced = await snapshot();
  assert.ok(new Date(forced.subscription_expires_at) < new Date());
  assert.deepEqual({ ...forced, subscription_expires_at: before.subscription_expires_at }, before);
  await change(false);
  assert.deepEqual(await snapshot(), forced);
  // Both the cron suspension and workspace expiry bookkeeping must be reversible
  // by restoring timestamps alone. They must not alter users or branch limits.
  await db.query("update businesses set is_active=false,disabled_reason='subscription_expired',disabled_at=now(),scheduled_deletion_at=now()+interval '60 days' where id=$1", [b]);
  await db.query("update businesses set subscription_status='expired',expired_at=now(),deletion_scheduled_at=now()+interval '180 days' where id=$1", [b]);
  assert.deepEqual(await snapshot(), forced);
  await change(true);
  assert.deepEqual(await snapshot(), before);
  await change(true);
  assert.deepEqual(await snapshot(), before);
  await change(false);
  await db.query("update businesses set subscription_expires_at=now()+interval '60 days' where id=$1", [b]);
  const renewed = await snapshot();
  assert.match(await change(true), /newer value was preserved/);
  assert.deepEqual(await snapshot(), renewed);
  await db.query("update businesses set subscription_status='trialing',trial_expires_at=now()+interval '7 days' where id=$1", [b]);
  const trial = await snapshot();
  await change(false);
  assert.ok(new Date((await snapshot()).trial_expires_at) < new Date());
  await change(true);
  assert.deepEqual(await snapshot(), trial);
  await db.query("update businesses set subscription_status='active',subscription_expires_at=null,trial_expires_at=null where id=$1", [b]);
  const noExpiry = await snapshot();
  await change(false); await change(true);
  assert.deepEqual(await snapshot(), noExpiry);
  // Normal expiry remains unchanged outside a test.
  await db.query("update businesses set subscription_status='expired',is_active=false,disabled_reason='subscription_expired' where id=$1", [b]);
  assert.equal((await snapshot()).subscription_status, 'expired');
  assert.equal((await snapshot()).is_active, false);
  await assert.rejects(change(false), /active test business/);
  console.log('PASS: permissions, timestamp-only changes, repeated clicks, expiry sweep protection, exact restoration, renewal preservation, trial/null expiry, normal expiry unchanged.');
 } finally { await db.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
