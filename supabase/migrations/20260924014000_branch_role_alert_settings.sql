begin;
create table public.branch_role_permissions (
 like public.business_role_permissions including defaults including constraints,
 location_id uuid not null references public.business_locations(id),
 primary key(business_id,location_id,role,permission)
);
create table public.branch_notification_role_settings (
 like public.business_notification_role_settings including defaults including constraints,
 location_id uuid not null references public.business_locations(id),
 primary key(business_id,location_id,notification_type)
);
insert into public.branch_role_permissions select r.*,l.id from public.business_role_permissions r join public.business_locations l on l.business_id=r.business_id;
insert into public.branch_notification_role_settings select r.*,l.id from public.business_notification_role_settings r join public.business_locations l on l.business_id=r.business_id;
alter table public.branch_role_permissions enable row level security;
alter table public.branch_notification_role_settings enable row level security;
create policy branch_role_read on public.branch_role_permissions for select to authenticated using(public.tenh_branch_setting_visible(business_id,location_id));
create policy branch_role_write on public.branch_role_permissions for all to authenticated using(public.tenh_branch_setting_visible(business_id,location_id) and exists(select 1 from public.business_members where business_id=branch_role_permissions.business_id and user_id=auth.uid() and is_active and role='owner')) with check(public.tenh_branch_setting_visible(business_id,location_id) and exists(select 1 from public.business_members where business_id=branch_role_permissions.business_id and user_id=auth.uid() and is_active and role='owner'));
create policy branch_alert_read on public.branch_notification_role_settings for select to authenticated using(public.tenh_branch_setting_visible(business_id,location_id));
create policy branch_alert_write on public.branch_notification_role_settings for all to authenticated using(public.tenh_branch_setting_visible(business_id,location_id) and exists(select 1 from public.business_members where business_id=branch_notification_role_settings.business_id and user_id=auth.uid() and is_active and role='owner')) with check(public.tenh_branch_setting_visible(business_id,location_id) and exists(select 1 from public.business_members where business_id=branch_notification_role_settings.business_id and user_id=auth.uid() and is_active and role='owner'));
grant select,insert,update,delete on public.branch_role_permissions,public.branch_notification_role_settings to authenticated;
create trigger branch_role_guard before insert or update on public.branch_role_permissions for each row execute function public.tenh_guard_branch_setting();
create trigger branch_alert_guard before insert or update on public.branch_notification_role_settings for each row execute function public.tenh_guard_branch_setting();
do $$declare definition text;begin
 select pg_get_functiondef(oid) into definition from pg_proc where oid='public.tenh_user_permission_allowed(uuid,uuid,text)'::regprocedure;
 definition:=replace(definition,'public.business_role_permissions where business_id=p_business and role=r and permission=p_permission',
 'public.branch_role_permissions where business_id=p_business and location_id=(select default_location_id from public.business_members where id=member) and role=r and permission=p_permission');
 if definition not like '%public.branch_role_permissions%' then raise exception 'Permission function needs review before applying branch defaults.';end if;
 execute definition;
 -- Receipt/customer defaults already have a private seed scope. Extend it to role/alert defaults.
 select pg_get_functiondef('public.tenh_seed_branch_settings()'::regprocedure) into definition;
 definition:=replace(definition,'perform set_config(''tenh.seed_branch_settings'','''',true);',
 'insert into public.branch_role_permissions select r.*,new.id from public.business_role_permissions r where r.business_id=new.business_id on conflict do nothing;
 insert into public.branch_notification_role_settings select r.*,new.id from public.business_notification_role_settings r where r.business_id=new.business_id on conflict do nothing;
 perform set_config(''tenh.seed_branch_settings'','''',true);');
 execute definition;
end$$;
notify pgrst,'reload schema';
commit;
