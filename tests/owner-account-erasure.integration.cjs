const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('./helpers/pglite.cjs');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create table businesses(id uuid primary key);
      create table business_locations(id uuid primary key,business_id uuid references businesses(id) on delete cascade);
      create table orders(id uuid primary key,business_id uuid references businesses(id) on delete cascade,location_id uuid references business_locations(id));
      create table order_items(id uuid primary key,business_id uuid references businesses(id) on delete cascade,order_id uuid references orders(id) on delete cascade);
      create table products(id uuid primary key,business_id uuid references businesses(id) on delete cascade,bundle_stock_mode text);
      create table return_items(id uuid primary key,order_id uuid references orders(id) on delete cascade,product_id uuid references products(id) on delete restrict);
      create table bundle_stock_requests(id uuid primary key,business_id uuid references businesses(id) on delete cascade,result uuid);
      create table bundle_recipe_edit_sessions(bundle_id uuid,transaction_id bigint,user_id uuid);
      create table bundle_items(id uuid primary key,business_id uuid references businesses(id) on delete cascade,bundle_product_id uuid);
      create table tenh_team_requests(id uuid primary key,business_id uuid references businesses(id));
      create table platform_support_reports(id uuid primary key,business_id uuid references businesses(id) on delete set null);
      create table trial_claims(id uuid primary key,business_id uuid references businesses(id) on delete set null);
      create table trial_signup_events(id uuid primary key,business_id uuid references businesses(id) on delete set null);
      create table branch_bundle_recipes(id uuid primary key,location_id uuid references business_locations(id));
      create table branch_product_details(id uuid primary key,location_id uuid references business_locations(id));
      create table cash_movements(id uuid primary key,business_id uuid references businesses(id) on delete cascade,location_id uuid references business_locations(id) on delete restrict);
      create table cash_register_shifts(id uuid primary key,business_id uuid references businesses(id) on delete cascade,location_id uuid references business_locations(id) on delete restrict);
      create table stock_transfers(id uuid primary key,business_id uuid references businesses(id) on delete cascade,source_location_id uuid references business_locations(id) on delete restrict,destination_location_id uuid references business_locations(id) on delete restrict);
      create function tenh_request_branch(uuid) returns uuid language plpgsql as $$begin raise exception 'Sign in again.';end$$;
      create function tenh_guard_operating_record() returns trigger language plpgsql security definer set search_path=public as $$
      declare b uuid; begin if tg_op='DELETE' then b:=tenh_request_branch(old.business_id);return old;end if;
      b:=tenh_request_branch(new.business_id);return new;end$$;
      create function tenh_guard_operating_child() returns trigger language plpgsql security definer set search_path=public as $$
      declare row_data jsonb;parent_row jsonb;b uuid;begin
      row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
      execute format('select to_jsonb(p) from public.%I p where id=$1',tg_argv[0]) into parent_row using (row_data->>tg_argv[1])::uuid;
      if parent_row is null then if tg_op='DELETE' then return old;end if;raise exception 'Parent document not found.';end if;
      b:=tenh_request_branch((parent_row->>'business_id')::uuid);
      if tg_op='DELETE' then return old;end if;return new;end$$;
      create function tenh_freeze_packed_recipe() returns trigger language plpgsql security definer set search_path='' as $$begin
      if exists(select 1 from public.bundle_recipe_edit_sessions where bundle_id=case when tg_op='DELETE' then old.bundle_product_id else new.bundle_product_id end and transaction_id=txid_current() and user_id=auth.uid()) then if tg_op='DELETE' then return old;end if;return new;end if;
      if tg_op='DELETE' and exists(select 1 from public.products p join public.bundle_stock_requests r on r.result=p.id and r.business_id=p.business_id where p.id=old.bundle_product_id and p.bundle_stock_mode='packed') then raise exception 'Packed bundle components are fixed.';end if;
      if tg_op='DELETE' then return old;end if;return new;end$$;
      create trigger tenh_operating_record before delete on orders for each row execute function tenh_guard_operating_record();
      create trigger tenh_operating_child before delete on order_items for each row execute function tenh_guard_operating_child('orders','order_id');
      create trigger tenh_freeze_packed_recipe before delete on bundle_items for each row execute function tenh_freeze_packed_recipe();
    `);
    const migration = fs.readFileSync('supabase/migrations/20260928003000_owner_account_erasure.sql', 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    await db.query('insert into businesses values ($1)', [id(1)]);
    await db.query('insert into business_locations values ($1,$2)', [id(2), id(1)]);
    await db.query('insert into orders values ($1,$2,$3)', [id(3), id(1), id(2)]);
    await db.query('insert into order_items values ($1,$2,$3)', [id(4), id(1), id(3)]);
    await db.query("insert into products values ($1,$2,'packed')", [id(5), id(1)]);
    await db.query('insert into return_items values ($1,$2,$3)', [id(8), id(3), id(5)]);
    await db.query('insert into bundle_stock_requests values ($1,$2,$3)', [id(6), id(1), id(5)]);
    await db.query('insert into bundle_items values ($1,$2,$3)', [id(7), id(1), id(5)]);
    for (const table of ['tenh_team_requests', 'platform_support_reports', 'trial_claims', 'trial_signup_events']) {
      await db.query(`insert into ${table} values ($1,$2)`, [id(10 + ['tenh_team_requests', 'platform_support_reports', 'trial_claims', 'trial_signup_events'].indexOf(table)), id(1)]);
    }
    for (const table of ['branch_bundle_recipes', 'branch_product_details']) await db.query(`insert into ${table} values ($1,$2)`, [id(20 + ['branch_bundle_recipes', 'branch_product_details'].indexOf(table)), id(2)]);
    await db.query('insert into cash_movements values ($1,$2,$3)', [id(30), id(1), id(2)]);
    await db.query('insert into cash_register_shifts values ($1,$2,$3)', [id(31), id(1), id(2)]);
    await db.query('insert into stock_transfers values ($1,$2,$3,$3)', [id(32), id(1), id(2)]);
    await assert.rejects(db.query('delete from order_items where id=$1', [id(4)]), /Sign in again/);
    await assert.rejects(db.query('delete from orders where id=$1', [id(3)]), /Sign in again/);
    await assert.rejects(db.query('delete from bundle_items where id=$1', [id(7)]), /Packed bundle components are fixed/);
    await assert.rejects(db.query('delete from business_locations where id=$1', [id(2)]));
    await db.query('delete from businesses where id=$1', [id(1)]);
    for (const table of ['business_locations','orders','order_items','products','return_items','bundle_items','tenh_team_requests','platform_support_reports','trial_claims','trial_signup_events','branch_bundle_recipes','branch_product_details','cash_movements','cash_register_shifts','stock_transfers']) {
      assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n, 0, table);
    }
    console.log('PASS owner business cascade, branch guards, packed recipes, and related records');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
