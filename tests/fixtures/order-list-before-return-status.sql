CREATE OR REPLACE FUNCTION public.tenh_orders_workspace(p_business_id uuid, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_zone text := 'UTC'; v_currency text := 'USD';
  v_search text := left(coalesce(p_filters->>'search',''),120);
  v_status text := coalesce(p_filters->>'status','all');
  v_limit integer := least(50,greatest(10,coalesce((p_filters->>'limit')::integer,10)));
  v_page integer := greatest(1,coalesce((p_filters->>'page')::integer,1));
  v_from date := nullif(p_filters->>'from','')::date;
  v_to date := nullif(p_filters->>'to','')::date;
  v_result jsonb;
begin
  if v_user is null or not exists (
    select 1 from public.business_members m
    where m.business_id=p_business_id and m.user_id=v_user and m.is_active=true
      and m.role::text in ('owner','admin','manager','cashier')
  ) then raise exception 'You do not have access to these orders.' using errcode='42501'; end if;
  if v_status not in ('all','new','pending','completed','cancelled','refunded') then v_status := 'all'; end if;
  select l.timezone into v_zone from public.business_locations l
    where l.business_id=p_business_id and l.is_default=true order by l.id limit 1;
  if v_zone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name=v_zone) then v_zone := 'UTC'; end if;
  select coalesce(s.currency,'USD') into v_currency from public.business_storefronts s where s.business_id=p_business_id limit 1;

  with scoped as materialized (
    select o.id, o.order_number, o.customer_id, o.status::text as status,
      coalesce(o.order_source,'pos')::text as source, o.fulfillment_type, o.online_status,
      o.payment_method, o.total, o.amount_paid, o.change_amount, o.payment_reference,
      o.created_at, o.updated_at, o.location_id,
      coalesce(nullif(c.name,''),nullif(o.guest_name,''),'Walk-in customer') as customer_name,
      coalesce(nullif(c.phone,''),o.guest_phone) as customer_phone,
      coalesce(l.name,'Unassigned') as branch_name,
      case
        when o.status::text='refunded' or o.payment_status::text='refunded' then 'refunded'
        when o.payment_status::text='pending_verification' then 'pending_verification'
        when o.payment_status::text='paid' or greatest(coalesce(o.amount_paid,0)-coalesce(o.change_amount,0),0) >= coalesce(o.total,0) then 'paid'
        when coalesce(o.amount_paid,0)>0 then 'partial'
        else 'unpaid' end as payment_state,
      (coalesce(o.amount_paid,0)>0 or coalesce(o.payment_status::text,'') in ('paid','refunded','pending_verification')
        or nullif(o.payment_reference,'') is not null or o.payment_method::text='credit'
        or coalesce((to_jsonb(o)->>'credit_amount')::numeric,0)>0
        or coalesce(o.loyalty_points_earned,0)>0
        or exists(select 1 from public.returns r where r.order_id=o.id and r.business_id=p_business_id)) as delete_blocked
    from public.orders o
    left join public.customers c on c.id=o.customer_id and c.business_id=p_business_id
    left join public.business_locations l on l.id=o.location_id and l.business_id=p_business_id
    where o.business_id=p_business_id and o.archived_at is null
  ), filtered as materialized (
    select * from scoped o where
      (v_search='' or strpos(lower(coalesce(o.order_number,'')),lower(v_search))>0
        or strpos(lower(o.customer_name),lower(v_search))>0
        or strpos(lower(coalesce(o.customer_phone,'')),lower(v_search))>0)
      and (coalesce(p_filters->>'branch','all')='all' or o.location_id::text=p_filters->>'branch')
      and (coalesce(p_filters->>'source','all')='all' or o.source=p_filters->>'source')
      and (coalesce(p_filters->>'fulfillment','all')='all' or o.fulfillment_type::text=p_filters->>'fulfillment' or (p_filters->>'fulfillment' in ('walk_in','dine_in') and (o.fulfillment_type is null or o.fulfillment_type::text in ('dine_in','in_store'))))
      and (coalesce(p_filters->>'payment','all')='all' or o.payment_state=p_filters->>'payment')
      and (v_from is null or o.created_at >= (v_from::timestamp at time zone v_zone))
      and (v_to is null or o.created_at < ((v_to+1)::timestamp at time zone v_zone))
  ), chosen as materialized (
    select * from filtered where v_status='all' or status=v_status
  ), totals as (
    select count(*) as n, greatest(1,ceil(count(*)::numeric/v_limit)::integer) as pages from chosen
  ), paged as (
    select * from chosen
    order by case when coalesce(p_filters->>'sort','newest')='oldest' then created_at end asc,
      case when coalesce(p_filters->>'sort','newest')<>'oldest' then created_at end desc, id desc
    limit v_limit offset (least(v_page,(select pages from totals))-1)*v_limit
  ), refunds as (
    select count(*) as n, coalesce(sum(r.refund_amount),0) as amount
    from public.returns r join filtered o on o.id=r.order_id
    where r.business_id=p_business_id and coalesce(r.status::text,'refunded')='refunded'
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'id',o.id,'orderNumber',o.order_number,'customerId',o.customer_id,
      'customerName',o.customer_name,'customerPhone',o.customer_phone,
      'source',o.source,'fulfillment',case when o.fulfillment_type is null or o.fulfillment_type::text in ('dine_in','in_store') then 'walk_in' else o.fulfillment_type::text end,'status',o.status,'onlineStatus',o.online_status,
      'paymentState',o.payment_state,'paymentMethod',o.payment_method,'total',o.total,'amountPaid',o.amount_paid,
      'createdAt',o.created_at,'updatedAt',o.updated_at,'branchId',o.location_id,'branchName',o.branch_name,
      'itemCount',(select count(*) from public.order_items i where i.order_id=o.id),
      'deleteBlocked',o.delete_blocked
    ) order by case when coalesce(p_filters->>'sort','newest')='oldest' then o.created_at end asc,
      case when coalesce(p_filters->>'sort','newest')<>'oldest' then o.created_at end desc,o.id desc) from paged o),'[]'::jsonb),
    'total',(select n from totals),'page',least(v_page,(select pages from totals)),'pages',(select pages from totals),
    'counts',(select jsonb_build_object('all',count(*),'new',count(*) filter(where status='new'),
      'pending',count(*) filter(where status='pending'),'completed',count(*) filter(where status='completed'),
      'cancelled',count(*) filter(where status='cancelled'),'refunded',count(*) filter(where status='refunded')) from filtered),
    'metrics',jsonb_build_object(
      'today',(select count(*) from scoped where (created_at at time zone v_zone)::date=(now() at time zone v_zone)::date),
      'yesterday',(select count(*) from scoped where (created_at at time zone v_zone)::date=(now() at time zone v_zone)::date-1),
      'completed',(select coalesce(sum(total),0) from filtered where status='completed'),
      'pending',(select count(*) from filtered where status in ('new','pending')),
      'pendingValue',(select coalesce(sum(total),0) from filtered where status in ('new','pending')),
      'refunds',(select n from refunds),'refundedAmount',(select amount from refunds)),
    'currency',coalesce(v_currency,'USD'),'timezone',v_zone,
    'branches',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by is_default desc,name)
      from public.business_locations where business_id=p_business_id),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;
