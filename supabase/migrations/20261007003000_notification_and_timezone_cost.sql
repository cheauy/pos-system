-- 1) tenh_orders_workspace validated the branch timezone with pg_timezone_names,
--    a view that scans every zoneinfo file (~950 ms per call in production).
--    Casting is the same validity check without the scan.
create or replace function public.tenh_is_valid_timezone(p_zone text)
returns boolean language plpgsql stable set search_path = '' as $$
begin
  -- AT TIME ZONE also accepts abbreviations and POSIX offsets ('ICT', 'UTC+7')
  -- that pg_timezone_names rejected; keep only region names and UTC/GMT.
  if p_zone is null or not (p_zone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$' or p_zone in ('UTC','GMT')) then
    return false;
  end if;
  perform now() at time zone p_zone;
  return true;
exception when others then
  return false;
end $$;
revoke all on function public.tenh_is_valid_timezone(text) from public, anon;
grant execute on function public.tenh_is_valid_timezone(text) to authenticated, service_role;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.tenh_orders_workspace(uuid,jsonb)'::regprocedure) into definition;
  if position('pg_catalog.pg_timezone_names' in definition) = 0 then
    raise notice 'tenh_orders_workspace already patched';
    return;
  end if;
  definition := replace(definition,
    'not exists (select 1 from pg_catalog.pg_timezone_names where name=v_zone)',
    'not public.tenh_is_valid_timezone(v_zone)');
  if position('pg_timezone_names' in definition) > 0 then
    raise exception 'tenh_orders_workspace timezone check not found';
  end if;
  execute definition;
end $$;

-- 2) refresh_business_notifications upserts every active notification with
--    updated_at=now() on each call, so unchanged rows were rewritten (403k
--    updates for 125 rows) and each rewrite emitted a realtime event. Skip
--    updates that change nothing but updated_at.
create or replace function public.tenh_skip_unchanged_notification()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
    return null;
  end if;
  return new;
end $$;
revoke all on function public.tenh_skip_unchanged_notification() from public, anon, authenticated;

drop trigger if exists tenh_skip_unchanged_notification on public.business_notifications;
create trigger tenh_skip_unchanged_notification
  before update on public.business_notifications
  for each row execute function public.tenh_skip_unchanged_notification();
