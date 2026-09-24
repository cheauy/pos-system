begin;
CREATE OR REPLACE FUNCTION public.tenh_export_business(p_business_id uuid, p_tables text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t text; condition text; rows jsonb; output jsonb:='{}';
 allowed text[]:=array['businesses','business_locations','business_storefronts','business_receipt_settings','business_customer_settings','business_delivery_zones','business_tables','products','product_variants','categories','product_location_stock','product_option_groups','product_options','bundle_items','inventory_movements','stock_adjustments','stock_transfers','stock_transfer_items','orders','order_items','returns','return_items','tenh_pos_holds','tenh_pos_points_used','customers','customer_credit_accounts','customer_credit_ledger','customer_loyalty_transactions','business_coupons','coupon_redemptions','suppliers','purchases','purchase_items','purchase_orders','purchase_order_items','expenses','cash_register_shifts','cash_movements','business_members','profiles','business_member_permissions','business_role_permissions','business_notifications','business_notification_reads','business_notification_preferences','business_notification_role_settings','audit_logs','business_activity_history','data_transfer_jobs','business_slug_release_history','subscription_history','subscription_orders','business_change_orders','branch_product_details','branch_receipt_settings','branch_customer_settings','branch_pos_settings','branch_bundle_recipes','branch_role_permissions','branch_notification_role_settings'];
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
alter function public.tenh_export_business(uuid,text[]) rename to tenh_export_business_all_branches;
revoke all on function public.tenh_export_business_all_branches(uuid,text[]) from public,anon,authenticated;

create function public.tenh_export_business(p_business_id uuid,p_tables text[],p_all_branches boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t text; relation text; condition text; rows jsonb; output jsonb:='{}'; branch uuid;
begin
 perform public.tenh_assert_effective_permission(p_business_id,'exports.manage');
 -- The private implementation validates owner access and the complete allowlist.
 if p_all_branches then return public.tenh_export_business_all_branches(p_business_id,p_tables);end if;
 perform public.tenh_export_business_all_branches(p_business_id,array['businesses']);
 branch:=public.tenh_request_branch(p_business_id);
 if branch is null then raise exception 'Choose an operating branch.';end if;
 foreach t in array p_tables loop
  if not t=any(array['businesses','business_locations','business_storefronts','business_receipt_settings','business_customer_settings','business_delivery_zones','business_tables','products','product_variants','categories','product_location_stock','product_option_groups','product_options','bundle_items','inventory_movements','stock_adjustments','stock_transfers','stock_transfer_items','orders','order_items','returns','return_items','tenh_pos_holds','tenh_pos_points_used','customers','customer_credit_accounts','customer_credit_ledger','customer_loyalty_transactions','business_coupons','coupon_redemptions','suppliers','purchases','purchase_items','purchase_orders','purchase_order_items','expenses','cash_register_shifts','cash_movements','business_members','profiles','business_member_permissions','business_role_permissions','business_notifications','business_notification_reads','business_notification_preferences','business_notification_role_settings','audit_logs','business_activity_history','data_transfer_jobs','business_slug_release_history','subscription_history','subscription_orders','business_change_orders','branch_product_details','branch_receipt_settings','branch_customer_settings','branch_pos_settings','branch_bundle_recipes','branch_role_permissions','branch_notification_role_settings']) then raise exception 'Select valid data to export.';end if;
  relation:=case t when 'products' then 'branch_products' when 'bundle_items' then 'branch_bundle_items' when 'business_receipt_settings' then 'branch_receipt_settings' when 'business_customer_settings' then 'branch_customer_settings' else t end;
  condition:=case
   when t='businesses' then 'r.id=$1'
   when t='business_locations' then 'r.business_id=$1 and r.id=$2'
   when t='categories' then 'r.business_id=$1 and (r.branch_ids is null or $2=any(r.branch_ids))'
   when t='stock_transfers' then 'r.business_id=$1 and (r.source_location_id=$2 or r.destination_location_id=$2)'
   when t='stock_transfer_items' then 'r.business_id=$1 and r.transfer_id in (select id from public.stock_transfers where business_id=$1 and (source_location_id=$2 or destination_location_id=$2))'
   when t in ('order_items','tenh_pos_points_used','coupon_redemptions') then 'r.order_id in (select id from public.orders where business_id=$1 and location_id=$2)'
   when t='return_items' then 'r.return_id in (select id from public.returns where business_id=$1 and location_id=$2)'
   when t='purchase_items' then 'r.purchase_id in (select id from public.purchases where business_id=$1 and location_id=$2)'
   when t='purchase_order_items' then 'r.purchase_order_id in (select id from public.purchase_orders where business_id=$1 and location_id=$2)'
   when t in ('customer_credit_accounts','customer_credit_ledger','customer_loyalty_transactions') then 'r.business_id=$1 and r.customer_id in (select id from public.customers where business_id=$1 and location_id=$2)'
   when t in ('product_variants','product_options','product_option_groups') then 'r.product_id in (select id from public.branch_products where business_id=$1)'
   when t='inventory_movements' then 'r.business_id=$1 and (r.order_id in (select id from public.orders where business_id=$1 and location_id=$2) or r.return_id in (select id from public.returns where business_id=$1 and location_id=$2))'
   when t='business_members' then 'r.business_id=$1 and r.default_location_id=$2'
   when t='profiles' then 'r.id in (select user_id from public.business_members where business_id=$1 and default_location_id=$2)'
   when t='business_member_permissions' then 'r.member_id in (select id from public.business_members where business_id=$1 and default_location_id=$2)'
   when t in ('audit_logs','business_activity_history','business_notifications') then 'r.business_id=$1 and coalesce(to_jsonb(r)->>''location_id'',r.metadata->>''branch_id'',r.metadata->>''branchId'')=$2::text'
   when t='business_notification_reads' then 'r.notification_id in (select id from public.business_notifications where business_id=$1 and coalesce(metadata->>''branch_id'',metadata->>''branchId'')=$2::text)'
   when exists(select 1 from information_schema.columns where table_schema='public' and table_name=relation and column_name='location_id') then 'r.business_id=$1 and r.location_id=$2'
   else 'r.business_id=$1' end;
  execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from public.%I r where %s',relation,condition) into rows using p_business_id,branch;
  output:=output||jsonb_build_object(t,rows);
 end loop;
 return public.tenh_export_redact(output);
end$$;
revoke all on function public.tenh_export_business(uuid,text[],boolean) from public,anon;
grant execute on function public.tenh_export_business(uuid,text[],boolean) to authenticated;
notify pgrst,'reload schema';
commit;

