begin;

-- Numeric-only order code for QR links and barcodes. Random (not sequential)
-- so a code cannot be used to guess other orders. order_number is unchanged.
alter table public.orders add column if not exists order_code text;

create or replace function public.tenh_new_order_code()
returns text language plpgsql volatile set search_path to 'public' as $function$
declare candidate text;
begin
  loop
    candidate := (100000000000 + floor(random() * 900000000000))::bigint::text;
    exit when not exists (select 1 from public.orders where order_code = candidate);
  end loop;
  return candidate;
end $function$;

create or replace function public.tenh_assign_order_code()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.order_code is null then new.order_code := public.tenh_new_order_code(); end if;
  if tg_op = 'UPDATE' and old.order_code is not null and new.order_code is distinct from old.order_code then
    raise exception 'An order code cannot be changed.';
  end if;
  return new;
end $function$;

drop trigger if exists tenh_order_code on public.orders;
create trigger tenh_order_code before insert or update of order_code on public.orders
  for each row execute function public.tenh_assign_order_code();

-- Backfill only the new column; skip other order triggers (updated_at, branch guards).
set local session_replication_role = replica;
update public.orders set order_code = public.tenh_new_order_code() where order_code is null;
set local session_replication_role = origin;

alter table public.orders alter column order_code set not null;
alter table public.orders add constraint orders_order_code_format check (order_code ~ '^[1-9][0-9]{11}$');
create unique index if not exists orders_order_code_key on public.orders(order_code);

revoke all on function public.tenh_new_order_code() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
