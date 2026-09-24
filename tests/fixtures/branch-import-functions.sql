CREATE OR REPLACE FUNCTION public.tenh_export_business(p_business_id uuid, p_tables text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t text; condition text; rows jsonb; output jsonb:='{}';
 allowed text[]:=array['businesses','business_locations','business_storefronts','business_receipt_settings','business_customer_settings','business_delivery_zones','business_tables','products','product_variants','categories','product_location_stock','product_option_groups','product_options','bundle_items','inventory_movements','stock_adjustments','stock_transfers','stock_transfer_items','orders','order_items','returns','return_items','tenh_pos_holds','tenh_pos_points_used','customers','customer_credit_accounts','customer_credit_ledger','customer_loyalty_transactions','business_coupons','coupon_redemptions','suppliers','purchases','purchase_items','purchase_orders','purchase_order_items','expenses','cash_register_shifts','cash_movements','business_members','profiles','business_member_permissions','business_role_permissions','business_notifications','business_notification_reads','business_notification_preferences','business_notification_role_settings','audit_logs','business_activity_history','data_transfer_jobs','business_slug_release_history','subscription_history','subscription_orders','business_change_orders'];
begin
 if not exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid() and role::text='owner' and is_active) then raise exception 'Only the business owner can export the complete business.';end if;
 if p_tables is null or cardinality(p_tables)=0 or not p_tables<@allowed then raise exception 'Select valid data to export.';end if;
 foreach t in array p_tables loop
  condition:=case t
   when 'businesses' then 'r.id=$1'
   when 'profiles' then 'r.id in (select user_id from public.business_members where business_id=$1)'
   when 'order_items' then 'r.order_id in (select id from public.orders where business_id=$1)'
   when 'product_variants' then 'r.product_id in (select id from public.products where business_id=$1)'
   when 'purchase_items' then 'r.purchase_id in (select id from public.purchases where business_id=$1)'
   when 'return_items' then 'r.return_id in (select id from public.returns where business_id=$1)'
   when 'business_member_permissions' then 'r.member_id in (select id from public.business_members where business_id=$1)'
   when 'business_notification_reads' then 'r.notification_id in (select id from public.business_notifications where business_id=$1)'
   else 'r.business_id=$1' end;
  execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from public.%I r where %s',t,condition) into rows using p_business_id;
  output:=output||jsonb_build_object(t,rows);
 end loop;
 return public.tenh_export_redact(output);
end;$function$
;
CREATE OR REPLACE FUNCTION public.import_branch_inventory_safe(p_business_id uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_item jsonb;
  v_product public.products%rowtype;
  v_location public.business_locations%rowtype;
  v_quantity integer;
  v_threshold integer;
  v_before integer;
  v_after integer;
  v_updated integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1 from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = v_user
      and bm.is_active = true
      and bm.role = 'owner'
  ) then
    raise exception 'Only the business owner can import inventory.';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Inventory import must be a JSON array.';
  end if;

  if jsonb_array_length(p_rows) = 0 then
    raise exception 'Inventory import is empty.';
  end if;

  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'Inventory import is limited to 1000 rows.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text, 9616));

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    begin
      v_quantity := (v_item->>'quantity')::integer;
      v_threshold := coalesce(nullif(v_item->>'low_stock_threshold','')::integer, 0);
    exception when others then
      raise exception 'Inventory quantity or low-stock threshold is invalid.';
    end;

    if v_quantity < 0 or v_threshold < 0 then
      raise exception 'Inventory quantities cannot be negative.';
    end if;

    select * into v_product
    from public.products
    where business_id = p_business_id
      and upper(sku) = upper(btrim(v_item->>'sku'))
    for update;
    if not found then
      raise exception 'Product SKU % was not found in this business.', v_item->>'sku';
    end if;

    select * into v_location
    from public.business_locations
    where business_id = p_business_id
      and upper(code) = upper(btrim(v_item->>'branch_code'))
      and is_active = true
    for update;
    if not found then
      raise exception 'Active branch code % was not found in this business.', v_item->>'branch_code';
    end if;

    v_before := coalesce(v_product.stock_quantity, 0);

    insert into public.product_location_stock (
      business_id, location_id, product_id, quantity, low_stock_threshold, updated_at
    ) values (
      p_business_id, v_location.id, v_product.id, v_quantity, v_threshold, now()
    )
    on conflict (location_id, product_id)
    do update set
      business_id = excluded.business_id,
      quantity = excluded.quantity,
      low_stock_threshold = excluded.low_stock_threshold,
      updated_at = now();

    select coalesce(sum(pls.quantity), 0)::integer
      into v_after
    from public.product_location_stock pls
    where pls.business_id = p_business_id
      and pls.product_id = v_product.id;

    update public.products
    set stock_quantity = v_after,
        updated_at = now()
    where id = v_product.id
      and business_id = p_business_id;

    if v_before <> v_after then
      insert into public.stock_adjustments (
        business_id, product_id, adjustment_type, quantity_delta,
        stock_before, stock_after, reason, reference, created_by
      ) values (
        p_business_id, v_product.id, 'set', v_after - v_before,
        v_before, v_after, 'Branch inventory CSV import',
        'CSV:' || v_location.code, v_user
      );
    end if;

    v_updated := v_updated + 1;
  end loop;

  return jsonb_build_object('updated', v_updated, 'skipped', 0);
end;
$function$
;
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
 tables text[]; fields text[]; keys text[]; pk text[]; condition text; cols text; vals text;
 row_id uuid; matches uuid[]; n integer:=0; added integer:=0; changed integer:=0; unchanged integer:=0;
 fingerprint text; payload_hash text; safe_table boolean; seen text[]:=array[]::text[]; identity text;
 allowed text[]:=array['businesses','business_locations','business_storefronts','business_receipt_settings','business_customer_settings','business_delivery_zones','business_tables','products','product_variants','categories','product_location_stock','product_option_groups','product_options','bundle_items','inventory_movements','stock_adjustments','stock_transfers','stock_transfer_items','orders','order_items','returns','return_items','tenh_pos_holds','tenh_pos_points_used','customers','customer_credit_accounts','customer_credit_ledger','customer_loyalty_transactions','business_coupons','coupon_redemptions','suppliers','purchases','purchase_items','purchase_orders','purchase_order_items','expenses','cash_register_shifts','cash_movements','audit_logs','business_activity_history'];
begin
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
 snap:=public.tenh_export_business(p_business_id,tables);
 select md5(coalesce(jsonb_object_agg(key,(select coalesce(jsonb_agg(value order by value::text),'[]') from jsonb_array_elements(e.value))),'{}')::text) into fingerprint from jsonb_each(snap) e;
 fingerprint:=md5(jsonb_build_array(fingerprint,payload_hash)::text);
 if p_commit and p_expected<>fingerprint then raise exception 'Data changed since validation. Validate again before importing.';end if;
 -- Preview executes real constraints and triggers in a rolled-back subtransaction.
 begin
 if p_kind='backup' then
  foreach t in array tables loop
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
   safe_table:=t in ('business_storefronts','business_receipt_settings','business_customer_settings','business_delivery_zones','business_tables','categories');
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
    select string_agg(format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',key,t,key),',') into cols from jsonb_each(patch);
    select string_agg(format('to_jsonb(target)->%L=$2->%L',k,k),' and ') into condition from unnest(pk) k;
    execute format('select to_jsonb(target) from public.%I target where %s',t,replace(condition,'$2','$1')) into full_row using r;
    if exists(select 1 from jsonb_object_keys(patch) k where full_row->k is distinct from old_row->k) then raise exception 'Sensitive settings must be edited in Settings; import would remove hidden credentials.';end if;
    execute format('update public.%I target set %s where %s',t,cols,condition) using patch,r;
    changed:=changed+1;
   end loop;
  end loop;
 elsif p_kind='inventory' then
  for r in select value from jsonb_array_elements(p_payload) loop
   if not exists(select 1 from public.business_locations where id=p_branch_id and business_id=p_business_id and upper(code)=upper(r->>'branch_code')) then raise exception 'Inventory file contains a different branch. Switch branch before importing.';end if;
   if upper(r->>'sku')=any(seen) then raise exception 'Duplicate inventory SKU.';end if;seen:=array_append(seen,upper(r->>'sku'));
   select array_agg(id) into matches from public.products where business_id=p_business_id and upper(sku)=upper(r->>'sku');
   if coalesce(cardinality(matches),0)<>1 then raise exception 'Inventory SKU must match exactly one product in this business.';end if;
   select exists(select 1 from public.product_location_stock where business_id=p_business_id and location_id=p_branch_id and product_id=matches[1]) into inventory_exists;
   if (p_mode='insert' and inventory_exists) or (p_mode='update' and not inventory_exists) then unchanged:=unchanged+1;continue;end if;
   if coalesce((r->>'quantity')::integer,-1)<0 or coalesce((r->>'low_stock_threshold')::integer,0)<0 then raise exception 'Inventory quantities must be zero or greater.';end if;
   eligible:=eligible||jsonb_build_array(r);
   if inventory_exists then changed:=changed+1;else added:=added+1;end if;
  end loop;
  if jsonb_array_length(eligible)>0 then perform public.import_branch_inventory_safe(p_business_id,eligible);end if;
  n:=jsonb_array_length(p_payload);
 else
  if p_kind='products' and not exists(select 1 from public.businesses where id=p_business_id and product_mode='standard') then raise exception 'Use Products to manage products with variants or options.';end if;
  fields:=case p_kind when 'products' then array['name','sku','barcode','description','cost_price','selling_price','low_stock_quantity','is_active'] when 'customers' then array['name','phone','email','address','note'] else array['name','contact_person','phone','email','address','notes','is_active'] end;
  for r in select value from jsonb_array_elements(p_payload) loop
   n:=n+1;
   if jsonb_typeof(r)<>'object' or length(trim(coalesce(r->>'name','')))<2 or exists(select 1 from jsonb_object_keys(r) k where not k=any(fields)) then raise exception 'Invalid or unsupported fields in row %.',n;end if;
   if p_kind='products' then
    if nullif(trim(r->>'sku'),'') is null or coalesce((r->>'cost_price')::numeric,-1)<0 or coalesce((r->>'selling_price')::numeric,-1)<0 or coalesce((r->>'low_stock_quantity')::integer,-1)<0 then raise exception 'Invalid product values in row %.',n;end if;
    select array_agg(id) into matches from public.products where business_id=p_business_id and upper(sku)=upper(r->>'sku');
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
    added:=added+1;
   else
    select value into old_row from jsonb_array_elements(snap->p_kind) where value->>'id'=row_id::text;
    if old_row @> patch then unchanged:=unchanged+1;
    else
     select string_agg(format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',key,p_kind,key),',') into cols from jsonb_each(patch);
     execute format('update public.%I set %s,updated_at=now() where id=$2 and business_id=$3',p_kind,cols) using patch,row_id,p_business_id;
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
CREATE OR REPLACE FUNCTION public.tenh_import_csv_types(p_business_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '15s'
AS $function$
declare
 t text;r jsonb;v jsonb;typed jsonb;col record; k text; output jsonb:='{}'; rows jsonb; n integer:=0;
 allowed text[]:=array['businesses','business_locations','business_storefronts','business_receipt_settings','business_customer_settings','business_delivery_zones','business_tables','products','product_variants','categories','product_location_stock','product_option_groups','product_options','bundle_items','inventory_movements','stock_adjustments','stock_transfers','stock_transfer_items','orders','order_items','returns','return_items','tenh_pos_holds','tenh_pos_points_used','customers','customer_credit_accounts','customer_credit_ledger','customer_loyalty_transactions','business_coupons','coupon_redemptions','suppliers','purchases','purchase_items','purchase_orders','purchase_order_items','expenses','cash_register_shifts','cash_movements','audit_logs','business_activity_history'];
begin
 if not exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid() and role::text='owner' and is_active) then raise exception 'Only the business owner can import data.';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>10000000 then raise exception 'Choose a valid file under 10 MB.';end if;
 for t,rows in select key,value from jsonb_each(p_payload) loop
  if not t=any(allowed) or jsonb_typeof(rows)<>'array' then raise exception 'Invalid import feature.';end if;
  output:=output||jsonb_build_object(t,'[]'::jsonb);
  for r in select value from jsonb_array_elements(rows) loop
   n:=n+1;
   if n>20000 or jsonb_typeof(r)<>'object' then raise exception 'Include at most 20,000 valid records.';end if;
   v:='{}';
   for k in select jsonb_object_keys(r) loop
    select a.attname,y.typcategory,y.typname into col from pg_catalog.pg_attribute a join pg_catalog.pg_type y on y.oid=a.atttypid where a.attrelid=format('public.%I',t)::regclass and a.attname=k and a.attnum>0 and not a.attisdropped;
    if not found then
     -- A combined Export CSV has empty columns belonging to other datasets.
     if coalesce(r->>k,'')<>'' then raise exception 'Unknown column % in %.',k,t;end if;
     continue;
    end if;
    if k ~* '(password|secret|token|credential|api.?key|authorization|fingerprint|raw_payload|provider_response|payway_response)' then raise exception 'Security credentials cannot be imported.';end if;
    if jsonb_typeof(r->k) not in ('string','null') then raise exception 'CSV values must be text.';end if;
    if r->k='null'::jsonb then v:=v||jsonb_build_object(k,null);
    elsif col.typname in ('json','jsonb') or col.typcategory='A' then
     v:=v||jsonb_build_object(k,(r->>k)::jsonb);
    else v:=v||jsonb_build_object(k,r->k);end if;
   end loop;
   if public.tenh_export_redact(v) is distinct from v then raise exception 'Security credentials cannot be imported.';end if;
   execute format('select to_jsonb(jsonb_populate_record(null::public.%I,$1))',t) into typed using v;
   -- Do not introduce nulls for omitted fields or lose empty strings.
   select coalesce(jsonb_object_agg(key,value),'{}') into typed from jsonb_each(typed) where v ? key;
   output:=jsonb_set(output,array[t],(output->t)||jsonb_build_array(typed));
  end loop;
 end loop;
 return output;
end;$function$
;
CREATE OR REPLACE FUNCTION public.tenh_create_packed_bundle_with_image(p_business_id uuid, p_branch_id uuid, p_request_id uuid, p_input jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_replay boolean;
  v_path text := p_input->>'imagePath';
  v_url text := p_input->>'imageUrl';
begin
  perform public.tenh_assert_effective_permission(p_business_id, 'products.create');
  if v_path is null or v_url is null
    or v_path !~ ('^' || p_business_id::text || '/' || auth.uid()::text || '/' || p_request_id::text || '-[0-9a-f]{64}\.(jpg|png|webp)$')
    or v_url !~ '^https://[^/]+/storage/v1/object/public/product-images/'
    or right(v_url, length('/storage/v1/object/public/product-images/' || v_path)) <> '/storage/v1/object/public/product-images/' || v_path then
    raise exception 'Invalid bundle image.';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'product-images' and name = v_path) then
    raise exception 'Upload the bundle image before creating the bundle.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || p_request_id::text, 20260924));
  select exists(select 1 from public.bundle_stock_requests where business_id = p_business_id and request_id = p_request_id) into v_replay;
  v_id := public.tenh_create_packed_bundle(p_business_id, p_branch_id, p_request_id, p_input);
  if not v_replay then
    update public.products set image_url = v_url where id = v_id and business_id = p_business_id;
  end if;
  return v_id;
end;
$function$

