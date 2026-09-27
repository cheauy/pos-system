begin;
create table if not exists public.mobile_push_devices(
 device_id uuid primary key,user_id uuid not null,business_id uuid not null references public.businesses(id) on delete cascade,
 branch_id uuid not null,token text not null unique,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists mobile_push_user on public.mobile_push_devices(user_id);
create table if not exists public.mobile_push_deliveries(
 device_id uuid not null references public.mobile_push_devices(device_id) on delete cascade,
 notification_id uuid not null references public.business_notifications(id) on delete cascade,
 claimed_at timestamptz not null default now(),ticket_id text,receipt_status text,push_token text not null,
 primary key(device_id,notification_id)
);
alter table public.mobile_push_devices enable row level security;
alter table public.mobile_push_deliveries enable row level security;
revoke all on public.mobile_push_devices,public.mobile_push_deliveries from public,anon,authenticated;
grant all on public.mobile_push_devices,public.mobile_push_deliveries to service_role;
create or replace function public.tenh_mobile_push_device(p_device_id uuid,p_business_id uuid,p_branch_id uuid,p_token text,p_enabled boolean)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or p_device_id is null then raise exception 'Sign in to continue.';end if;
 if p_enabled is not true then delete from mobile_push_devices where device_id=p_device_id and user_id=auth.uid();return true;end if;
 if p_token is null or length(p_token)>300 or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' then raise exception 'Invalid notification token.';end if;
 if p_branch_id is null or public.tenh_request_branch(p_business_id) is distinct from p_branch_id then raise exception 'Choose your branch.';end if;
 perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);
 if not exists(select 1 from business_members where business_id=p_business_id and user_id=auth.uid() and is_active) then raise exception 'Business access is unavailable.';end if;
 if (select count(*) from mobile_push_devices where user_id=auth.uid() and device_id<>p_device_id)>=10 then raise exception 'Remove an old device before enabling another.';end if;
 -- A token represents one installation. Switching accounts removes its previous registration.
 delete from mobile_push_devices where token=p_token and device_id<>p_device_id;
 insert into mobile_push_devices(device_id,user_id,business_id,branch_id,token) values(p_device_id,auth.uid(),p_business_id,p_branch_id,p_token)
 on conflict(device_id) do update set user_id=excluded.user_id,business_id=excluded.business_id,branch_id=excluded.branch_id,token=excluded.token,
 created_at=case when mobile_push_devices.user_id<>excluded.user_id or mobile_push_devices.business_id<>excluded.business_id or mobile_push_devices.branch_id<>excluded.branch_id then now() else mobile_push_devices.created_at end,updated_at=now();
 return true;
end$$;
revoke all on function public.tenh_mobile_push_device(uuid,uuid,uuid,text,boolean) from public,anon;
grant execute on function public.tenh_mobile_push_device(uuid,uuid,uuid,text,boolean) to authenticated;

-- Reuse the website's recipient/branch filter for each registered user, never a parallel audience rule.
create or replace function public.tenh_mobile_claim_push()
returns table(device_id uuid,notification_id uuid,token text) language plpgsql security definer set search_path=public as $$
declare d public.mobile_push_devices%rowtype;n record;claimed uuid;counted integer:=0;refreshed uuid[]:='{}';
 old_sub text:=current_setting('request.jwt.claim.sub',true);old_claims text:=current_setting('request.jwt.claims',true);old_headers text:=current_setting('request.headers',true);
begin
 -- ponytail: pilot ceiling of 1000 active devices; paginate registration scans before growing beyond it.
 for d in select * from mobile_push_devices where updated_at>now()-interval '30 days' order by updated_at desc limit 1000 loop
  begin
   perform set_config('request.jwt.claim.sub',d.user_id::text,true);
   perform set_config('request.jwt.claims',jsonb_build_object('sub',d.user_id,'role','authenticated')::text,true);
   perform set_config('request.headers',jsonb_build_object('x-tenh-business-id',d.business_id,'x-tenh-branch-id',d.branch_id)::text,true);
   perform public.tenh_assert_plan_branch(d.business_id,d.branch_id);
   if not exists(select 1 from business_members where business_id=d.business_id and user_id=d.user_id and is_active) then continue;end if;
   if not (d.business_id=any(refreshed)) then perform public.refresh_business_notifications(d.business_id);refreshed:=array_append(refreshed,d.business_id);end if;
  exception when others then continue;
  end;
   for n in select * from public.tenh_branch_notifications(d.business_id,d.branch_id) loop
    if not coalesce(n.is_active,false) or n.occurred_at<d.created_at or n.occurred_at<now()-interval '24 hours' or exists(select 1 from business_notification_reads r where r.user_id=d.user_id and r.notification_id=n.id) then continue;end if;
    claimed:=null;
    insert into mobile_push_deliveries(device_id,notification_id,push_token) values(d.device_id,n.id,d.token) on conflict on constraint mobile_push_deliveries_pkey do nothing returning mobile_push_deliveries.notification_id into claimed;
    if claimed is not null then device_id:=d.device_id;notification_id:=n.id;token:=d.token;return next;counted:=counted+1;end if;
    exit when counted>=100;
   end loop;
  exit when counted>=100;
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(old_claims,'{}'),true);
 perform set_config('request.headers',coalesce(old_headers,'{}'),true);
end$$;
revoke all on function public.tenh_mobile_claim_push() from public,anon,authenticated;
grant execute on function public.tenh_mobile_claim_push() to service_role;
notify pgrst,'reload schema';
commit;
