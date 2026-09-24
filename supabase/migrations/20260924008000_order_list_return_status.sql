begin;

-- Derive completed returns from their recorded line quantities. This also fixes
-- historical orders without rewriting sales totals or recording another refund.
do $migration$
declare definition text; patched text;
begin
 select replace(pg_get_functiondef('public.tenh_orders_workspace(uuid,jsonb)'::regprocedure),chr(13),'') into definition;
 if position('with scoped as materialized (' in definition)=0
    or position('o.status::text as status' in definition)=0
    or position('when o.status::text=''refunded'' or' in definition)=0 then
   raise exception 'Order list changed; review the return status migration.';
 end if;
 patched:=replace(definition,'with scoped as materialized (',$replacement$with returned_items as materialized (
    select ri.order_item_id, sum(ri.quantity) as quantity
    from public.return_items ri
    join public.returns r on r.id=ri.return_id
    join public.order_items oi on oi.id=ri.order_item_id and oi.order_id=r.order_id
    where r.business_id=p_business_id and coalesce(r.status::text,'refunded')='refunded'
    group by ri.order_item_id
  ), fully_returned as materialized (
    select oi.order_id
    from public.order_items oi
    join public.orders sale on sale.id=oi.order_id and sale.business_id=p_business_id
    left join returned_items ri on ri.order_item_id=oi.id
    group by oi.order_id
    having sum(oi.quantity)>0 and bool_and(coalesce(ri.quantity,0)>=oi.quantity)
  ), scoped as materialized ($replacement$);
 patched:=replace(patched,'o.status::text as status','case when returned.order_id is not null then ''refunded'' else o.status::text end as status');
 patched:=replace(patched,'when o.status::text=''refunded'' or','when returned.order_id is not null or o.status::text=''refunded'' or');
 patched:=replace(patched,'left join public.customers c on','left join fully_returned returned on returned.order_id=o.id
    left join public.customers c on');
 if position('left join fully_returned returned' in patched)=0 then raise exception 'Order return join could not be applied.'; end if;
 execute patched;
end $migration$;

commit;
