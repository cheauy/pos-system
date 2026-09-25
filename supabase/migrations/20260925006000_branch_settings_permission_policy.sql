begin;

-- RLS runs as the signed-in role, which cannot execute the private arbitrary-user
-- permission helper. Expose only a current-user check; keep the helper private.
create or replace function public.tenh_current_user_permission_allowed(p_business uuid,p_permission text)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and public.tenh_user_permission_allowed(p_business,auth.uid(),p_permission);
$$;
revoke all on function public.tenh_current_user_permission_allowed(uuid,text) from public,anon;
grant execute on function public.tenh_current_user_permission_allowed(uuid,text) to authenticated;

do $$declare settings_table text;begin
  foreach settings_table in array array['branch_receipt_settings','branch_customer_settings','branch_pos_settings'] loop
    execute format('alter policy branch_write on public.%I
      using(public.tenh_branch_setting_visible(business_id,location_id) and public.tenh_current_user_permission_allowed(business_id,''business.update''))
      with check(public.tenh_branch_setting_visible(business_id,location_id) and public.tenh_current_user_permission_allowed(business_id,''business.update''))',settings_table);
  end loop;
end;$$;

notify pgrst,'reload schema';
commit;
