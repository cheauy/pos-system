begin;
do $$declare definition text;columns text;begin
 select pg_get_functiondef('public.refresh_business_notifications(uuid)'::regprocedure) into definition;
 definition:=replace(definition,'public.business_notification_role_settings','public.branch_notification_role_settings');
 definition:=replace(definition,'rs.business_id=o.business_id and','rs.business_id=o.business_id and rs.location_id=o.location_id and');
 definition:=replace(definition,'rs.business_id=po.business_id and','rs.business_id=po.business_id and rs.location_id=po.location_id and');
 definition:=replace(definition,'rs.business_id=s.business_id and','rs.business_id=s.business_id and rs.location_id=s.location_id and');
 definition:=replace(definition,'rs.business_id=a.business_id and','rs.business_id=a.business_id and rs.location_id=c.location_id and');
 definition:=replace(definition,'rs.business_id=st.business_id and','rs.business_id=st.business_id and rs.location_id=st.destination_location_id and');
 definition:=replace(definition,'rs.business_id=p.business_id and','rs.business_id=p.business_id and rs.location_id=p.location_id and');
 definition:=replace(definition,'from public.products p','from (select d.id,d.business_id,d.name,d.is_active,d.low_stock_quantity,s.quantity stock_quantity,d.location_id from public.branch_product_details d join public.product_location_stock s on s.product_id=d.id and s.business_id=d.business_id and s.location_id=d.location_id where not d.branch_archived) p');
 definition:=replace(definition,'''stock'',coalesce(p.stock_quantity,0)', '''branch_id'',p.location_id,''stock'',coalesce(p.stock_quantity,0)');
 definition:=replace(definition,'''low-stock:'' || p.id::text', '''low-stock:'' || p.id::text || '':'' || p.location_id::text');
 definition:=replace(definition,'''low-stock:''||p.id::text', '''low-stock:''||p.id::text||'':''||p.location_id::text');
 definition:=replace(definition,'message=excluded.message,is_active=true','message=excluded.message,target_roles=excluded.target_roles,is_active=true');
 definition:=replace(definition,'message=excluded.message,href=excluded.href,occurred_at=excluded.occurred_at,','message=excluded.message,href=excluded.href,occurred_at=excluded.occurred_at,target_roles=excluded.target_roles,');
 definition:=replace(definition,'''order_number'',o.order_number','''branch_id'',o.location_id,''order_number'',o.order_number');
 definition:=replace(definition,'''payment_reference'',o.payment_reference','''branch_id'',o.location_id,''payment_reference'',o.payment_reference');
 definition:=replace(definition,'''status'',po.status','''branch_id'',po.location_id,''status'',po.status');
 definition:=replace(definition,'''status'',st.status','''branch_id'',st.destination_location_id,''status'',st.status');
 definition:=replace(definition,'''variance'',s.variance','''branch_id'',s.location_id,''variance'',s.variance');
 definition:=replace(definition,'''balance'',a.balance','''branch_id'',c.location_id,''balance'',a.balance');
 definition:=replace(definition,'''requested_for'',o.requested_for','''branch_id'',o.location_id,''requested_for'',o.requested_for');
 execute definition;
 -- Authenticated clients cannot bypass audited stock RPCs with a raw table update.
 revoke update on public.products from public,anon,authenticated;
 select string_agg(quote_ident(column_name),',') into columns from information_schema.columns where table_schema='public' and table_name='products' and column_name<>'stock_quantity';
 execute 'grant update('||columns||') on public.products to authenticated';
end$$;
create policy branch_notification_metadata on public.business_notifications as restrictive for select to authenticated
using(metadata->>'branch_id' is null or metadata->>'branch_id'=public.tenh_request_branch(business_id)::text);
notify pgrst,'reload schema';
commit;
