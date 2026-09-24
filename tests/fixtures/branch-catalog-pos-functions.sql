CREATE OR REPLACE FUNCTION public.tenh_pos_catalog_before_currency(p_business_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text; v_store jsonb; v_business jsonb; v_shift jsonb; v_default uuid;
begin
  v_role:=public.tenh_pos_guard(p_business_id);
  select to_jsonb(b) into v_business from public.businesses b where b.id=p_business_id;
  select to_jsonb(s) into v_store from public.business_storefronts s where s.business_id=p_business_id;
  select jsonb_build_object('id',s.id,'location_id',s.location_id) into v_shift from public.cash_register_shifts s
    where s.business_id=p_business_id and s.opened_by=auth.uid() and s.status='open' order by s.opened_at desc limit 1;
  select l.id into v_default from public.business_locations l where l.business_id=p_business_id and l.is_active=true
    order by l.is_default desc,l.name,l.id limit 1;
  return jsonb_build_object(
    'inventoryVersion',2,'inventoryLocationCount',(select count(*) from public.business_locations where business_id=p_business_id),
    'businessId',p_business_id,'businessName',v_business->>'name','userId',auth.uid(),'canConfigure',v_role='owner',
    'productMode',coalesce(v_business->>'product_mode','standard'),'businessType',coalesce(v_store->>'business_type','general'),
    'settings',jsonb_build_object('currency',coalesce(v_store->>'currency','USD'),
      'taxRate',coalesce((v_store->>'pos_tax_rate')::numeric,0),'pointValue',coalesce((v_store->>'pos_point_value')::numeric,0),
      'loyaltyEnabled',coalesce((v_store->>'loyalty_enabled')::boolean,false),
      'spendPerPoint',coalesce((v_store->>'loyalty_spend_per_point')::numeric,1),
      'loyaltyMinimumOrder',coalesce((v_store->>'loyalty_minimum_order')::numeric,0)),
    'products',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.name,'sku',p.sku,'barcode',p.barcode,'image_url',p.image_url,'variant_image_url',p.variant_image_url,
      'selling_price',p.selling_price,'stock_quantity',p.stock_quantity,'low_stock_quantity',p.low_stock_quantity,
      'category_id',p.category_id,'size',p.size,'color',p.color,'product_type',p.product_type,'variant_group_id',p.variant_group_id,
      'brand',coalesce(nullif(to_jsonb(p)->>'brand',''),nullif(to_jsonb(p)->>'brand_name','')),
      'compare_at_price',case when coalesce(to_jsonb(p)->>'compare_at_price','') ~ '^\d+(\.\d+)?$' then (to_jsonb(p)->>'compare_at_price')::numeric else null end,
      'created_at',p.created_at,'sold',coalesce(s.qty,0)
      ) order by p.name,p.id) from public.products p left join (
        select i.product_id,sum(i.quantity) qty from public.order_items i join public.orders o on o.id=i.order_id
        where o.business_id=p_business_id and o.status='completed' and o.created_at>=now()-interval '30 days' group by i.product_id
      ) s on s.product_id=p.id where p.business_id=p_business_id and p.is_active=true),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name) from public.categories c where c.business_id=p_business_id),'[]'::jsonb),
    'customers',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'phone',c.phone,'loyalty_points',c.loyalty_points) order by c.name)
      from public.customers c where c.business_id=p_business_id),'[]'::jsonb),
    'branches',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'is_default',l.is_default,'timezone',to_jsonb(l)->>'timezone') order by l.is_default desc,l.name)
      from public.business_locations l where l.business_id=p_business_id and l.is_active=true),'[]'::jsonb),
    'stock',coalesce((select jsonb_agg(jsonb_build_object('product_id',s.product_id,'location_id',s.location_id,'quantity',s.quantity,'low_stock_threshold',s.low_stock_threshold))
      from public.product_location_stock s where s.business_id=p_business_id),'[]'::jsonb),
    'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'product_id',g.product_id,'name',g.name,'selection_type',g.selection_type,'is_required',g.is_required,
      'min_selections',g.min_selections,'max_selections',g.max_selections,'sort_order',g.sort_order) order by g.sort_order,g.id)
      from public.product_option_groups g where g.business_id=p_business_id),'[]'::jsonb),
    'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'product_id',o.product_id,'group_id',o.group_id,'name',o.name,'price_adjustment',o.price_adjustment,
      'is_default',o.is_default,'is_active',o.is_active,'sort_order',o.sort_order) order by o.sort_order,o.id)
      from public.product_options o where o.business_id=p_business_id and o.is_active=true),'[]'::jsonb),
    'holds',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'label',h.label,'draft',h.draft,'version',h.version,'created_at',h.created_at,'updated_at',h.updated_at) order by h.updated_at desc)
      from public.tenh_pos_holds h where h.business_id=p_business_id and h.created_by=auth.uid() and h.order_id is null),'[]'::jsonb),
    'shift',v_shift,'defaultBranchId',coalesce(v_shift->>'location_id',v_default::text,''),'loadedAt',now());
end $function$
;
CREATE OR REPLACE FUNCTION public.tenh_pos_catalog(p_business_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_catalog jsonb; v_settings jsonb; v_store public.business_storefronts%rowtype; v_role text;
begin
  v_role:=public.tenh_pos_guard(p_business_id);
  v_catalog:=public.tenh_pos_catalog_before_currency(p_business_id);
  select * into v_store from public.business_storefronts where business_id=p_business_id;
  v_settings:=coalesce(v_catalog->'settings','{}'::jsonb)||jsonb_build_object(
    'dualCurrencyEnabled',coalesce(v_store.pos_dual_currency_enabled,true) and coalesce(v_store.currency,'USD') in ('USD','KHR'),
    'usdKhrRate',coalesce(v_store.pos_usd_khr_rate,4000));
  return v_catalog||jsonb_build_object('checkoutVersion',3,'canCreateCustomer',v_role in ('owner','cashier'),'settings',v_settings,
    'customers',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'phone',c.phone,
      'address',to_jsonb(c)->>'address','loyalty_points',c.loyalty_points) order by c.name,c.id)
      from public.customers c where c.business_id=p_business_id),'[]'::jsonb));
end $function$
;
CREATE OR REPLACE FUNCTION public.tenh_pos_currency_settings(p_business_id uuid, p_enabled boolean, p_rate numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_currency text;
begin
  if public.tenh_pos_guard(p_business_id)<>'owner' then
    raise exception 'Only the owner can change POS currency settings.' using errcode='42501';
  end if;
  if p_enabled is null or p_rate is null or p_rate::text in ('NaN','Infinity','-Infinity')
     or p_rate<1 or p_rate>1000000 or p_rate<>round(p_rate,4) then
    raise exception 'Enter a USD/KHR rate from 1 to 1000000, with up to 4 decimals.';
  end if;
  select currency into v_currency from public.business_storefronts where business_id=p_business_id for update;
  if not found then raise exception 'Save Online Store settings before configuring POS currency.'; end if;
  if coalesce(v_currency,'USD') not in ('USD','KHR') then raise exception 'USD/KHR switching requires USD or KHR as the store accounting currency.'; end if;
  update public.business_storefronts set pos_dual_currency_enabled=p_enabled,pos_usd_khr_rate=p_rate where business_id=p_business_id;
  insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,description,metadata)
    values(p_business_id,auth.uid(),'update','storefront',p_business_id,'Updated POS USD/KHR currency settings',
      jsonb_build_object('enabled',p_enabled,'usdKhrRate',p_rate,'baseCurrency',v_currency));
  return jsonb_build_object('enabled',p_enabled,'usdKhrRate',p_rate);
end $function$
;
CREATE OR REPLACE FUNCTION public.tenh_pos_settings(p_business_id uuid, p_tax_rate numeric, p_point_value numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if public.tenh_pos_guard(p_business_id)<>'owner' then raise exception 'Only the owner can change POS tax and point value.' using errcode='42501'; end if;
  if p_tax_rate is null or p_tax_rate::text in ('NaN','Infinity','-Infinity') or p_tax_rate<0 or p_tax_rate>100
    or p_point_value is null or p_point_value::text in ('NaN','Infinity','-Infinity') or p_point_value<0 or p_point_value>1000000 then raise exception 'Invalid POS settings.'; end if;
  update public.business_storefronts set pos_tax_rate=round(p_tax_rate,3),pos_point_value=round(p_point_value,4),updated_at=clock_timestamp() where business_id=p_business_id;
  if not found then raise exception 'Set up your Online Store business profile before configuring POS rates.'; end if;
  insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,description,metadata)
  values(p_business_id,auth.uid(),'update','storefront',p_business_id,'Updated POS tax and point value',jsonb_build_object('taxRate',p_tax_rate,'pointValue',p_point_value));
end $function$
;
CREATE OR REPLACE FUNCTION public.tenh_pos_checkout(p_business_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text; v_request uuid; v_hash text; v_existing public.orders%rowtype;
  v_store public.business_storefronts%rowtype; v_base text; v_rate numeric; v_enabled boolean;
  v_quote jsonb; v_display text; v_snapshot jsonb; v_input jsonb; v_receipt jsonb; v_order uuid;
  v_shipping jsonb; v_method text; v_name text; v_phone text; v_address text; v_phone_key text;
  v_amount numeric; v_foreign numeric; v_back numeric; v_parts_total numeric; v_foreign_total numeric; v_foreign_paid numeric;
  v_carrier text; v_carrier_other text; v_customer uuid; v_create boolean; v_created boolean:=false;
begin
  v_role:=public.tenh_pos_guard(p_business_id);
  if p_input is null or jsonb_typeof(p_input)<>'object' or pg_column_size(p_input)>200000 then raise exception 'Invalid sale data.'; end if;
  v_request:=(p_input->>'requestId')::uuid;
  if v_request is null then raise exception 'A sale request ID is required.'; end if;
  v_hash:=md5(p_input::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text||':'||v_request::text,0));
  -- Return a committed retry BEFORE checking today's rate or creating a customer.
  select * into v_existing from public.orders where business_id=p_business_id and pos_request_id=v_request;
  if found then
    if v_existing.pos_request_hash is distinct from v_hash
       or (v_existing.pos_checkout->>'createdBy') is distinct from auth.uid()::text then
      raise exception 'This sale request was already used with different data. Check Orders before starting another sale.';
    end if;
    return v_existing.pos_checkout->'receipt';
  end if;

  select * into v_store from public.business_storefronts where business_id=p_business_id for share;
  v_base:=coalesce(v_store.currency,'USD');v_rate:=coalesce(v_store.pos_usd_khr_rate,4000);
  v_enabled:=coalesce(v_store.pos_dual_currency_enabled,true) and v_base in ('USD','KHR');
  v_display:=v_base;
  if p_input ? 'currencyQuote' then
    v_quote:=p_input->'currencyQuote';
    if jsonb_typeof(v_quote) is distinct from 'object'
       or jsonb_typeof(v_quote->'enabled') is distinct from 'boolean'
       or jsonb_typeof(v_quote->'usdKhrRate') is distinct from 'number'
       or jsonb_typeof(v_quote->'displayCurrency') is distinct from 'string'
       or jsonb_typeof(v_quote->'baseCurrency') is distinct from 'string' then
      raise exception 'Invalid currency quote. Refresh POS.';
    end if;
    if (v_quote->>'baseCurrency') is distinct from v_base
       or (v_quote->>'usdKhrRate')::numeric is distinct from v_rate
       or (v_quote->>'enabled')::boolean is distinct from v_enabled then
      raise exception 'POS currency settings changed. Refresh POS and review payment before confirming.';
    end if;
    v_display:=v_quote->>'displayCurrency';
    if v_display<>v_base and (not v_enabled or v_display not in ('USD','KHR')) then
      raise exception 'This display currency is not enabled for the business.';
    end if;
  elsif p_input->>'uiVersion'='3' then
    raise exception 'A current currency quote is required. Refresh POS.';
  end if;
  v_snapshot:=jsonb_build_object('baseCurrency',v_base,'displayCurrency',v_display,'usdKhrRate',v_rate,'enabled',v_enabled);
  if p_input->>'uiVersion'='3' and v_display<>v_base then
    -- Never mark a base-currency debt paid with a rounded-to-zero foreign amount.
    for v_amount in
      select (p_input->>'expectedTotal')::numeric union all select (p_input->>'amountPaid')::numeric
      union all select (t->>'amount')::numeric from jsonb_array_elements(coalesce(p_input->'tenders','[]'::jsonb)) t
    loop
      if v_amount is null or v_amount::text in ('NaN','Infinity','-Infinity') or v_amount<0 or v_amount>999999999 then raise exception 'Invalid payment amounts.'; end if;
      v_foreign:=round(case when v_base='USD' then v_amount*v_rate else v_amount/v_rate end,2);
      v_back:=round(case when v_base='USD' then v_foreign/v_rate else v_foreign*v_rate end,2);
      if v_back<>v_amount then raise exception 'This order/payment has a currency precision difference. Use the accounting currency to avoid rounding a payment.'; end if;
    end loop;
    v_amount:=(p_input->>'expectedTotal')::numeric;
    v_foreign_total:=round(case when v_base='USD' then v_amount*v_rate else v_amount/v_rate end,2);
    v_amount:=(p_input->>'amountPaid')::numeric;
    v_foreign_paid:=round(case when v_base='USD' then v_amount*v_rate else v_amount/v_rate end,2);
    if p_input->>'paymentMethod'='split' then
      select sum(round(case when v_base='USD' then (t->>'amount')::numeric*v_rate else (t->>'amount')::numeric/v_rate end,2))
        into v_parts_total from jsonb_array_elements(p_input->'tenders') t;
      if v_parts_total is distinct from v_foreign_total then raise exception 'Split payments have a currency rounding difference. Adjust the parts or use the accounting currency.'; end if;
    elsif (p_input->>'amountPaid')::numeric>(p_input->>'expectedTotal')::numeric then
      v_amount:=(p_input->>'amountPaid')::numeric-(p_input->>'expectedTotal')::numeric;
      v_foreign:=round(case when v_base='USD' then v_amount*v_rate else v_amount/v_rate end,2);
      if v_foreign<>v_foreign_paid-v_foreign_total then raise exception 'Cash change has a currency rounding difference. Use exact cash or the accounting currency.'; end if;
    end if;
  end if;
  v_input:=p_input;
  v_shipping:=p_input->'shipping';v_method:=v_shipping->>'method';
  v_name:=btrim(coalesce(v_shipping->>'recipientName',''));v_phone:=btrim(coalesce(v_shipping->>'phone',''));
  v_address:=btrim(coalesce(v_shipping->>'address',''));v_carrier:=coalesce(v_shipping->>'carrier','');
  v_carrier_other:=btrim(coalesce(v_shipping->>'carrierOther',''));
  v_customer:=nullif(p_input->>'customerId','')::uuid;
  if p_input ? 'createCustomer' and jsonb_typeof(p_input->'createCustomer') is distinct from 'boolean' then raise exception 'Invalid customer save option.'; end if;
  v_create:=coalesce((p_input->>'createCustomer')::boolean,false);

  if p_input->>'uiVersion'='3' then
    if jsonb_typeof(v_shipping) is distinct from 'object' or coalesce(v_method,'') not in ('in_store','pickup','delivery') then raise exception 'Choose an order type.'; end if;
    if v_method='in_store' and (v_name<>'' or v_phone<>'' or v_address<>'') then raise exception 'In-store sales do not need recipient details. Select a customer separately.'; end if;
    if v_method in ('pickup','delivery') and (v_name='' or v_phone='') then raise exception 'Pickup and delivery need a recipient name and phone number.'; end if;
    if v_method='delivery' and (v_address='' or v_carrier not in ('jt','vet','grab','other')) then raise exception 'Choose a shipping type and enter the delivery address.'; end if;
    if length(v_carrier_other)>80 then raise exception 'Carrier name must be 80 characters or fewer.'; end if;
  end if;
  if v_create then
    if v_role not in ('owner','cashier') then raise exception 'You do not have permission to create customers.' using errcode='42501'; end if;
    if v_customer is not null or coalesce(v_method,'') not in ('pickup','delivery') or v_name='' or length(v_name)>120
       or v_phone !~ '^[+0-9() .-]{5,40}$' or length(v_address)>500 then raise exception 'Enter a recipient name and valid phone before saving a new customer.'; end if;
    v_phone_key:=regexp_replace(v_phone,'[^0-9]','','g');
    if length(v_phone_key) not between 5 and 20 then raise exception 'Enter a valid customer phone number.'; end if;
    -- Serializes opt-in customer creation through this POS route. Do not link an
    -- account automatically just because its phone matches: require selection.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tenh-pos-customer:'||p_business_id::text||':'||v_phone_key,0));
    if exists(select 1 from public.customers c where c.business_id=p_business_id and regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=v_phone_key) then
      raise exception 'A customer with this phone already exists. Select that customer, or turn off Save as new customer.';
    end if;
    insert into public.customers(owner_id,business_id,name,phone,address,note)
      values(auth.uid(),p_business_id,v_name,v_phone,case when v_method='delivery' then nullif(v_address,'') else null end,null)
      returning id into v_customer;
    v_created:=true;
    v_input:=jsonb_set(v_input,'{customerId}',to_jsonb(v_customer));
    insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,description,metadata)
      values(p_business_id,auth.uid(),'create','customer',v_customer,'Created customer with explicit POS confirmation',jsonb_build_object('requestId',v_request));
  end if;

  -- All amounts passed to the existing stock/payment engine remain in the store's
  -- accounting currency. Currency display never modifies product prices or stock.
  v_receipt:=public.tenh_pos_checkout_before_currency(p_business_id,v_input);
  v_order:=(v_receipt->>'orderId')::uuid;
  if v_order is null then raise exception 'Checkout did not return an order ID.'; end if;
  v_shipping:=v_receipt->'shipping';
  if jsonb_typeof(v_shipping)='object' and v_shipping->>'method'='delivery' then
    v_shipping:=v_shipping||jsonb_build_object('carrier',v_carrier,'carrierOther',case when v_carrier='other' then v_carrier_other else '' end);
  end if;
  v_receipt:=v_receipt||jsonb_build_object('currencyQuote',v_snapshot,'customerId',v_customer,'customerCreated',v_created,'shipping',v_shipping);
  update public.orders set pos_request_hash=v_hash,
    pos_checkout=pos_checkout||jsonb_build_object('receipt',v_receipt,'currencyQuote',v_snapshot,'shipping',v_shipping,'customerCreated',v_created)
    where id=v_order and business_id=p_business_id;
  -- Any child validation failure rolls back customer creation too. Success stores
  -- the ORIGINAL client hash, so retrying cannot create a second customer or sale.
  return v_receipt;
end $function$
;
CREATE OR REPLACE FUNCTION public.tenh_pos_checkout_before_currency(p_business_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_discount_type text; v_discount_value numeric; v_derived_discount numeric; v_calculated_subtotal numeric:=0;
  v_shipping jsonb; v_shipping_method text; v_sync_count integer; v_before_global numeric;
  v_role text; v_request uuid; v_hash text; v_existing public.orders%rowtype;
  v_branch uuid; v_customer uuid; v_items jsonb; v_item jsonb; v_product public.products%rowtype;
  v_store public.business_storefronts%rowtype; v_hold public.tenh_pos_holds%rowtype;
  v_shift public.cash_register_shifts%rowtype; v_core jsonb; v_order uuid; v_receipt jsonb;
  v_method text; v_db_method public.orders.payment_method%type;
  v_discount numeric; v_delivery numeric; v_tax numeric; v_total numeric; v_subtotal numeric;
  v_redeem integer; v_reward numeric; v_rate numeric; v_unit numeric; v_paid numeric; v_change numeric:=0;
  v_remaining numeric:=0; v_cash numeric:=0; v_points integer:=0; v_balance integer;
  v_tenders jsonb:='[]'::jsonb; v_tender jsonb; v_record record; v_qty integer; v_available integer;
  v_label text; v_customer_name text:='Walk-in customer'; v_branch_name text; v_business_name text; v_note text;
  v_expected numeric; v_earn_id uuid; v_order_number text; v_currency text; v_created timestamptz;
begin
  v_role:=public.tenh_pos_guard(p_business_id);
  if p_input is null or jsonb_typeof(p_input)<>'object' or pg_column_size(p_input)>200000 then raise exception 'Invalid sale data.'; end if;
  v_request:=(p_input->>'requestId')::uuid;
  if v_request is null then raise exception 'A sale request ID is required.'; end if;
  v_hash:=md5(p_input::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text||':'||v_request::text,0));
  select * into v_existing from public.orders where business_id=p_business_id and pos_request_id=v_request;
  if found then
    if v_existing.pos_request_hash is distinct from v_hash or (v_existing.pos_checkout->>'createdBy') is distinct from auth.uid()::text then
      raise exception 'This sale request was already used with different data. Check Orders before starting another sale.'; end if;
    return v_existing.pos_checkout->'receipt';
  end if;
  v_branch:=(p_input->>'branchId')::uuid; v_customer:=nullif(p_input->>'customerId','')::uuid;
  v_items:=p_input->'items'; v_method:=p_input->>'paymentMethod';
  if jsonb_typeof(v_items) is distinct from 'array' or jsonb_array_length(v_items) not between 1 and 100 then raise exception 'Add 1–100 cart items.'; end if;
  if v_method is null or v_method not in ('cash','cod','deposit','bank_transfer','other','credit','split') then raise exception 'Invalid payment method.'; end if;
  select name into v_branch_name from public.business_locations where id=v_branch and business_id=p_business_id and is_active=true for share;
  if not found then raise exception 'Branch not found or inactive.'; end if;
  select * into v_shift from public.cash_register_shifts where business_id=p_business_id and opened_by=auth.uid() and status='open' order by opened_at desc limit 1 for update;
  if found and v_shift.location_id<>v_branch then raise exception 'Use the branch of your open register, or close the shift first.'; end if;
  if nullif(p_input->>'holdId','') is not null then
    select * into v_hold from public.tenh_pos_holds where id=(p_input->>'holdId')::uuid and business_id=p_business_id and created_by=auth.uid() for update;
    if not found or v_hold.order_id is not null then raise exception 'This hold is missing or already completed.'; end if;
    if v_hold.version is distinct from (p_input->>'holdVersion')::integer then raise exception 'The held order changed. Refresh and resume it again.' using errcode='40001'; end if;
  end if;
  if v_customer is not null then
    select name,loyalty_points into v_customer_name,v_balance from public.customers where id=v_customer and business_id=p_business_id for update;
    if not found then raise exception 'Customer not found for this business.'; end if;
  end if;
  select * into v_store from public.business_storefronts where business_id=p_business_id for share;
  v_rate:=coalesce(v_store.pos_tax_rate,0); v_currency:=coalesce(v_store.currency,'USD');
  v_discount:=(p_input->>'discount')::numeric; v_delivery:=(p_input->>'deliveryFee')::numeric;
  v_paid:=(p_input->>'amountPaid')::numeric; v_redeem:=(p_input->>'redeemPoints')::integer;
  v_expected:=(p_input->>'expectedTotal')::numeric; v_note:=coalesce(p_input->>'note','');
  if v_discount is null or v_delivery is null or v_paid is null or v_expected is null or v_redeem is null
    or v_discount::text in ('NaN','Infinity','-Infinity') or v_delivery::text in ('NaN','Infinity','-Infinity')
    or v_paid::text in ('NaN','Infinity','-Infinity') or v_expected::text in ('NaN','Infinity','-Infinity')
    or least(v_discount,v_delivery,v_paid,v_expected,v_redeem)<0 or greatest(v_discount,v_delivery,v_paid,v_expected)>999999999
    or v_redeem>1000000 or length(v_note)>1000 then raise exception 'Invalid sale amounts or note.'; end if;
  v_discount:=round(v_discount,2); v_delivery:=round(v_delivery,2); v_paid:=round(v_paid,2);
  if (p_input ? 'discountType') <> (p_input ? 'discountValue') then raise exception 'Discount type and value must be provided together.'; end if;
  v_discount_type:=coalesce(p_input->>'discountType','amount');
  v_discount_value:=case when p_input ? 'discountValue' then (p_input->>'discountValue')::numeric else v_discount end;
  if v_discount_type not in ('amount','percent') or v_discount_value is null or v_discount_value::text in ('NaN','Infinity','-Infinity')
    or v_discount_value<0 or v_discount_value<>round(v_discount_value,2)
    or v_discount_value > (case when v_discount_type='percent' then 100 else 999999999 end) then raise exception 'Enter a valid percentage or fixed discount.'; end if;
  -- Legacy interrupted requests without shipping metadata remain retryable.
  if p_input ? 'shipping' then
    v_shipping:=p_input->'shipping'; v_shipping_method:=v_shipping->>'method';
    if jsonb_typeof(v_shipping) is distinct from 'object' or coalesce(v_shipping_method,'') not in ('in_store','pickup','delivery')
      or jsonb_typeof(v_shipping->'recipientName') is distinct from 'string' or jsonb_typeof(v_shipping->'phone') is distinct from 'string'
      or jsonb_typeof(v_shipping->'address') is distinct from 'string' or length(v_shipping->>'recipientName')>120
      or length(v_shipping->>'phone')>40 or length(v_shipping->>'address')>500 then raise exception 'Enter valid shipping details.'; end if;
    v_shipping:=jsonb_build_object('method',v_shipping_method,'recipientName',btrim(v_shipping->>'recipientName'),'phone',btrim(v_shipping->>'phone'),'address',btrim(v_shipping->>'address'));
    if v_shipping_method='delivery' and (v_shipping->>'recipientName'='' or v_shipping->>'phone'='' or v_shipping->>'address'='') then
      raise exception 'Delivery needs a recipient name, phone number and address.'; end if;
    if v_shipping_method<>'delivery' and v_delivery<>0 then raise exception 'Delivery fees only apply to Delivery.'; end if;
  end if;
  if v_rate is distinct from (p_input->>'expectedTaxRate')::numeric then raise exception 'The tax rate changed. Refresh POS and review the total.'; end if;
  if v_redeem>0 and (v_customer is null or not coalesce(v_store.loyalty_enabled,false) or coalesce(v_store.pos_point_value,0)<=0 or v_balance<v_redeem) then
    raise exception 'The customer does not have enough redeemable points, or redemption is not configured.'; end if;
  v_reward:=round(v_redeem*coalesce(v_store.pos_point_value,0),2);

  -- Consistent global-product lock order avoids cart-order-dependent locking.
  perform p.id from public.products p where p.business_id=p_business_id
    and p.id in (select (j->>'productId')::uuid from jsonb_array_elements(v_items) j) order by p.id for update;
  -- Freeze selected option prices while the trusted core validates option groups.
  perform o.id from public.product_options o where o.business_id=p_business_id
    and o.product_id in (select (j->>'productId')::uuid from jsonb_array_elements(v_items) j) order by o.id for share;
  perform g.id from public.product_option_groups g where g.business_id=p_business_id
    and g.product_id in (select (j->>'productId')::uuid from jsonb_array_elements(v_items) j) order by g.id for share;
  for v_item in select value from jsonb_array_elements(v_items) loop
    if (v_item->>'quantity')::numeric<>trunc((v_item->>'quantity')::numeric) then raise exception 'Quantities must be whole numbers.'; end if;
    v_qty:=(v_item->>'quantity')::integer;
    if v_qty is null or v_qty not between 1 and 999 or jsonb_typeof(v_item->'optionIds') is distinct from 'array' or jsonb_array_length(v_item->'optionIds')>50 then raise exception 'Invalid quantity or options.'; end if;
    select * into v_product from public.products where id=(v_item->>'productId')::uuid and business_id=p_business_id and is_active=true;
    if not found then raise exception 'A cart product is no longer available.'; end if;
    if (select count(*) from jsonb_array_elements_text(v_item->'optionIds'))<>(select count(distinct x) from jsonb_array_elements_text(v_item->'optionIds') x) then raise exception 'Duplicate option IDs are not allowed.'; end if;
    select round(v_product.selling_price+coalesce(sum(o.price_adjustment),0),2) into v_unit from public.product_options o
      where o.business_id=p_business_id and o.product_id=v_product.id and o.is_active=true and o.id in (select x::uuid from jsonb_array_elements_text(v_item->'optionIds') x);
    if v_unit is null or v_unit<0 or v_unit::text in ('NaN','Infinity','-Infinity') or v_unit is distinct from (v_item->>'expectedUnitPrice')::numeric then
      raise exception 'A product price changed. Refresh POS, update cart prices, and review the total.'; end if;
    v_calculated_subtotal:=v_calculated_subtotal+v_unit*v_qty;
  end loop;
  v_derived_discount:=case when v_discount_type='percent' then round(v_calculated_subtotal*v_discount_value/100,2) else v_discount_value end;
  if v_derived_discount<>v_discount then raise exception 'The discount or prices changed. Review the order again.'; end if;
  v_discount:=v_derived_discount;
  if v_discount+v_reward>v_calculated_subtotal then raise exception 'Discount and points cannot exceed the merchandise subtotal.'; end if;
  for v_record in select (j->>'productId')::uuid id,sum((j->>'quantity')::integer)::integer qty from jsonb_array_elements(v_items) j group by 1 order by 1 loop
    -- For a genuinely single-location business, the existing global total is
    -- authoritative. Legacy product creation/adjustment writes that total but may
    -- leave a ZERO (not just missing) branch mirror. Synchronize while the product
    -- is locked. Never increase global stock; count inactive locations as well.
    if (select count(*) from public.business_locations where business_id=p_business_id)=1 then
      select stock_quantity into v_before_global from public.products where id=v_record.id and business_id=p_business_id;
      insert into public.product_location_stock as existing(business_id,location_id,product_id,quantity,low_stock_threshold)
        select p_business_id,v_branch,p.id,greatest(coalesce(p.stock_quantity,0),0),coalesce(p.low_stock_quantity,0)
        from public.products p where p.id=v_record.id and p.business_id=p_business_id
        on conflict(location_id,product_id) do update set quantity=excluded.quantity
        where existing.business_id=p_business_id and existing.quantity is distinct from excluded.quantity;
      get diagnostics v_sync_count = row_count;
      if (select stock_quantity from public.products where id=v_record.id and business_id=p_business_id) is distinct from v_before_global then
        raise exception 'An inventory trigger changed total stock while synchronizing the branch. No sale was saved. Review Inventory configuration.';
      end if;
      if v_sync_count>0 then
        insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,description,metadata)
        values(p_business_id,auth.uid(),'update','product',v_record.id,'Synchronized single-location POS stock mirror',jsonb_build_object('locationId',v_branch,'operation','sync_branch_mirror','globalStockUnchanged',true));
      end if;
    end if;
    select quantity into v_available from public.product_location_stock where business_id=p_business_id and location_id=v_branch and product_id=v_record.id for update;
    if coalesce(v_available,0)<v_record.qty then raise exception 'Insufficient stock at the selected branch. Refresh POS or transfer stock first.'; end if;
  end loop;

  -- The existing core remains the authority for product availability, options, prices,
  -- order-item snapshots and global stock deduction. Nothing commits until this RPC ends.
  -- Attach the customer AFTER final totals, to avoid issuing loyalty on a provisional total.
  select jsonb_agg(j order by j->>'productId',j->'optionIds') into v_items from jsonb_array_elements(v_items) j;
  perform pg_catalog.set_config('search_path','pg_catalog, public, pg_temp',true);
  v_core:=public.checkout_order_with_options(p_business_id,v_items,'cod',0,null,v_discount+v_reward,v_delivery);
  perform pg_catalog.set_config('search_path','',true);
  v_order:=(v_core->>'order_id')::uuid;
  if v_order is null then raise exception 'Checkout did not return an order ID.'; end if;
  select subtotal,order_number,created_at into v_subtotal,v_order_number,v_created from public.orders where id=v_order and business_id=p_business_id for update;
  if v_discount+v_reward>v_subtotal then raise exception 'Discount and redeemed points cannot exceed the merchandise subtotal.'; end if;
  v_tax:=round((v_subtotal-v_discount-v_reward)*v_rate/100,2);
  v_total:=round(v_subtotal-v_discount-v_reward+v_tax+v_delivery,2);
  if v_total<>round(v_expected,2) then raise exception 'The order total changed. Refresh POS and review the cart before paying.'; end if;

  if v_method='cash' then
    if v_paid<v_total then raise exception 'Cash received is less than the total.'; end if;
    v_db_method:='cod'; v_change:=v_paid-v_total; v_cash:=v_total;
    v_tenders:=case when v_paid>0 then jsonb_build_array(jsonb_build_object('method','cash','amount',v_paid,'reference','')) else '[]'::jsonb end;
  elsif v_method='cod' then
    if v_paid>v_total then raise exception 'COD received amount cannot exceed the total.'; end if;
    v_db_method:='cod'; v_remaining:=v_total-v_paid; v_cash:=v_paid;
    v_tenders:=case when v_paid>0 then jsonb_build_array(jsonb_build_object('method','cash','amount',v_paid,'reference','COD amount received')) else '[]'::jsonb end;
  elsif v_method='deposit' then
    if v_paid<=0 or v_paid>=v_total then raise exception 'A cash deposit must be greater than zero and less than the total.'; end if;
    v_db_method:='deposit'; v_remaining:=v_total-v_paid; v_cash:=v_paid;
    v_tenders:=jsonb_build_array(jsonb_build_object('method','cash','amount',v_paid,'reference','Cash deposit'));
  elsif v_method='credit' then
    if v_customer is null or v_total<=0 then raise exception 'Customer credit requires a customer and a positive total.'; end if;
    v_db_method:='credit'; v_paid:=0; v_remaining:=v_total;
  elsif v_method='split' then
    v_tenders:=p_input->'tenders';
    if jsonb_typeof(v_tenders) is distinct from 'array' or jsonb_array_length(v_tenders) not between 2 and 5 then raise exception 'Enter 2–5 split payments.'; end if;
    v_paid:=0;
    for v_tender in select value from jsonb_array_elements(v_tenders) loop
      v_unit:=(v_tender->>'amount')::numeric;
      if coalesce(v_tender->>'method','') not in ('cash','bank_transfer','other') or v_unit is null or v_unit::text in ('NaN','Infinity','-Infinity') or v_unit<=0 or v_unit>999999999 or v_unit<>round(v_unit,2) or length(coalesce(v_tender->>'reference',''))>120 then raise exception 'Invalid split payment.'; end if;
      v_paid:=v_paid+v_unit;
      if v_tender->>'method'='cash' then v_cash:=v_cash+v_unit; end if;
    end loop;
    if v_paid<>v_total or v_paid is distinct from (p_input->>'amountPaid')::numeric then raise exception 'Split payments must add up exactly to the order total.'; end if;
    if coalesce((p_input->>'paymentsConfirmed')::boolean,false)=false then raise exception 'Confirm all split payments were received.'; end if;
    v_db_method:='other';
  else
    if v_paid<>v_total or coalesce((p_input->>'paymentsConfirmed')::boolean,false)=false then raise exception 'Confirm the full payment was received before recording it.'; end if;
    if v_method='bank_transfer' then v_db_method:='bank_transfer'; else v_db_method:='other'; end if;
    v_tenders:=case when v_paid>0 then jsonb_build_array(jsonb_build_object('method',v_method,'amount',v_paid,'reference','Manually confirmed by cashier')) else '[]'::jsonb end;
  end if;
  if v_redeem>0 and v_remaining>0 then raise exception 'Points can only be redeemed on fully paid sales.'; end if;
  -- TENH_DELIVERY_NEW_V1: set fulfillment status inside this checkout transaction.
  update public.orders set status=case when v_shipping_method='delivery' then 'new' else status end,
    customer_id=v_customer,total=v_total,payment_method=v_db_method,
    payment_status=case when v_remaining=0 then 'paid' else 'unpaid' end,
    amount_paid=v_paid,change_amount=v_change,remaining_balance=v_remaining,customer_note=nullif(btrim(v_note),''),
    pos_request_id=v_request,pos_request_hash=v_hash,updated_at=clock_timestamp()
    where id=v_order and business_id=p_business_id;
  if v_shipping is not null then
    update public.orders set fulfillment_type=case when v_shipping_method='delivery' then 'delivery' else 'pickup' end,
      guest_name=nullif(v_shipping->>'recipientName',''),guest_phone=nullif(v_shipping->>'phone',''),
      guest_address=case when v_shipping_method='delivery' then nullif(v_shipping->>'address','') else null end
    where id=v_order and business_id=p_business_id;
    if v_customer is null then v_customer_name:=coalesce(nullif(v_shipping->>'recipientName',''),'Walk-in customer'); end if;
  end if;
  perform public.assign_pos_order_to_location(p_business_id,v_order,v_branch,v_shift.id);
  if v_method='credit' then
    perform public.post_customer_credit(p_business_id,v_customer,'charge',v_total,'POS credit sale',v_order::text,v_order);
  end if;
  if v_redeem>0 then
    update public.customers set loyalty_points=loyalty_points-v_redeem,updated_at=clock_timestamp() where id=v_customer and business_id=p_business_id;
    insert into public.tenh_pos_points_used(order_id,business_id,customer_id,points) values(v_order,p_business_id,v_customer,v_redeem);
    insert into public.customer_loyalty_transactions(business_id,customer_id,transaction_type,points,note)
      values(p_business_id,v_customer,'adjustment',-v_redeem,'Points redeemed on POS order '||v_order_number);
  end if;
  -- Same completed-order loyalty policy as the existing Phase 6 engine; tax and
  -- delivery are excluded from points. A status reversal still uses its existing trigger.
  if coalesce(v_shipping_method,'in_store')<>'delivery' and v_customer is not null and coalesce(v_store.loyalty_enabled,false) and v_total>=coalesce(v_store.loyalty_minimum_order,0) and coalesce(v_store.loyalty_spend_per_point,0)>0 then
    v_points:=floor(greatest(v_subtotal-v_discount-v_reward,0)/v_store.loyalty_spend_per_point)::integer;
    if v_points>0 then
      insert into public.customer_loyalty_transactions(business_id,customer_id,order_id,transaction_type,points,note)
      values(p_business_id,v_customer,v_order,'earn',v_points,'Points earned from completed order '||v_order_number)
      on conflict do nothing returning id into v_earn_id;
      if v_earn_id is not null then
        update public.customers set loyalty_points=loyalty_points+v_points,lifetime_loyalty_points=lifetime_loyalty_points+v_points,updated_at=clock_timestamp() where id=v_customer and business_id=p_business_id;
        update public.orders set loyalty_points_earned=v_points where id=v_order;
      end if;
    end if;
  end if;
  select name into v_business_name from public.businesses where id=p_business_id;
  v_receipt:=jsonb_build_object('orderId',v_order,'orderNumber',v_order_number,'createdAt',v_created,
    'businessName',v_business_name,'customerName',v_customer_name,'branchName',v_branch_name,'currency',v_currency,
    'shipping',v_shipping,'discountType',v_discount_type,'discountValue',v_discount_value,
    'subtotal',v_subtotal,'manualDiscount',v_discount,'discount',v_discount+v_reward,'deliveryFee',v_delivery,
    'taxRate',v_rate,'taxAmount',v_tax,'total',v_total,'amountPaid',v_paid,'change',v_change,'remaining',v_remaining,
    'pointsRedeemed',v_redeem,'pointsEarned',v_points,'note',v_note,'tenders',v_tenders,
    'lines',coalesce((select jsonb_agg(jsonb_build_object('name',i.product_name,'variant',i.variant_label,'quantity',i.quantity,'unitPrice',i.unit_price,'subtotal',i.subtotal,'options',i.selected_options) order by i.id)
      from public.order_items i where i.order_id=v_order),'[]'::jsonb));
  v_receipt:=v_receipt||jsonb_build_object('initialStatus',case when v_shipping_method='delivery' then 'new' else 'completed' end);
  update public.orders set pos_checkout=jsonb_build_object('version',2,'shipping',v_shipping,'discountType',v_discount_type,'discountValue',v_discount_value,'createdBy',auth.uid(),'method',v_method,'taxRate',v_rate,'taxAmount',v_tax,'cashReceived',v_cash,'tenders',v_tenders,'receipt',v_receipt)
    where id=v_order and business_id=p_business_id;
  if v_hold.id is not null then update public.tenh_pos_holds set order_id=v_order,version=version+1,updated_at=clock_timestamp() where id=v_hold.id; end if;
  insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,description,metadata)
    values(p_business_id,auth.uid(),'create','order',v_order,'Created POS order '||v_order_number,jsonb_build_object('branchId',v_branch,'paymentMethod',v_method,'amountPaid',v_paid,'total',v_total,'requestId',v_request));
  return v_receipt;
end $function$
;
CREATE OR REPLACE FUNCTION public.checkout_order_with_options(p_business_id uuid, p_items jsonb, p_payment_method text, p_amount_paid numeric, p_customer_id uuid DEFAULT NULL::uuid, p_discount numeric DEFAULT 0, p_delivery_fee numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_business public.businesses%rowtype;
  v_member public.business_members%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_quantity integer;
  v_option_ids uuid[];
  v_selected_options jsonb;
  v_option_total numeric(12,2);
  v_unit_price numeric(12,2);
  v_line_subtotal numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := greatest(0, coalesce(p_discount, 0));
  v_delivery_fee numeric(12,2) := greatest(0, coalesce(p_delivery_fee, 0));
  v_total numeric(12,2);
  v_amount_paid numeric(12,2) := coalesce(p_amount_paid, 0);
  v_change numeric(12,2) := 0;
  v_remaining numeric(12,2) := 0;
  v_payment_status text;
  v_payment_method text := lower(coalesce(nullif(btrim(p_payment_method), ''), 'cod'));
  v_group record;
  v_group_selection_count integer;
  v_invalid_option_count integer;
  v_variant_label text;
  v_computed_items jsonb := '[]'::jsonb;
  v_computed jsonb;
  v_requested_by_product jsonb := '{}'::jsonb;
  v_requested_quantity integer;
  v_order_id uuid;
  v_order_number text;
begin
  if v_user_id is null then
    raise exception 'Your login session has expired.';
  end if;

  select * into v_business
  from public.businesses
  where id = p_business_id
  limit 1;

  if not found or not v_business.is_active then
    raise exception 'Business not found or inactive.';
  end if;

  select * into v_member
  from public.business_members
  where business_id = v_business.id
    and user_id = v_user_id
    and is_active = true
  limit 1;

  if not found then
    raise exception 'You no longer have access to this business.';
  end if;

  if v_business.subscription_expires_at is not null
     and v_business.subscription_expires_at <= now() then
    raise exception 'This business subscription has expired.';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception 'Too many items in one order.';
  end if;

  if v_payment_method not in ('cod', 'deposit', 'bank_transfer', 'other') then
    raise exception 'Invalid payment method.';
  end if;

  if v_amount_paid < 0 then
    raise exception 'Invalid payment amount.';
  end if;

  if p_discount is null or p_delivery_fee is null or p_discount < 0 or p_delivery_fee < 0 then
    raise exception 'Discount and delivery fee cannot be negative.';
  end if;

  if p_customer_id is not null and not exists (
    select 1
    from public.customers
    where id = p_customer_id
      and business_id = v_business.id
  ) then
    raise exception 'Customer not found for this business.';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item ->> 'productId')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'The cart contains invalid product data.';
    end;

    if v_quantity is null or v_quantity < 1 or v_quantity > 999 then
      raise exception 'Invalid product quantity.';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id
      and business_id = v_business.id
      and is_active = true
    for update;

    if not found then
      raise exception 'A product in your cart is no longer available.';
    end if;

    v_requested_quantity :=
      coalesce((v_requested_by_product ->> v_product.id::text)::integer, 0)
      + v_quantity;

    if coalesce(v_product.stock_quantity, 0) < v_requested_quantity then
      raise exception 'Not enough stock for %.', v_product.name;
    end if;

    v_requested_by_product := jsonb_set(
      v_requested_by_product,
      array[v_product.id::text],
      to_jsonb(v_requested_quantity),
      true
    );

    begin
      select coalesce(array_agg(distinct value::uuid), array[]::uuid[])
      into v_option_ids
      from jsonb_array_elements_text(
        coalesce(v_item -> 'optionIds', '[]'::jsonb)
      );
    exception when others then
      raise exception 'The cart contains invalid product option data.';
    end;

    select count(*) into v_invalid_option_count
    from unnest(v_option_ids) option_id
    left join public.product_options po
      on po.id = option_id
      and po.business_id = v_business.id
      and po.product_id = v_product.id
      and po.is_active = true
    where po.id is null;

    if v_invalid_option_count > 0 then
      raise exception 'A selected product option is no longer available.';
    end if;

    if coalesce(v_product.product_type, 'standard') = 'configurable' then
      for v_group in
        select *
        from public.product_option_groups
        where business_id = v_business.id
          and product_id = v_product.id
        order by sort_order, created_at
      loop
        select count(*) into v_group_selection_count
        from public.product_options po
        where po.group_id = v_group.id
          and po.id = any(v_option_ids)
          and po.is_active = true;

        if v_group.is_required and v_group_selection_count = 0 then
          raise exception 'Please choose an option for %.', v_group.name;
        end if;

        if v_group_selection_count < v_group.min_selections
           or v_group_selection_count > v_group.max_selections then
          raise exception 'Invalid selection count for %.', v_group.name;
        end if;
      end loop;
    elsif cardinality(v_option_ids) > 0 then
      raise exception 'This product does not support configurable options.';
    end if;

    select
      coalesce(sum(po.price_adjustment), 0),
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', po.id,
            'name', po.name,
            'priceAdjustment', po.price_adjustment,
            'groupId', po.group_id,
            'groupName', pog.name
          ) order by pog.sort_order, po.sort_order, po.created_at
        ) filter (where po.id is not null),
        '[]'::jsonb
      )
    into v_option_total, v_selected_options
    from public.product_options po
    left join public.product_option_groups pog
      on pog.id = po.group_id
    where po.id = any(v_option_ids)
      and po.business_id = v_business.id
      and po.product_id = v_product.id
      and po.is_active = true;

    v_unit_price := round(
      (coalesce(v_product.selling_price, 0) + coalesce(v_option_total, 0))::numeric,
      2
    );
    v_line_subtotal := round((v_unit_price * v_quantity)::numeric, 2);
    v_subtotal := v_subtotal + v_line_subtotal;

    v_variant_label := nullif(
      concat_ws(
        ' / ',
        nullif(btrim(coalesce(v_product.color, '')), ''),
        nullif(btrim(coalesce(v_product.size, '')), '')
      ),
      ''
    );

    v_computed_items := v_computed_items || jsonb_build_array(
      jsonb_build_object(
        'productId', v_product.id,
        'productName', v_product.name,
        'quantity', v_quantity,
        'unitPrice', v_unit_price,
        'subtotal', v_line_subtotal,
        'variantLabel', v_variant_label,
        'selectedOptions', v_selected_options
      )
    );
  end loop;

  v_subtotal := round(v_subtotal::numeric, 2);
  v_total := round((v_subtotal + v_delivery_fee - v_discount)::numeric, 2);

  if v_discount > v_subtotal + v_delivery_fee then
    raise exception 'Discount cannot be greater than the order amount.';
  end if;

  if v_total < 0 then
    raise exception 'Invalid order total.';
  end if;

  if v_payment_method = 'bank_transfer' then
    v_amount_paid := v_total;
    v_remaining := 0;
    v_change := 0;
    v_payment_status := 'paid';
  elsif v_payment_method = 'deposit' then
    if v_amount_paid <= 0 or v_amount_paid >= v_total then
      raise exception 'Deposit must be greater than zero and less than the total.';
    end if;
    v_remaining := round((v_total - v_amount_paid)::numeric, 2);
    v_change := 0;
    v_payment_status := 'unpaid';
  elsif v_payment_method = 'cod' then
    if v_amount_paid > v_total then
      raise exception 'COD amount paid cannot be greater than the total.';
    end if;
    v_remaining := round(greatest(0, v_total - v_amount_paid)::numeric, 2);
    v_change := 0;
    v_payment_status := case when v_remaining <= 0 then 'paid' else 'unpaid' end;
  else
    if v_amount_paid < v_total then
      raise exception 'Amount paid must be equal to or greater than the total.';
    end if;
    v_remaining := 0;
    v_change := round(greatest(0, v_amount_paid - v_total)::numeric, 2);
    v_payment_status := 'paid';
  end if;

  v_order_number := 'POS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.orders (
    owner_id,
    business_id,
    customer_id,
    order_number,
    subtotal,
    discount,
    delivery_fee,
    total,
    payment_method,
    payment_status,
    amount_paid,
    change_amount,
    remaining_balance,
    status,
    order_source,
    created_at,
    updated_at
  ) values (
    v_business.owner_id,
    v_business.id,
    p_customer_id,
    v_order_number,
    v_subtotal,
    v_discount,
    v_delivery_fee,
    v_total,
    v_payment_method,
    v_payment_status,
    v_amount_paid,
    v_change,
    v_remaining,
    'completed',
    'pos',
    now(),
    now()
  )
  returning id into v_order_id;

  for v_computed in
    select value from jsonb_array_elements(v_computed_items)
  loop
    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      subtotal,
      variant_label,
      selected_options
    ) values (
      v_order_id,
      (v_computed ->> 'productId')::uuid,
      v_computed ->> 'productName',
      (v_computed ->> 'quantity')::integer,
      (v_computed ->> 'unitPrice')::numeric,
      (v_computed ->> 'subtotal')::numeric,
      nullif(v_computed ->> 'variantLabel', ''),
      coalesce(v_computed -> 'selectedOptions', '[]'::jsonb)
    );

    update public.products
    set stock_quantity = stock_quantity - (v_computed ->> 'quantity')::integer,
        updated_at = now()
    where id = (v_computed ->> 'productId')::uuid
      and business_id = v_business.id;
  end loop;

  return jsonb_build_object(
    'order_id', v_order_id,
    'id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'delivery_fee', v_delivery_fee,
    'total', v_total,
    'amount_paid', v_amount_paid,
    'remaining_balance', v_remaining,
    'change_amount', v_change,
    'payment_status', v_payment_status
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.tenh_save_currency_format(p_business_id uuid, p_currency text, p_rate numeric, p_format jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_currency text;
begin
 if public.tenh_pos_guard(p_business_id) is distinct from 'owner' then raise exception 'Only the owner can change currency settings.'; end if;
 if p_currency is null or p_currency not in ('USD','KHR') or p_format is null
 or coalesce(p_format->>'position','') not in ('before','after')
 or coalesce(p_format->>'decimals','') not in ('0','2','3')
 or coalesce(p_format->>'rounding','') not in ('half-up','up','down')
 or coalesce(p_format->>'format','') not in ('en-US','de-DE','fr-FR')
 or length(trim(coalesce(p_format->>'symbol',''))) not between 1 and 8
 or p_format->>'symbol' ~ '[<>\r\n]' then raise exception 'Choose valid currency and display settings.'; end if;
 select coalesce(currency,'USD') into old_currency from public.business_storefronts where business_id=p_business_id for update;
 if not found then raise exception 'Save your Online Store details first.'; end if;
 if old_currency<>p_currency and (exists(select 1 from public.products where business_id=p_business_id) or exists(select 1 from public.orders where business_id=p_business_id)) then
  raise exception 'This store already has products or orders. Keep its accounting currency to preserve recorded prices. You can still change its display format.';
 end if;
 perform public.tenh_pos_currency_settings(p_business_id,false,p_rate);
 update public.business_storefronts set currency=p_currency,currency_format=p_format where business_id=p_business_id;
end;
$function$
;
