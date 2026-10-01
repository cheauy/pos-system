begin;

-- Read-only, invoker functions: existing RLS and active-branch restrictions remain in force.
create or replace function public.tenh_purchase_orders_page(
 p_business uuid, p_page integer default 1, p_query text default '', p_status text default 'all',
 p_supplier uuid default null, p_from date default null, p_to date default null, p_sort text default 'newest'
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare branch uuid; result jsonb;
begin
 if auth.uid() is null or not public.tenh_current_user_permission_allowed(p_business,'purchases.view') then
  raise exception 'You do not have permission to view purchase orders.' using errcode='42501';
 end if;
 branch:=public.tenh_request_branch(p_business);
 if branch is null then raise exception 'Choose an active branch.'; end if;
 with scoped as materialized (
  select o.id,o.supplier_id,o.supplier_name,o.po_number,o.reference_number,o.status,o.order_date,o.expected_date,o.notes,o.subtotal,o.total,o.created_by,o.created_at from public.purchase_orders o where o.business_id=p_business and o.location_id=branch
 ), filtered as materialized (
  select o.* from scoped o where (p_status='all' or o.status=p_status)
   and (p_supplier is null or o.supplier_id=p_supplier)
   and (p_from is null or o.order_date>=p_from) and (p_to is null or o.order_date<=p_to)
   and (coalesce(p_query,'')='' or strpos(lower(concat_ws(' ',o.po_number,o.supplier_name,o.reference_number)),lower(left(p_query,200)))>0)
 ), bounds as (
  select count(*) as total, least(greatest(coalesce(p_page,1),1),greatest(1,ceil(count(*)/15.0)::integer)) as page from filtered
 ), paged as materialized (
  select o.* from filtered o order by
   case when p_sort='highest' then o.total end desc,
   case when p_sort='lowest' then o.total end asc,
   case when p_sort='oldest' then o.created_at end asc,
   case when p_sort not in ('oldest','highest','lowest') then o.created_at end desc,o.id
  limit 15 offset (select (page-1)*15 from bounds)
 )
 select jsonb_build_object(
  'total',(select total from bounds),'page',(select page from bounds),
  'orders',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object(
   'created_by_name',coalesce((select nullif(trim(full_name),'') from public.profiles where id=o.created_by),'Team member'),
   'items',coalesce(items.rows,'[]'::jsonb),'item_count',coalesce(items.n,0),
   'ordered_quantity',coalesce(items.ordered,0),'received_quantity',coalesce(items.received,0)
  )) from paged o left join lateral (
   select jsonb_agg(jsonb_build_object('id',i.id,'purchase_order_id',i.purchase_order_id,'product_name',i.product_name,
    'sku',i.sku,'ordered_quantity',i.ordered_quantity,'received_quantity',i.received_quantity,'unit_cost',i.unit_cost) order by i.created_at,i.id) rows,
    count(*) n,sum(i.ordered_quantity) ordered,sum(i.received_quantity) received
   from public.purchase_order_items i where i.business_id=p_business and i.purchase_order_id=o.id
  ) items on true),'[]'::jsonb),
  'suppliers',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) ||
   case when s.id in (select supplier_id from paged) then jsonb_build_object('contact_person',s.contact_person,'phone',s.phone,'email',s.email,'address',s.address,'notes',s.notes,'is_active',s.is_active) else '{}'::jsonb end order by s.name,s.id)
   from public.suppliers s where s.business_id=p_business and s.location_id=branch),'[]'::jsonb),
  'stats',(select jsonb_build_object('total',count(*),'draft',count(*) filter(where status='draft'),
   'sent',count(*) filter(where status='sent'),'partial',count(*) filter(where status='partial'),
   'completed',count(*) filter(where status='received'),'outstanding',coalesce(sum(total) filter(where status in ('draft','sent','partial')),0)) from scoped)
 ) into result;
 return result;
end$$;

create or replace function public.tenh_suppliers_page(p_business uuid,p_page integer default 1,p_query text default '',p_status text default 'all')
returns jsonb language plpgsql security invoker set search_path=public as $$
declare branch uuid; result jsonb;
begin
 if auth.uid() is null or not public.tenh_current_user_permission_allowed(p_business,'suppliers.manage') then
  raise exception 'You do not have permission to manage suppliers.' using errcode='42501';
 end if;
 branch:=public.tenh_request_branch(p_business);
 if branch is null then raise exception 'Choose an active branch.'; end if;
 with scoped as materialized (
  select s.* from public.suppliers s where s.business_id=p_business and s.location_id=branch
 ), filtered as materialized (
  select s.* from scoped s where (p_status='all' or (p_status='active' and s.is_active) or (p_status='inactive' and not s.is_active))
   and (coalesce(p_query,'')='' or strpos(lower(concat_ws(' ',s.name,s.contact_person,s.phone,s.email,s.address)),lower(left(p_query,200)))>0)
 ), bounds as (
  select count(*) total,least(greatest(coalesce(p_page,1),1),greatest(1,ceil(count(*)/15.0)::integer)) page from filtered
 ), paged as materialized (
  select * from filtered order by created_at desc,id limit 15 offset (select (page-1)*15 from bounds)
 ), orders as materialized (
  select o.supplier_id,o.status,o.total,o.order_date from public.purchase_orders o where o.business_id=p_business and o.location_id=branch
 )
 select jsonb_build_object('total',(select total from bounds),'page',(select page from bounds),
  'suppliers',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'contact_person',s.contact_person,
   'phone',s.phone,'email',s.email,'address',s.address,'notes',s.notes,'is_active',s.is_active,'created_at',s.created_at)) from paged s),'[]'::jsonb),
  'metrics',coalesce((select jsonb_object_agg(s.id,(select jsonb_build_object('orderCount',count(*),
   'receivedTotal',coalesce(sum(o.total) filter(where o.status='received'),0),
   'openValue',coalesce(sum(o.total) filter(where o.status in ('draft','sent','partial')),0),'lastOrderDate',max(o.order_date))
   from orders o where o.supplier_id=s.id)) from paged s),'{}'::jsonb),
  'stats',jsonb_build_object('total',(select count(*) from scoped),'active',(select count(*) from scoped where is_active),
   'thisMonthOrders',(select count(*) from orders where date_trunc('month',order_date)=date_trunc('month',now() at time zone 'Asia/Phnom_Penh')),
   'openPoValue',(select coalesce(sum(total),0) from orders where status in ('draft','sent','partial')))
 ) into result;
 return result;
end$$;

create or replace function public.tenh_category_product_counts(p_business uuid,p_branch uuid,p_categories uuid[])
returns table(category_id uuid,product_count bigint) language plpgsql security invoker set search_path=public as $$
begin
 if auth.uid() is null or not public.tenh_current_user_permission_allowed(p_business,'categories.manage') then
  raise exception 'You do not have permission to view categories.' using errcode='42501';
 end if;
 if p_branch is null or public.tenh_request_branch(p_business) is distinct from p_branch then raise exception 'Your operating branch changed.' using errcode='42501'; end if;
 if coalesce(cardinality(p_categories),0)>10 then raise exception 'Choose at most 10 categories.'; end if;
 return query select p.category_id,count(distinct coalesce('variant:'||p.variant_group_id::text,p.id::text))
 from public.branch_products p join public.categories c on c.id=p.category_id and c.business_id=p_business
 -- branch_products already uses tenh_branch_setting_visible; it exposes no location_id.
 where p.business_id=p_business and p.category_id=any(p_categories)
  and (c.branch_ids is null or p_branch=any(c.branch_ids)) group by p.category_id;
end$$;

revoke all on function public.tenh_purchase_orders_page(uuid,integer,text,text,uuid,date,date,text),public.tenh_suppliers_page(uuid,integer,text,text),public.tenh_category_product_counts(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.tenh_purchase_orders_page(uuid,integer,text,text,uuid,date,date,text),public.tenh_suppliers_page(uuid,integer,text,text),public.tenh_category_product_counts(uuid,uuid,uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
