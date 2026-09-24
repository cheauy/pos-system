begin;

create table public.user_update_alerts (
  id uuid primary key,
  kind text not null check (kind in ('update', 'notice', 'maintenance', 'important')),
  title text not null check (length(btrim(title)) between 1 and 120),
  message text not null check (length(btrim(message)) between 1 and 1500),
  button_label text check (length(button_label) between 1 and 40),
  button_link text check (length(button_link) <= 500 and button_link ~ '^/dashboard([/?#][A-Za-z0-9_/?#=&.~-]*)?$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references auth.users(id) on delete set null,
  check ((button_label is null) = (button_link is null)),
  check (expires_at is null or expires_at > created_at)
);
-- One published slot. Expired slots are retired atomically on the next publish.
create unique index user_update_alerts_one_live on public.user_update_alerts ((true)) where ended_at is null;
create index user_update_alerts_history on public.user_update_alerts (created_at desc, id);
create table public.user_update_alert_dismissals (
  alert_id uuid not null references public.user_update_alerts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (alert_id, user_id)
);
alter table public.user_update_alerts enable row level security;
alter table public.user_update_alert_dismissals enable row level security;
revoke all on public.user_update_alerts, public.user_update_alert_dismissals from anon, authenticated;

create function public.tenh_assert_alert_admin() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin' and is_active = true) then
    raise exception 'Only an active Super Admin can manage update alerts.' using errcode = '42501';
  end if;
end;
$$;

create function public.tenh_publish_update_alert(p_id uuid, p_input jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := p_input->>'kind';
  v_title text := btrim(p_input->>'title');
  v_message text := btrim(p_input->>'message');
  v_label text := nullif(btrim(p_input->>'buttonLabel'), '');
  v_link text := nullif(btrim(p_input->>'buttonLink'), '');
  v_expiry timestamptz := nullif(p_input->>'expiresAt', '')::timestamptz;
  v_existing public.user_update_alerts;
begin
  perform public.tenh_assert_alert_admin();
  perform pg_catalog.pg_advisory_xact_lock(24092026, 50);
  select * into v_existing from public.user_update_alerts where id = p_id;
  if found then
    if v_existing.created_by = auth.uid()
      and v_existing.kind = v_kind and v_existing.title = v_title and v_existing.message = v_message
      and v_existing.button_label is not distinct from v_label and v_existing.button_link is not distinct from v_link
      and v_existing.expires_at is not distinct from v_expiry then return p_id; end if;
    raise exception 'This publish request was already used. Refresh and try again.';
  end if;
  if v_expiry <= now() then raise exception 'Choose an end time in the future.'; end if;
  update public.user_update_alerts set ended_at = now(), ended_by = auth.uid() where ended_at is null;
  insert into public.user_update_alerts (id, kind, title, message, button_label, button_link, created_by, expires_at)
    values (p_id, v_kind, v_title, v_message, v_label, v_link, auth.uid(), v_expiry);
  return p_id;
end;
$$;

create function public.tenh_end_update_alert(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.tenh_assert_alert_admin();
  perform pg_catalog.pg_advisory_xact_lock(24092026, 50);
  update public.user_update_alerts set ended_at = now(), ended_by = auth.uid() where id = p_id and ended_at is null;
end;
$$;

create function public.tenh_update_alert_history(p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.tenh_assert_alert_admin();
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc, a.id), '[]'::jsonb) into v_result
    from (select *, ended_at is null and (expires_at is null or expires_at > now()) as is_live
      from public.user_update_alerts order by created_at desc, id limit 20 offset greatest(0, least(coalesce(p_offset, 0), 100000))) a;
  return v_result;
end;
$$;

create function public.tenh_live_update_alert() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', a.id, 'kind', a.kind, 'title', a.title, 'message', a.message,
    'button_label', a.button_label, 'button_link', a.button_link, 'expires_at', a.expires_at)
  from public.user_update_alerts a
  where auth.uid() is not null and a.ended_at is null and (a.expires_at is null or a.expires_at > now())
    and not exists (select 1 from public.user_update_alert_dismissals d where d.alert_id = a.id and d.user_id = auth.uid());
$$;

create function public.tenh_dismiss_update_alert(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to dismiss this alert.' using errcode = '42501'; end if;
  insert into public.user_update_alert_dismissals (alert_id, user_id)
    select id, auth.uid() from public.user_update_alerts
    where id = p_id and ended_at is null and (expires_at is null or expires_at > now())
    on conflict do nothing;
end;
$$;

revoke all on function public.tenh_assert_alert_admin(), public.tenh_publish_update_alert(uuid,jsonb),
  public.tenh_end_update_alert(uuid), public.tenh_update_alert_history(integer),
  public.tenh_live_update_alert(), public.tenh_dismiss_update_alert(uuid) from public, anon, authenticated;
grant execute on function public.tenh_publish_update_alert(uuid,jsonb), public.tenh_end_update_alert(uuid),
  public.tenh_update_alert_history(integer), public.tenh_live_update_alert(), public.tenh_dismiss_update_alert(uuid) to authenticated;

commit;
