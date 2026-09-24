const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const apply=process.argv.includes('--apply');
const purchaseOnly=process.argv.includes('--purchase-only');
const files=fs.readdirSync('supabase/migrations').filter(f=>purchaseOnly?/^20260924020000_/.test(f):/^202609240(09|1[0-9]|20)000_/.test(f)).sort();
if(files.length!==(purchaseOnly?1:12))throw new Error(`Unexpected branch migration count: ${files.length}`);
const sql=["begin; set local lock_timeout='5s'; set local statement_timeout='90s';",
 `create temporary table branch_preservation_check as select
 (select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'')) from public.products p) products,
 (select md5(coalesce(jsonb_agg(to_jsonb(s) order by location_id,product_id)::text,'')) from public.product_location_stock s) stock,
 (select count(*) from public.orders) orders;`,
 ...files.map(file=>fs.readFileSync(path.join('supabase/migrations',file),'utf8').replace(/^\s*(begin|commit);\s*$/gmi,'')),
 `do $$begin
 if exists(select 1 from branch_preservation_check where products is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'')) from public.products p)
 or stock is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(s) order by location_id,product_id)::text,'')) from public.product_location_stock s)
 or orders<>(select count(*) from public.orders)) then raise exception 'Existing product, stock or order data changed unexpectedly.';end if;
 if (select count(*) from public.branch_product_details)<>(select count(*) from public.product_location_stock) then raise exception 'Branch catalog seeding is incomplete.';end if;
 end$$;
 do $$declare r record;catalog jsonb;begin
 for r in select l.id branch,l.business_id,m.user_id from public.business_locations l join public.businesses b on b.id=l.business_id
 join public.business_members m on m.business_id=b.id and m.role::text='owner' and m.is_active and not coalesce(m.team_password_required,false)
 where b.is_active and l.is_active and not coalesce(l.plan_disable_pending,false) and not public.tenh_subscription_is_expired_now(b.id) loop
 perform set_config('request.jwt.claims',jsonb_build_object('sub',r.user_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',r.user_id::text,true);
 perform set_config('request.headers',jsonb_build_object('x-tenh-branch-id',r.branch,'x-tenh-business-id',r.business_id)::text,true);
 catalog:=public.tenh_pos_catalog_scoped(r.business_id);
 if catalog is null then raise exception 'POS catalog returned no data.';end if;
 perform public.tenh_export_business(r.business_id,array['products','branch_pos_settings','business_receipt_settings']);
 end loop;
 end$$;
 select 'branch migration validated' status,(select count(*) from public.branch_product_details) branch_products,(select count(*) from public.branch_receipt_settings) receipt_settings;`,
 apply?'commit;':'rollback;'].join('\n');
const target=path.join(os.tmpdir(),apply?'tenh-branch-apply.sql':'tenh-branch-dry-run.sql');
fs.writeFileSync(target,sql);console.log(target);
