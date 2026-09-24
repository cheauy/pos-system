begin;
CREATE OR REPLACE FUNCTION public.tenh_import_business_safe(p_business_id uuid, p_kind text, p_mode text, p_payload jsonb, p_branch_id uuid DEFAULT NULL::uuid, p_commit boolean DEFAULT false, p_expected text DEFAULT NULL::text, p_request_id uuid DEFAULT NULL::uuid, p_filename text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
 SET statement_timeout TO '30s'
AS $function$
declare
 t text; r jsonb; eligible jsonb:='[]'; inventory_exists boolean; old_row jsonb; full_row jsonb; patch jsonb; snap jsonb; report jsonb; prior record;
 tables text[]; fields text[]; keys text[]; pk text[]; condition text; cols text; vals text; write_table text;
 row_id uuid; matches uuid[]; n integer:=0; added integer:=0; changed integer:=0; unchanged integer:=0;
 fingerprint text; payload_hash text; safe_table boolean; seen text[]:=array[]::text[]; identity text;
 allowed text[]:=array['businesses','business_locations','business_storefronts','business_receipt_settings','business_customer_settings','business_delivery_zones','business_tables','products','product_variants','categories','product_location_stock','product_option_groups','product_options','bundle_items','inventory_movements','stock_adjustments','stock_transfers','stock_transfer_items','orders','order_items','returns','return_items','tenh_pos_holds','tenh_pos_points_used','customers','customer_credit_accounts','customer_credit_ledger','customer_loyalty_transactions','business_coupons','coupon_redemptions','suppliers','purchases','purchase_items','purchase_orders','purchase_order_items','expenses','cash_register_shifts','cash_movements','audit_logs','business_activity_history','branch_product_details','branch_receipt_settings','branch_customer_settings','branch_pos_settings','branch_bundle_recipes','branch_role_permissions','branch_notification_role_settings'];
begin
 p_branch_id:=coalesce(p_branch_id,public.tenh_request_branch(p_business_id));
 if p_branch_id is distinct from public.tenh_request_branch(p_business_id) or p_branch_id is null then raise exception 'The operating branch changed. Validate the file again.';end if;
 perform public.tenh_assert_effective_permission(p_business_id,'exports.manage');
 perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);
 if exists(select 1 from public.business_locations where id=p_branch_id and plan_disable_pending) then raise exception 'This branch is closing after a plan change.';end if;
 if p_commit is null then raise exception 'Invalid confirmation.';end if;
 if auth.uid() is null or not exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid() and role::text='owner' and is_active) then raise exception 'Only the business owner can import data.';end if;
 if p_kind is null or p_kind not in ('backup','products','customers','suppliers','inventory') or p_mode is null or p_mode not in ('insert','merge','update') then raise exception 'Invalid import options.';end if;
 if p_payload is null or octet_length(p_payload::text)>10000000 then raise exception 'Import exceeds the 10 MB limit.';end if;
 if p_kind='backup' then
  if p_mode='insert' then raise exception 'Use a CSV template to add new records. JSON templates restore existing records only.';end if;
  if jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid backup datasets.';end if;
  select array_agg(key order by key) into tables from jsonb_each(p_payload);
  if tables is null or not tables<@allowed then raise exception 'Backup contains an unsupported dataset.';end if;
 else
  if jsonb_typeof(p_payload)<>'array' or jsonb_array_length(p_payload) not between 1 and 1000 then raise exception 'CSV imports require 1 to 1,000 rows.';end if;
  if not exists(select 1 from public.business_locations where id=p_branch_id and business_id=p_business_id and is_active) then raise exception 'Choose an active branch in this business.';end if;
  tables:=case when p_kind='inventory' then array['business_locations','product_location_stock','products','stock_adjustments'] else array['business_locations',p_kind] end;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_business_id::text,9616));
 payload_hash:=md5(jsonb_build_array(p_kind,p_mode,p_payload,p_branch_id)::text);
 if p_commit then
  if p_request_id is null or p_expected is null then raise exception 'Validate and confirm the file first.';end if;
  select * into prior from public.business_import_requests where business_id=p_business_id and request_id=p_request_id;
  if found then
   if prior.payload_hash<>payload_hash or prior.user_id<>auth.uid() then raise exception 'This import reference belongs to another request.';end if;
   return prior.result||jsonb_build_object('replayed',true);
  end if;
 end if;
 -- Prevent a sale or edit between comparison and write. Locks end with this RPC.
 for t in select unnest(tables) order by 1 loop
  execute format('lock table public.%I in share row exclusive mode',t);
 end loop;
 if p_kind<>'backup' and not exists(select 1 from public.business_locations where id=p_branch_id and business_id=p_business_id and is_active) then raise exception 'Choose an active branch in this business.';end if;
 lock table public.branch_product_details,public.branch_receipt_settings,public.branch_customer_settings,public.branch_pos_settings in share row exclusive mode;
 snap:=public.tenh_export_business(p_business_id,tables);
 select md5(coalesce(jsonb_object_agg(key,(select coalesce(jsonb_agg(value order by value::text),'[]') from jsonb_array_elements(e.value))),'{}')::text) into fingerprint from jsonb_each(snap) e;
 fingerprint:=md5(jsonb_build_array(fingerprint,payload_hash)::text);
 if p_commit and p_expected<>fingerprint then raise exception 'Data changed since validation. Validate again before importing.';end if;
 -- Preview executes real constraints and triggers in a rolled-back subtransaction.
 begin
 if p_kind='backup' then
  foreach t in array tables loop
   write_table:=case t when 'products' then 'branch_products' when 'business_receipt_settings' then 'branch_receipt_settings' when 'business_customer_settings' then 'branch_customer_settings' else t end;
   if jsonb_typeof(p_payload->t)<>'array' then raise exception 'Dataset % must contain rows.',t;end if;
   n:=n+jsonb_array_length(p_payload->t);
   if n>20000 then raise exception 'Import at most 20,000 records at a time.';end if;
   select array_agg(a.attname::text order by k.ordinality) into pk from pg_catalog.pg_constraint c cross join lateral unnest(c.conkey) with ordinality k(num,ordinality) join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num where c.conrelid=format('public.%I',t)::regclass and c.contype='p';
   if pk is null then raise exception 'Dataset % has no safe record identity.',t;end if;
   fields:=case t
    when 'products' then array['name','sku','barcode','description','cost_price','selling_price','low_stock_quantity','is_active','image_url','style_name','brand_name']
    when 'customers' then array['name','phone','email','address','note','birthday']
    when 'suppliers' then array['name','contact_person','phone','email','address','notes','is_active']
    else array[]::text[] end;
   safe_table:=t in ('branch_receipt_settings','branch_customer_settings','branch_pos_settings','business_storefronts','business_receipt_settings','business_customer_settings','business_delivery_zones','business_tables','categories');
   for r in select value from jsonb_array_elements(p_payload->t) loop
    if jsonb_typeof(r)<>'object' or exists(select 1 from unnest(pk) k where nullif(r->>k,'') is null) then raise exception 'Invalid record identity in %.',t;end if;
    if public.tenh_export_redact(r) is distinct from r then raise exception 'Security credentials cannot be imported.';end if;
    identity:=t||':'||(select jsonb_object_agg(k,r->k)::text from unnest(pk) k);
    if identity=any(seen) then raise exception 'Duplicate record in %.',t;end if;
    seen:=array_append(seen,identity);
    select value into old_row from jsonb_array_elements(snap->t) where not exists(select 1 from unnest(pk) k where value->k is distinct from r->k);
    if old_row is null then raise exception '% contains a missing or foreign record. Backup import only updates existing records; use CSV to add products, customers or suppliers.',t;end if;
    if r=old_row then unchanged:=unchanged+1;continue;end if;
    if safe_table then select array_agg(key) into fields from jsonb_each(old_row) where key<>all(pk) and key not in ('id','business_id','owner_id','location_id','created_at','updated_at') and key !~* '(password|secret|token|credential|api.?key|authorization|fingerprint|raw_payload|provider_response|payway_response)';end if;
    fields:=coalesce(fields,array[]::text[]);
    -- Full row comparison protects IDs, balances, inventory and security fields.
    if (r-fields-array['updated_at']) is distinct from (old_row-fields-array['updated_at']) or cardinality(fields)=0 then raise exception '% contains changed protected data. Orders, balances, stock, branches and history cannot be restored over live records.',t;end if;
    select coalesce(jsonb_object_agg(key,value),'{}') into patch from jsonb_each(r) where key=any(fields) and value is distinct from old_row->key;
    if patch='{}' then unchanged:=unchanged+1;continue;end if;
    select string_agg(format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',key,write_table,key),',') into cols from jsonb_each(patch);
    select string_agg(format('to_jsonb(target)->%L=$2->%L',k,k),' and ') into condition from unnest(pk) k;
    if write_table in ('branch_receipt_settings','branch_customer_settings','branch_pos_settings') then condition:=condition||format(' and target.location_id=%L::uuid',p_branch_id);end if;
    execute format('select to_jsonb(target) from public.%I target where %s',write_table,replace(condition,'$2','$1')) into full_row using r;
    if exists(select 1 from jsonb_object_keys(patch) k where full_row->k is distinct from old_row->k) then raise exception 'Sensitive settings must be edited in Settings; import would remove hidden credentials.';end if;
    execute format('update public.%I target set %s where %s',write_table,cols,condition) using patch,r;
    changed:=changed+1;
   end loop;
  end loop;
 elsif p_kind='inventory' then
  for r in select value from jsonb_array_elements(p_payload) loop
   if not exists(select 1 from public.business_locations where id=p_branch_id and business_id=p_business_id and upper(code)=upper(r->>'branch_code')) then raise exception 'Inventory file contains a different branch. Switch branch before importing.';end if;
   if upper(r->>'sku')=any(seen) then raise exception 'Duplicate inventory SKU.';end if;seen:=array_append(seen,upper(r->>'sku'));
   select array_agg(id) into matches from public.branch_products where business_id=p_business_id and upper(sku)=upper(r->>'sku');
   if coalesce(cardinality(matches),0)<>1 then raise exception 'Inventory SKU must match exactly one product in this business.';end if;
   select exists(select 1 from public.product_location_stock where business_id=p_business_id and location_id=p_branch_id and product_id=matches[1]) into inventory_exists;
   if (p_mode='insert' and inventory_exists) or (p_mode='update' and not inventory_exists) then unchanged:=unchanged+1;continue;end if;
   if coalesce((r->>'quantity')::integer,-1)<0 or coalesce((r->>'low_stock_threshold')::integer,0)<0 then raise exception 'Inventory quantities must be zero or greater.';end if;
   eligible:=eligible||jsonb_build_array(r);
   if inventory_exists then changed:=changed+1;else added:=added+1;end if;
  end loop;
  if jsonb_array_length(eligible)>0 then
   for r in select value from jsonb_array_elements(eligible) loop
    select id into row_id from public.branch_products where business_id=p_business_id and upper(sku)=upper(r->>'sku');
    select quantity into n from public.product_location_stock where business_id=p_business_id and location_id=p_branch_id and product_id=row_id;
    perform public.tenh_adjust_branch_stock(p_business_id,p_branch_id,row_id,'set',(r->>'quantity')::integer,'Inventory import',p_filename,gen_random_uuid(),n);
    update public.product_location_stock set low_stock_threshold=coalesce((r->>'low_stock_threshold')::integer,0) where business_id=p_business_id and location_id=p_branch_id and product_id=row_id;
   end loop;
  end if;
  n:=jsonb_array_length(p_payload);
 else
  
  fields:=case p_kind when 'products' then array['name','sku','barcode','description','cost_price','selling_price','low_stock_quantity','is_active'] when 'customers' then array['name','phone','email','address','note'] else array['name','contact_person','phone','email','address','notes','is_active'] end;
  for r in select value from jsonb_array_elements(p_payload) loop
   n:=n+1;
   if jsonb_typeof(r)<>'object' or length(trim(coalesce(r->>'name','')))<2 or exists(select 1 from jsonb_object_keys(r) k where not k=any(fields)) then raise exception 'Invalid or unsupported fields in row %.',n;end if;
   if p_kind='products' then
    if nullif(trim(r->>'sku'),'') is null or coalesce((r->>'cost_price')::numeric,-1)<0 or coalesce((r->>'selling_price')::numeric,-1)<0 or coalesce((r->>'low_stock_quantity')::integer,-1)<0 then raise exception 'Invalid product values in row %.',n;end if;
    select array_agg(id) into matches from public.branch_products where business_id=p_business_id and upper(sku)=upper(r->>'sku');
   elsif p_kind='customers' then
    if nullif(r->>'email','') is null and nullif(r->>'phone','') is null then raise exception 'Customer row % needs email or phone to prevent duplicates.',n;end if;
    select array_agg(id) into matches from public.customers where business_id=p_business_id and location_id=p_branch_id and ((nullif(r->>'email','') is not null and lower(email)=lower(r->>'email')) or (nullif(r->>'phone','') is not null and phone=r->>'phone'));
   else
    select array_agg(id) into matches from public.suppliers where business_id=p_business_id and location_id=p_branch_id and ((nullif(r->>'email','') is not null and lower(email)=lower(r->>'email')) or lower(name)=lower(r->>'name'));
   end if;
   if cardinality(matches)>1 then raise exception 'Row % matches multiple records. Resolve duplicates first.',n;end if;
   row_id:=matches[1];
   if row_id is not null and p_mode='insert' then unchanged:=unchanged+1;continue;end if;
   if row_id is not null and row_id::text=any(seen) then raise exception 'Multiple rows match the same record.';end if;
   if row_id is null and p_mode='update' then unchanged:=unchanged+1;continue;end if;
   patch:=r;
   if row_id is null then
    row_id:=gen_random_uuid();
    patch:=patch||jsonb_build_object('id',row_id,'business_id',p_business_id,'owner_id',auth.uid());
    if p_kind<>'products' then patch:=patch||jsonb_build_object('location_id',p_branch_id);end if;
    select string_agg(format('%I',key),','),string_agg(format('(jsonb_populate_record(null::public.%I,$1)).%I',p_kind,key),',') into cols,vals from jsonb_each(patch);
    execute format('insert into public.%I (%s) select %s',p_kind,cols,vals) using patch;
    if p_kind='products' then
     insert into public.product_location_stock(business_id,location_id,product_id,quantity,low_stock_threshold) values(p_business_id,p_branch_id,row_id,0,coalesce((r->>'low_stock_quantity')::integer,0));
    end if;
    added:=added+1;
   else
    select value into old_row from jsonb_array_elements(snap->p_kind) where value->>'id'=row_id::text;
    if old_row @> patch then unchanged:=unchanged+1;
    else
     select string_agg(format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',key,p_kind,key),',') into cols from jsonb_each(patch);
     execute format('update public.%I set %s,updated_at=now() where id=$2 and business_id=$3',case when p_kind='products' then 'branch_products' else p_kind end,cols) using patch,row_id,p_business_id;
     changed:=changed+1;
    end if;
   end if;
   seen:=array_append(seen,row_id::text);
  end loop;
 end if;
 report:=jsonb_build_object('inserted',added,'updated',changed,'skipped',unchanged,'rowCount',n,'fingerprint',fingerprint,'datasets',tables);
 if not p_commit then raise exception using errcode='P0099',message='preview rollback';end if;
 exception when sqlstate 'P0099' then null;
 end;
 if p_commit then
  insert into public.business_import_requests(business_id,request_id,user_id,payload_hash,result) values(p_business_id,p_request_id,auth.uid(),payload_hash,report);
  insert into public.data_transfer_jobs(business_id,user_id,direction,entity,format,mode,filename,row_count,status,summary) values(p_business_id,auth.uid(),'import',case when p_kind='backup' then 'all' else p_kind end,case when p_kind='backup' then 'json' else 'csv' end,p_mode,left(p_filename,255),n,'completed',report);
 end if;
 return report;
end;$function$
;
do $$declare d text;begin
 select pg_get_functiondef('public.tenh_import_csv_types(uuid,jsonb)'::regprocedure) into d;
 d:=replace(d,' t text;r jsonb;', ' t text; relation text;r jsonb;');
 d:=replace(d,'''business_activity_history''];', '''business_activity_history'',''branch_product_details'',''branch_receipt_settings'',''branch_customer_settings'',''branch_pos_settings'',''branch_bundle_recipes'',''branch_role_permissions'',''branch_notification_role_settings''];');
 d:=replace(d,'output:=output||jsonb_build_object(t,''[]''::jsonb);', 'relation:=case t when ''business_receipt_settings'' then ''branch_receipt_settings'' when ''business_customer_settings'' then ''branch_customer_settings'' else t end; output:=output||jsonb_build_object(t,''[]''::jsonb);');
 d:=replace(d,'format(''public.%I'',t)::regclass','format(''public.%I'',relation)::regclass');
 d:=replace(d,'''select to_jsonb(jsonb_populate_record(null::public.%I,$1))'',t)', '''select to_jsonb(jsonb_populate_record(null::public.%I,$1))'',relation)');
 execute d;
end$$;
notify pgrst,'reload schema';
commit;
