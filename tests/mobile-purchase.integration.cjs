const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('./helpers/pglite.cjs');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const [B,L,OTHER,U,P,O,I] = [1,2,3,4,5,6,7].map(id);
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;`);
    for (const table of JSON.parse(fs.readFileSync('tests/fixtures/branch-catalog-tables.json'))) {
      await db.exec(`create table public.${table.name}(${table.columns});`);
      if (table.columns.startsWith('id uuid,')) await db.exec(`alter table ${table.name} add primary key(id); alter table ${table.name} alter column id set default gen_random_uuid();`);
    }
    await db.exec(`alter table product_location_stock add primary key(location_id,product_id);
      create table branch_product_details (id uuid,business_id uuid,location_id uuid,cost_price numeric,updated_at timestamptz);
      create function tenh_request_branch(uuid) returns uuid language sql as $$select current_setting('test.branch')::uuid$$;
      create function tenh_assert_effective_permission(uuid,text) returns void language plpgsql as $$begin if current_setting('test.denied',true)='yes' then raise exception 'Denied' using errcode='42501';end if;end$$;
      create function tenh_assert_plan_branch(uuid,uuid) returns void language plpgsql as $$begin if current_setting('test.expired',true)='yes' then raise exception 'Expired';end if;end$$;
      insert into businesses(id,name) values('${B}','Test');
      insert into business_locations(id,business_id,plan_disable_pending) values('${L}','${B}',false),('${OTHER}','${B}',false);
      insert into products(id,business_id,name,stock_quantity) values('${P}','${B}','Shirt',10);
      insert into product_location_stock values('${B}','${L}','${P}',7,null,null),('${B}','${OTHER}','${P}',3,null,null);
      insert into branch_product_details values('${P}','${B}','${L}',2,null),('${P}','${B}','${OTHER}',4,null);
      insert into purchase_orders(id,business_id,location_id,po_number,status) values('${O}','${B}','${L}','PO-TEST','sent');
      insert into purchase_order_items(id,business_id,purchase_order_id,product_id,product_name,ordered_quantity,received_quantity,unit_cost) values('${I}','${B}','${O}','${P}','Shirt',10,0,6);
      select set_config('test.user','${U}',false),set_config('test.branch','${L}',false);`);
    // Exercise real branch-stock and receiving functions, not a stock mutation stub.
    await db.exec(fs.readFileSync('supabase/migrations/20260924020000_branch_purchase_stock_guards.sql','utf8'));
    const migration = fs.readFileSync('supabase/migrations/20260927002000_mobile_purchase_receipts.sql','utf8');
    await db.exec(migration); await db.exec(migration);
    const call = (request, quantity, expected, branch=L, order=O, items) => db.query('select tenh_mobile_receive_purchase($1,$2,$3,$4,$5::jsonb) result', [B,branch,id(request),order,JSON.stringify(items || [{ itemId:I,quantity,expectedReceived:expected }])]).then(r=>r.rows[0].result);
    const first = await call(100,2,0);
    assert.equal(first.receivedQuantity,2); assert.equal(first.status,'partial');
    assert.deepEqual(await call(100,2,0),first,'lost response retry returns same outcome');
    assert.equal((await db.query('select stock_quantity from products where id=$1',[P])).rows[0].stock_quantity,12);
    assert.equal((await db.query('select quantity from product_location_stock where location_id=$1',[L])).rows[0].quantity,9);
    assert.equal((await db.query('select quantity from product_location_stock where location_id=$1',[OTHER])).rows[0].quantity,3);
    assert.equal(Number((await db.query('select cost_price from branch_product_details where location_id=$1',[OTHER])).rows[0].cost_price),4);
    assert.equal((await db.query('select count(*)::int n from stock_adjustments')).rows[0].n,1);
    await assert.rejects(call(100,3,0),/different details/);
    const stale = await call(101,2,0);
    assert.equal(stale.rolledBack,true); assert.match(stale.error,/changed/);
    assert.deepEqual(await call(101,2,0),stale);
    const over = await call(102,9,2); assert.equal(over.rolledBack,true); assert.match(over.error,/exceeds/);
    await assert.rejects(call(103,1.5,2),/whole/);
    await assert.rejects(call(103,1,2,L,O,[{itemId:I,quantity:1,expectedReceived:2},{itemId:I,quantity:1,expectedReceived:2}]),/only once/);
    await assert.rejects(call(103,1,2,OTHER),/another branch/);
    assert.equal((await call(103,1,2,L,id(999))).rolledBack,true);
    await db.exec("select set_config('test.denied','yes',false)"); await assert.rejects(call(100,2,0),/Denied/);
    await db.exec("select set_config('test.denied','no',false); select set_config('test.expired','yes',false)"); await assert.rejects(call(104,1,2),/Expired/);
    await db.exec("select set_config('test.expired','no',false)");
    // Force failure after underlying stock updates and prove they roll back.
    await db.exec(`create function reject_receipt() returns trigger language plpgsql as $$begin if current_setting('test.fail',true)='yes' then raise exception 'Test ledger failure';end if;return new;end$$;
      create trigger reject_receipt before insert on stock_adjustments for each row execute function reject_receipt(); select set_config('test.fail','yes',false);`);
    const failed = await call(105,1,2); assert.equal(failed.rolledBack,true); assert.match(failed.error,/ledger/);
    await db.exec("select set_config('test.fail','no',false)");
    assert.deepEqual(await call(105,1,2),failed,'terminal failure cannot later receive stock');
    assert.equal((await db.query('select stock_quantity from products where id=$1',[P])).rows[0].stock_quantity,12);
    assert.equal((await db.query('select received_quantity from purchase_order_items where id=$1',[I])).rows[0].received_quantity,2);
    const status = await db.query('select tenh_mobile_purchase_receipt_status($1,$2,$3) result',[B,L,id(105)]); assert.deepEqual(status.rows[0].result,failed);
    await db.query("select set_config('test.user',$1,false)",[id(55)]);
    assert.equal((await db.query('select tenh_mobile_purchase_receipt_status($1,$2,$3) result',[B,L,id(100)])).rows[0].result,null);
    await assert.rejects(call(100,2,0),/different details/);
    await db.query("select set_config('test.user',$1,false)",[U]);
    assert.equal((await call(106,8,2)).status,'received');
    assert.equal((await call(107,1,10)).rolledBack,true);
    assert.equal((await db.query("select has_table_privilege('authenticated','mobile_purchase_receipts','SELECT') allowed")).rows[0].allowed,false);
    assert.equal((await db.query("select has_function_privilege('anon','tenh_mobile_receive_purchase(uuid,uuid,uuid,uuid,jsonb)','EXECUTE') allowed")).rows[0].allowed,false);
    console.log('PASS: real receiving/stock SQL, retry once, branch isolation, stale quantities, terminal rollback, permissions, status ownership and grants.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
