begin;

-- Read-only, invoker functions: existing RLS and active-branch restrictions remain in force.
-- They replace reading every product / every 30-day order line just to count them.

-- Categories: product count per category plus the business total.
create or replace function public.tenh_category_product_totals(p_business uuid)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.tenh_current_user_permission_allowed(p_business,'categories.manage') then
  raise exception 'You do not have permission to manage categories.' using errcode='42501';
 end if;
 select jsonb_build_object(
  'total',(select count(*) from public.products p where p.business_id=p_business),
  'counts',coalesce((select jsonb_object_agg(c.category_id,c.n) from (
   select p.category_id,count(*) n from public.products p
   where p.business_id=p_business and p.category_id is not null group by p.category_id
  ) c),'{}'::jsonb)
 ) into result;
 return result;
end$$;

-- Stock view: units sold per product in the operating branch since p_since (completed orders only).
create or replace function public.tenh_branch_units_sold(p_business uuid,p_since timestamptz)
returns table(product_id uuid,quantity numeric) language plpgsql stable security invoker set search_path=public as $$
declare branch uuid;
begin
 if auth.uid() is null or not public.tenh_current_user_permission_allowed(p_business,'inventory.view') then
  raise exception 'You do not have permission to view inventory.' using errcode='42501';
 end if;
 branch:=public.tenh_request_branch(p_business);
 if branch is null then raise exception 'Choose an active branch.'; end if;
 return query
  select i.product_id,sum(greatest(0,coalesce(i.quantity,0)))::numeric
  from public.order_items i join public.orders o on o.id=i.order_id
  where o.business_id=p_business and o.location_id=branch and o.status='completed' and o.created_at>=p_since
   and i.product_id is not null
  group by i.product_id;
end$$;

revoke all on function public.tenh_category_product_totals(uuid) from public,anon;
revoke all on function public.tenh_branch_units_sold(uuid,timestamptz) from public,anon;
grant execute on function public.tenh_category_product_totals(uuid) to authenticated;
grant execute on function public.tenh_branch_units_sold(uuid,timestamptz) to authenticated;

notify pgrst, 'reload schema';
commit;
