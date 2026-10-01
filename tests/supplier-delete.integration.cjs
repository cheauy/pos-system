const { PGlite } = require('./helpers/pglite.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$select '${id(1)}'::uuid$$;
      create function tenh_request_branch(uuid) returns uuid language sql as $$select '${id(2)}'::uuid$$;
      create function tenh_assert_effective_permission(uuid,text) returns void language plpgsql as $$begin if current_setting('test.denied',true)='yes' then raise exception 'Permission denied'; end if; end$$;
      create table suppliers(id uuid primary key,business_id uuid,owner_id uuid,location_id uuid);
      create table purchases(id int primary key,supplier_id uuid references suppliers(id) on delete set null);
      create table purchase_orders(id int primary key,supplier_id uuid references suppliers(id) on delete set null);
      insert into suppliers values
        ('${id(10)}','${id(3)}','${id(1)}','${id(2)}'),
        ('${id(11)}','${id(3)}','${id(1)}','${id(2)}'),
        ('${id(12)}','${id(3)}','${id(1)}','${id(2)}'),
        ('${id(13)}','${id(3)}','${id(1)}','${id(4)}'),
        ('${id(14)}','${id(3)}','${id(4)}','${id(2)}');
      insert into purchases values(1,'${id(11)}');
      insert into purchase_orders values(1,'${id(12)}');`);
    await db.exec(fs.readFileSync('supabase/migrations/20260930005000_safe_supplier_delete.sql','utf8'));
    const remove = (supplier,business=3) => db.query('select tenh_delete_unused_supplier($1,$2)',[id(business),id(supplier)]);
    for (const supplier of [11,12]) await assert.rejects(remove(supplier),/purchase history/);
    for (const supplier of [13,14,99]) await assert.rejects(remove(supplier),/not found/);
    await assert.rejects(remove(10,4),/not found/);
    await db.exec("select set_config('test.denied','yes',false)");
    await assert.rejects(remove(10),/Permission denied/);
    await db.exec("select set_config('test.denied','no',false)");
    await remove(10);
    assert.equal((await db.query('select count(*)::int n from suppliers')).rows[0].n,4);
    assert.equal((await db.query('select supplier_id from purchases')).rows[0].supplier_id,id(11));
    assert.equal((await db.query('select supplier_id from purchase_orders')).rows[0].supplier_id,id(12));
    await assert.rejects(remove(10),/not found/);
    console.log('PASS: unused supplier deletion, history preservation, permission/account/business/branch isolation, and repeated-delete rejection');
  } finally { await db.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
