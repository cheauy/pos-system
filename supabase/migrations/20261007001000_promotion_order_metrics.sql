-- Promotions & Loyalty metric cards: aggregate in the database instead of
-- downloading up to 10,000 completed orders to the app server.
-- SECURITY INVOKER keeps the caller's RLS and branch-scope headers, so the
-- result covers exactly the rows the previous client-side query could read.
-- The 10,000 most-recent-orders window matches the previous query.
create or replace function public.tenh_promotion_order_metrics(p_business_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with recent as (
    select o.customer_id, o.discount
    from public.orders o
    where o.business_id = p_business_id
      and o.status = 'completed'
    order by o.created_at desc
    limit 10000
  )
  select jsonb_build_object(
    'total_discount', coalesce((select sum(coalesce(discount, 0)) from recent), 0),
    'loyal_customers', (
      select count(*) from (
        select customer_id from recent
        where customer_id is not null
        group by customer_id
        having count(*) >= 2
      ) repeat_customers
    )
  );
$$;

revoke all on function public.tenh_promotion_order_metrics(uuid) from public,anon;
grant execute on function public.tenh_promotion_order_metrics(uuid) to authenticated;
