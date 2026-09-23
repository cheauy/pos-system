/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS database test, matching the existing integration runner. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PGlite } = require(path.join(process.env.TEMP, 'tenh-branch-sql-check/node_modules/@electric-sql/pglite'));

(async () => {
 const db = new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create function auth.uid() returns uuid language sql as $$select current_setting('test.user')::uuid$$;
   create function tenh_request_branch(b uuid) returns uuid language sql as $$select nullif(current_setting('test.branch',true),'')::uuid$$;
   create table businesses(id uuid primary key);
   create table members(business_id uuid,user_id uuid,can_create boolean,can_pack boolean);
   create table business_locations(id uuid primary key,business_id uuid,is_active boolean);
   create table categories(id uuid primary key,business_id uuid);
   create table products(id uuid primary key,business_id uuid,owner_id uuid,name text,sku text,description text,category_id uuid,product_type text,cost_price numeric,selling_price numeric,stock_quantity int,low_stock_quantity int,is_active boolean,is_online boolean,updated_at timestamptz);
   create table bundle_items(id uuid primary key default gen_random_uuid(),business_id uuid,bundle_product_id uuid references products(id) on delete cascade,component_product_id uuid references products(id),quantity int);
   create table product_location_stock(business_id uuid,location_id uuid,product_id uuid references products(id) on delete cascade,quantity int,low_stock_threshold int,updated_at timestamptz,primary key(location_id,product_id));
   create table product_option_groups(id uuid primary key,business_id uuid,product_id uuid,name text,selection_type text,is_required boolean,min_selections int,max_selections int);
   create table product_options(id uuid primary key,business_id uuid,product_id uuid,group_id uuid,name text,is_active boolean,price_adjustment numeric);
   create table audit_logs(business_id uuid,user_id uuid,action text,entity_type text,entity_id uuid,description text,metadata jsonb);
   create table stock_adjustments(business_id uuid,location_id uuid,product_id uuid,adjustment_type text,quantity_delta int,stock_before int,stock_after int,reason text,reference text,created_by uuid);
   create table orders(id uuid primary key,business_id uuid,order_source text);
   create table order_items(id uuid primary key default gen_random_uuid(),order_id uuid,product_id uuid);
   create table tenh_pos_holds(business_id uuid,draft jsonb);
   create function tenh_pos_catalog_scoped(p_business_id uuid) returns jsonb language sql set search_path=public as $$select jsonb_build_object('products',coalesce(jsonb_agg(to_jsonb(p)),'[]')) from products p where business_id=p_business_id$$;
   create function tenh_assert_effective_permission(b uuid,p text) returns void language plpgsql as $$begin
    if not exists(select 1 from public.members where business_id=b and user_id=auth.uid() and case p when 'products.create' then can_create when 'products.update' then can_create when 'products.disable' then can_create when 'products.stock_adjust' then can_pack else false end) then raise exception 'Not allowed';end if;
   end;$$;
   create function tenh_assert_plan_branch(b uuid,l uuid) returns void language plpgsql as $$begin
    if not exists(select 1 from public.business_locations where business_id=b and id=l and is_active) then raise exception 'Invalid branch';end if;
   end;$$;
  `);
  // Installed baseline, captured without business data. The local archive omits
  // earlier migrations, so the regression fixture carries its exact dependencies.
  await db.exec(`alter table products add bundle_stock_mode text;alter table bundle_items add selected_options jsonb not null default '[]';
   create table bundle_stock_requests(business_id uuid,request_id uuid,user_id uuid,payload_hash text,result uuid,created_at timestamptz default now(),primary key(business_id,request_id));`);
  for(const routine of JSON.parse(fs.readFileSync('tests/fixtures/packed-bundle-functions.json','utf8')))await db.exec(routine.definition);
  await db.exec(`create trigger tenh_freeze_packed_recipe before insert or update or delete on bundle_items for each row execute function tenh_freeze_packed_recipe();
   create trigger tenh_keep_packed_bundle_type before update of product_type,bundle_stock_mode on products for each row execute function tenh_keep_packed_bundle_type();`);
  await db.exec(fs.readFileSync('supabase/migrations/20260924003000_bundle_management.sql','utf8'));
  const b=randomUUID(), user=randomUUID(), branch=randomUUID(), otherBranch=randomUUID(), foreign=randomUUID(), a=randomUUID(), v=randomUUID(), c=randomUUID(), g=randomUUID(), o=randomUUID();
  await db.query("select set_config('test.user',$1,false)",[user]);
  await db.query('insert into businesses values($1),($2)',[b,foreign]);
  await db.query('insert into members values($1,$2,true,true)',[b,user]);
  await db.query('insert into business_locations values($1,$2,true),($3,$2,true)',[branch,b,otherBranch]);
  for (const [id,type,name] of [[a,'standard','Standard'],[v,'variant','Blue / M'],[c,'configurable','Drink']]) {
   await db.query('insert into products(id,business_id,owner_id,name,sku,product_type,cost_price,selling_price,stock_quantity,is_active) values($1,$2,$3,$4,$6,$5,2,5,30,true)',[id,b,user,name,type,id]);
   await db.query('insert into product_location_stock(business_id,location_id,product_id,quantity) values($1,$2,$3,20),($1,$4,$3,10)',[b,branch,id,otherBranch]);
  }
  await db.query("insert into product_option_groups values($1,$2,$3,'Size','single',true,1,1)",[g,b,c]);
  await db.query("insert into product_options values($1,$2,$3,$4,'Large',true,1)",[o,b,c,g]);
  const input = {name:'Starter Set',sku:'SET-1',sellingPrice:'12.50',items:[{productId:a,quantity:2,optionIds:[]},{productId:v,quantity:1,optionIds:[]},{productId:c,quantity:1,optionIds:[o]}]};
  const create=async(payload=input,request=randomUUID(),business=b,location=branch)=>(await db.query('select tenh_create_packed_bundle($1,$2,$3,$4) id',[business,location,request,JSON.stringify(payload)])).rows[0].id;
  const snapshot=async()=>JSON.stringify((await db.query('select id,stock_quantity from products order by id')).rows)+JSON.stringify((await db.query('select * from product_location_stock order by location_id,product_id')).rows);
  const request=randomUUID(); const bundle=await create(input,request);
  assert.equal(await create(input,request),bundle,'create retries must not duplicate');
  assert.equal((await db.query('select stock_quantity from products where id=$1',[bundle])).rows[0].stock_quantity,0);
  assert.equal((await db.query('select selected_options from bundle_items where component_product_id=$1',[c])).rows[0].selected_options[0].name,'Large');
  await assert.rejects(db.query('update bundle_items set quantity=100 where bundle_product_id=$1',[bundle]),/components are fixed/);
  await assert.rejects(db.query("update products set product_type='standard' where id=$1",[bundle]),/must remain a bundle/);
  const pack=async(q,id=randomUUID(),business=b,location=branch)=>(await db.query('select tenh_pack_bundle($1,$2,$3,$4,$5) id',[business,location,bundle,q,id])).rows[0].id;
  const packId=randomUUID(); await pack(3,packId); const packed=await snapshot(); await pack(3,packId); assert.equal(await snapshot(),packed,'retry must not change stock');
  assert.equal((await db.query('select stock_quantity from products where id=$1',[a])).rows[0].stock_quantity,24);
  assert.equal((await db.query('select quantity from product_location_stock where product_id=$1 and location_id=$2',[a,branch])).rows[0].quantity,14);
  assert.equal((await db.query('select quantity from product_location_stock where product_id=$1 and location_id=$2',[a,otherBranch])).rows[0].quantity,10);
  await assert.rejects(pack(4,packId),/already used/);
  await assert.rejects(pack(8),/Not enough/); assert.equal(await snapshot(),packed,'insufficient components roll back all changes');
  await assert.rejects(pack(-4),/Not enough/); assert.equal(await snapshot(),packed,'cannot unpack more sets than exist');
  await pack(-1);
  assert.equal((await db.query('select stock_quantity from products where id=$1',[bundle])).rows[0].stock_quantity,2);
  await assert.rejects(create({...input,sku:'MISSING',items:[{productId:a,quantity:1},{productId:c,quantity:1}]}),/required options/);
  assert.equal((await db.query("select count(*)::int n from products where sku='MISSING'")).rows[0].n,0,'failed recipe creation is atomic');
  await assert.rejects(create({...input,sku:'NESTED',items:[{productId:a,quantity:1},{productId:bundle,quantity:1}]}),/active component/);
  await assert.rejects(create({...input,sku:'DUPLICATE',items:[{productId:a,quantity:1},{productId:a,quantity:1}]}),/different products/);
  await assert.rejects(create({...input,sku:'NEGATIVE',items:[{productId:a,quantity:-1},{productId:v,quantity:1}]}),/whole numbers/);
  await assert.rejects(pack(1,randomUUID(),foreign),/Not allowed/);
  await assert.rejects(pack(1,randomUUID(),b,randomUUID()),/Invalid branch/);
  await db.query("select set_config('test.branch',$1,false)",[branch]);
  await assert.rejects(pack(1,randomUUID(),b,otherBranch),/not assigned/);
  await db.query('update members set can_pack=false'); await assert.rejects(pack(1),/Not allowed/);
  await db.query('update members set can_pack=true');
  const current=async product=>(await db.query('select updated_at from products where id=$1',[product])).rows[0].updated_at;
  const manage=async(product,action,values={},expected=undefined)=>db.query('select tenh_manage_bundle($1,$2,$3,$4,$5,$6)',[b,branch,product,action,JSON.stringify(values),expected===undefined?await current(product):expected]);
  const originalTime=await current(bundle);
  await manage(bundle,'online',{enabled:true}); await manage(bundle,'pos',{enabled:false});
  const flags=(await db.query('select is_pos,is_online from products where id=$1',[bundle])).rows[0];assert.deepEqual(flags,{is_pos:false,is_online:true});
  assert.ok(!(await db.query('select tenh_pos_catalog_scoped($1) result',[b])).rows[0].result.products.some(p=>p.id===bundle));
  const posOrder=randomUUID(),onlineOrder=randomUUID();await db.query("insert into orders values($1,$2,'pos'),($3,$2,'online')",[posOrder,b,onlineOrder]);
  await assert.rejects(db.query('insert into order_items(order_id,product_id) values($1,$2)',[posOrder,bundle]),/hidden from POS/);
  await db.query('insert into order_items(order_id,product_id) values($1,$2)',[onlineOrder,bundle]);
  await assert.rejects(manage(bundle,'pos',{enabled:true},originalTime),/changed/);
  await manage(bundle,'edit',{name:'Updated Set',sku:'SET-UPDATED',price:'15.00',description:'Updated description',categoryId:''});
  assert.equal((await db.query('select name from products where id=$1',[bundle])).rows[0].name,'Updated Set');
  assert.equal((await db.query('select count(*)::int n from bundle_items where bundle_product_id=$1',[bundle])).rows[0].n,3);
  await assert.rejects(manage(bundle,'delete'),/remaining stock/);
  await pack(-2);await assert.rejects(manage(bundle,'delete'),/transaction history/);
  const unused=await create({...input,sku:'UNUSED'});
  await manage(unused,'delete');assert.equal((await db.query('select count(*)::int n from products where id=$1',[unused])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from bundle_items where bundle_product_id=$1',[unused])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from product_location_stock where product_id=$1',[unused])).rows[0].n,0);
  console.log('PASS: pack/unpack, options, retries, branch/permission isolation, editing, independent visibility, hidden POS sale guard, stale updates and safe deletion.');
 } finally { await db.close(); }
})().catch(error=>{console.error(error.message, error.where ?? '', error.position ?? '');process.exitCode=1;});
