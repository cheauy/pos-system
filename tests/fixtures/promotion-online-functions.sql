CREATE OR REPLACE FUNCTION public.place_online_order(p_business_slug text, p_items jsonb, p_fulfillment_type text, p_guest_name text, p_guest_phone text, p_guest_address text DEFAULT NULL::text, p_customer_note text DEFAULT NULL::text, p_table_token uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'cod'::text, p_payment_reference text DEFAULT NULL::text, p_delivery_zone_id uuid DEFAULT NULL::uuid, p_requested_for timestamp with time zone DEFAULT NULL::timestamp with time zone, p_coupon_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_business public.businesses%rowtype;
  v_store public.business_storefronts%rowtype;
  v_table public.business_tables%rowtype;
  v_zone public.business_delivery_zones%rowtype;
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
  v_delivery_fee numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_group record;
  v_group_selection_count integer;
  v_invalid_option_count integer;
  v_variant_label text;
  v_computed_items jsonb := '[]'::jsonb;
  v_computed jsonb;
  v_order_id uuid;
  v_order_number text;
  v_public_token uuid;
  v_order_source text := 'online';
  v_payment_method text := lower(coalesce(nullif(btrim(p_payment_method), ''), 'cod'));
  v_payment_status text := 'unpaid';
  v_active_zone_count integer := 0;
  v_customer_id uuid;
  v_phone_key text;
  v_coupon public.business_coupons%rowtype;
  v_coupon_code text;
  v_coupon_discount numeric(12,2) := 0;
  v_customer_coupon_uses integer := 0;
begin
  if coalesce(auth.role(),'')<>'service_role' or nullif(current_setting('tenh.online_branch',true),'') is null then raise exception 'Use the store checkout.'; end if;
  if p_business_slug is null or btrim(p_business_slug) = '' then
    raise exception 'Store not found.';
  end if;

  select *
    into v_business
  from public.businesses
  where slug = lower(btrim(p_business_slug))
  limit 1;

  if not found then
    raise exception 'Store not found.';
  end if;

  if not v_business.is_active then
    raise exception 'This business is currently unavailable.';
  end if;

  if v_business.subscription_expires_at is not null
     and v_business.subscription_expires_at <= now() then
    raise exception 'This business subscription has expired.';
  end if;

  select *
    into v_store
  from public.business_storefronts
  where business_id = v_business.id
  limit 1;

  if not found or not v_store.is_published then
    raise exception 'This online store is not published.';
  end if;

  if not v_store.accept_online_orders then
    raise exception 'This store is not accepting online orders right now.';
  end if;

  if v_payment_method not in ('cod', 'khqr') then
    raise exception 'Invalid online payment method.';
  end if;

  if v_payment_method = 'cod' and not coalesce(v_store.accept_cod, true) then
    raise exception 'Pay later is not available for this store.';
  end if;

  if v_payment_method = 'khqr' then
    if not coalesce(v_store.accept_khqr, false) then
      raise exception 'KHQR payment is not available for this store.';
    end if;

    if v_store.khqr_image_url is null or btrim(v_store.khqr_image_url) = '' then
      raise exception 'The store has not configured its KHQR code yet.';
    end if;

    v_payment_status := 'pending_verification';
  end if;

  if p_fulfillment_type not in ('pickup', 'delivery', 'dine_in') then
    raise exception 'Invalid fulfillment type.';
  end if;

  if p_fulfillment_type = 'pickup' and not v_store.allow_pickup then
    raise exception 'Pickup is not available.';
  end if;

  if p_fulfillment_type = 'delivery' and not v_store.allow_delivery then
    raise exception 'Delivery is not available.';
  end if;

  if p_fulfillment_type = 'dine_in' and not v_store.allow_dine_in then
    raise exception 'Dine in ordering is not available.';
  end if;

  if p_guest_name is null or char_length(btrim(p_guest_name)) < 2 then
    raise exception 'Please enter your name.';
  end if;

  if p_guest_phone is null or char_length(btrim(p_guest_phone)) < 5 then
    raise exception 'Please enter a valid phone number.';
  end if;

  if p_fulfillment_type = 'delivery'
     and (p_guest_address is null or char_length(btrim(p_guest_address)) < 4) then
    raise exception 'Please enter a delivery address.';
  end if;

  -- Phase 6: link guest checkout to the existing customer CRM by normalized phone.
  -- This runs inside the same transaction, so a later checkout validation failure
  -- also rolls back any new customer record.
  v_phone_key := regexp_replace(p_guest_phone, '[^0-9]', '', 'g');

  if char_length(v_phone_key) < 5 then
    raise exception 'Please enter a valid phone number.';
  end if;

  select id
    into v_customer_id
  from public.customers
  where business_id = v_business.id
    and location_id = current_setting('tenh.online_branch')::uuid
    and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_phone_key
  order by created_at asc
  limit 1
  for update;

  if not found then
    insert into public.customers (
      location_id,
      owner_id,
      business_id,
      name,
      phone,
      address,
      note,
      created_at,
      updated_at
    )
    values (
      current_setting('tenh.online_branch')::uuid,
      v_business.owner_id,
      v_business.id,
      left(btrim(p_guest_name), 120),
      left(btrim(p_guest_phone), 60),
      case when p_guest_address is null then null else left(btrim(p_guest_address), 500) end,
      'Created automatically from online checkout',
      now(),
      now()
    )
    returning id into v_customer_id;
  else
    update public.customers
    set
      phone = coalesce(nullif(phone, ''), left(btrim(p_guest_phone), 60)),
      address = coalesce(
        nullif(address, ''),
        case when p_guest_address is null then null else left(btrim(p_guest_address), 500) end
      ),
      updated_at = now()
    where id = v_customer_id
      and business_id = v_business.id;
  end if;

  if p_table_token is not null then
    select *
      into v_table
    from public.business_tables
    where business_id = v_business.id
      and public_token = p_table_token
      and is_active = true
    limit 1;

    if not found then
      raise exception 'This table QR code is no longer valid.';
    end if;

    v_order_source := 'qr';

    if p_fulfillment_type <> 'dine_in' then
      raise exception 'Table QR orders must use dine in.';
    end if;
  elsif p_fulfillment_type = 'dine_in' then
    raise exception 'Please scan a valid table QR code for dine in ordering.';
  end if;

  if p_fulfillment_type = 'delivery' then
    select count(*)
      into v_active_zone_count
    from public.business_delivery_zones
    where business_id = v_business.id
      and is_active = true;

    if p_delivery_zone_id is not null then
      select *
        into v_zone
      from public.business_delivery_zones
      where id = p_delivery_zone_id
        and business_id = v_business.id
        and is_active = true
      limit 1;

      if not found then
        raise exception 'The selected delivery zone is no longer available.';
      end if;
    elsif v_active_zone_count > 0 then
      raise exception 'Please select a delivery zone.';
    end if;
  elsif p_delivery_zone_id is not null then
    raise exception 'Delivery zones can only be used for delivery orders.';
  end if;

  if p_requested_for is not null then
    if not coalesce(v_store.allow_scheduled_orders, false) then
      raise exception 'Scheduled ordering is not available for this store.';
    end if;

    if p_table_token is not null then
      raise exception 'Table QR orders must be placed for now.';
    end if;

    if p_requested_for < now() + make_interval(mins => greatest(coalesce(v_store.min_schedule_lead_minutes, 30), 0)) then
      raise exception 'The requested time is too soon.';
    end if;

    if p_requested_for > now() + make_interval(days => greatest(coalesce(v_store.max_schedule_days, 7), 1)) then
      raise exception 'The requested time is too far in advance.';
    end if;
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception 'Too many items in one order.';
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

    select *
      into v_product
    from public.products
    where id = v_product_id
      and business_id = v_business.id
      and is_active = true
      and is_online = true
    for update;

    if not found then
      raise exception 'A product in your cart is no longer available.';
    end if;

    if coalesce(v_product.stock_quantity, 0) < v_quantity then
      raise exception 'Not enough stock for %.', v_product.name;
    end if;

    select coalesce(
      array_agg(value::uuid),
      array[]::uuid[]
    )
    into v_option_ids
    from jsonb_array_elements_text(
      coalesce(v_item -> 'optionIds', '[]'::jsonb)
    );

    select count(*)
      into v_invalid_option_count
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
        select count(*)
          into v_group_selection_count
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
            'groupId', po.group_id
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

    v_line_subtotal := round(
      (v_unit_price * v_quantity)::numeric,
      2
    );

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

  if v_subtotal < coalesce(v_store.minimum_order, 0) then
    raise exception 'Minimum order is %.', v_store.minimum_order;
  end if;

  if p_fulfillment_type = 'delivery' then
    if p_delivery_zone_id is not null then
      if v_subtotal < coalesce(v_zone.minimum_order, 0) then
        raise exception 'Minimum order for % is %.', v_zone.name, v_zone.minimum_order;
      end if;
      v_delivery_fee := coalesce(v_zone.fee, 0);
    else
      v_delivery_fee := coalesce(v_store.delivery_fee, 0);
    end if;
  end if;

  v_coupon_code := upper(nullif(btrim(p_coupon_code), ''));

  if v_coupon_code is not null then
    if not coalesce(v_store.enable_coupons, true) then
      raise exception 'Coupons are not enabled for this store.';
    end if;

    select *
      into v_coupon
    from public.business_coupons
    where business_id = v_business.id
      and location_id = current_setting('tenh.online_branch')::uuid
      and upper(code) = v_coupon_code
      and is_active = true
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at >= now())
    limit 1
    for update;

    if not found then
      raise exception 'This coupon is invalid or expired.';
    end if;

    if v_subtotal < coalesce(v_coupon.minimum_order, 0) then
      raise exception 'This coupon requires a minimum order of %.', v_coupon.minimum_order;
    end if;

    if v_coupon.usage_limit is not null
       and v_coupon.usage_count >= v_coupon.usage_limit then
      raise exception 'This coupon has reached its usage limit.';
    end if;

    if v_coupon.per_customer_limit is not null then
      select count(*)
        into v_customer_coupon_uses
      from public.coupon_redemptions
      where coupon_id = v_coupon.id
        and customer_id = v_customer_id;

      if v_customer_coupon_uses >= v_coupon.per_customer_limit then
        raise exception 'You have already used this coupon the maximum number of times.';
      end if;
    end if;

    if v_coupon.discount_type = 'percentage' then
      v_coupon_discount := round((v_subtotal * v_coupon.discount_value / 100)::numeric, 2);
    else
      v_coupon_discount := least(v_subtotal, v_coupon.discount_value);
    end if;

    if v_coupon.max_discount is not null then
      v_coupon_discount := least(v_coupon_discount, v_coupon.max_discount);
    end if;

    v_coupon_discount := greatest(0, least(v_coupon_discount, v_subtotal));
  end if;

  v_total := round((v_subtotal - v_coupon_discount + v_delivery_fee)::numeric, 2);
  v_order_number := 'WEB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_public_token := gen_random_uuid();

  insert into public.orders (
    owner_id,
    business_id,
    customer_id,
    order_number,
    subtotal,
    discount,
    coupon_id,
    coupon_code,
    coupon_discount,
    delivery_fee,
    total,
    payment_method,
    payment_status,
    payment_reference,
    amount_paid,
    change_amount,
    remaining_balance,
    status,
    order_source,
    fulfillment_type,
    online_status,
    guest_name,
    guest_phone,
    guest_address,
    customer_note,
    delivery_zone_id,
    delivery_zone_name,
    requested_for,
    table_id,
    table_name,
    public_order_token,
    created_at,
    updated_at
  )
  values (
    v_business.owner_id,
    v_business.id,
    v_customer_id,
    v_order_number,
    v_subtotal,
    v_coupon_discount,
    case when v_coupon_code is null then null else v_coupon.id end,
    v_coupon_code,
    v_coupon_discount,
    v_delivery_fee,
    v_total,
    v_payment_method,
    v_payment_status,
    case when p_payment_reference is null then null else left(btrim(p_payment_reference), 120) end,
    0,
    0,
    v_total,
    'new',
    v_order_source,
    p_fulfillment_type,
    'new',
    left(btrim(p_guest_name), 120),
    left(btrim(p_guest_phone), 60),
    case when p_guest_address is null then null else left(btrim(p_guest_address), 500) end,
    case when p_customer_note is null then null else left(btrim(p_customer_note), 1000) end,
    case when p_delivery_zone_id is null then null else v_zone.id end,
    case when p_delivery_zone_id is null then null else v_zone.name end,
    p_requested_for,
    case when p_table_token is null then null else v_table.id end,
    case when p_table_token is null then null else v_table.name end,
    v_public_token,
    now(),
    now()
  )
  returning id into v_order_id;

  if v_coupon_code is not null then
    insert into public.coupon_redemptions (
      business_id,
      coupon_id,
      order_id,
      customer_id,
      guest_phone,
      discount_amount,
      created_at
    )
    values (
      v_business.id,
      v_coupon.id,
      v_order_id,
      v_customer_id,
      left(btrim(p_guest_phone), 60),
      v_coupon_discount,
      now()
    );

    update public.business_coupons
    set usage_count = usage_count + 1,
        updated_at = now()
    where id = v_coupon.id
      and business_id = v_business.id;
  end if;

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
    )
    values (
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
    'orderId', v_order_id,
    'orderNumber', v_order_number,
    'publicToken', v_public_token,
    'subtotal', v_subtotal,
    'discount', v_coupon_discount,
    'couponCode', v_coupon_code,
    'deliveryFee', v_delivery_fee,
    'total', v_total,
    'customerId', v_customer_id,
    'currency', v_store.currency,
    'onlineStatus', 'new',
    'paymentMethod', v_payment_method,
    'paymentStatus', v_payment_status,
    'deliveryZoneName', case when p_delivery_zone_id is null then null else v_zone.name end,
    'requestedFor', p_requested_for
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_order_loyalty_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store public.business_storefronts%rowtype;
  v_points integer := 0;
  v_earned_points integer := 0;
  v_transaction_id uuid;
begin
  if new.customer_id is null then
    return new;
  end if;

  select *
    into v_store
  from public.business_storefronts
  where business_id = new.business_id
  limit 1;

  if new.status = 'completed' then
    if tg_op = 'INSERT'
       or (tg_op = 'UPDATE' and old.status is distinct from 'completed') then
      if coalesce(v_store.loyalty_enabled, false)
       and coalesce(new.total, 0) >= coalesce(v_store.loyalty_minimum_order, 0)
       and coalesce(v_store.loyalty_spend_per_point, 0) > 0 then

      v_points := floor(
        greatest(coalesce(new.total, 0) - coalesce(new.delivery_fee, 0), 0)
        / v_store.loyalty_spend_per_point
      )::integer;

      if v_points > 0 then
        insert into public.customer_loyalty_transactions (
          business_id,
          customer_id,
          order_id,
          transaction_type,
          points,
          note
        )
        values (
          new.business_id,
          new.customer_id,
          new.id,
          'earn',
          v_points,
          'Points earned from completed order ' || coalesce(new.order_number, new.id::text)
        )
        on conflict do nothing
        returning id into v_transaction_id;

        if v_transaction_id is not null then
          update public.customers
          set loyalty_points = loyalty_points + v_points,
              lifetime_loyalty_points = lifetime_loyalty_points + v_points,
              updated_at = now()
          where id = new.customer_id
            and business_id = new.business_id;

          update public.orders
          set loyalty_points_earned = v_points
          where id = new.id;
        end if;
      end if;
    end if;
    end if;
  elsif tg_op = 'UPDATE'
        and old.status = 'completed'
        and new.status is distinct from 'completed' then
    select points
      into v_earned_points
    from public.customer_loyalty_transactions
    where order_id = new.id
      and transaction_type = 'earn'
    limit 1;

    if coalesce(v_earned_points, 0) > 0 then
      v_transaction_id := null;

      insert into public.customer_loyalty_transactions (
        business_id,
        customer_id,
        order_id,
        transaction_type,
        points,
        note
      )
      values (
        new.business_id,
        new.customer_id,
        new.id,
        'reversal',
        -v_earned_points,
        'Reversed points because order is no longer completed'
      )
      on conflict do nothing
      returning id into v_transaction_id;

      if v_transaction_id is not null then
        update public.customers
        set loyalty_points = greatest(0, loyalty_points - v_earned_points),
            lifetime_loyalty_points = greatest(0, lifetime_loyalty_points - v_earned_points),
            updated_at = now()
        where id = new.customer_id
          and business_id = new.business_id;

        update public.orders
        set loyalty_points_earned = 0
        where id = new.id;
      end if;
    end if;
  end if;

  return new;
end;
$function$
;
