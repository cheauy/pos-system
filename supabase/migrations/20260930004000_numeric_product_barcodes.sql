begin;

-- Labels print number-only barcodes. Products keep any numeric barcode they have
-- (e.g. a manufacturer EAN); empty or text barcodes (the app copies the SKU) get a
-- unique in-store EAN-13 ("2" prefix = restricted/in-store range). POS still
-- matches the SKU, so labels printed with the old SKU text keep scanning.
create or replace function public.tenh_new_product_barcode()
returns text language plpgsql volatile set search_path to 'public' as $function$
declare body text; total int; i int; candidate text;
begin
  loop
    body := '2' || lpad(floor(random() * 100000000000)::bigint::text, 11, '0');
    total := 0;
    for i in 1..12 loop
      total := total + substr(body, i, 1)::int * case when i % 2 = 0 then 3 else 1 end;
    end loop;
    candidate := body || ((10 - total % 10) % 10)::text;
    exit when not exists (select 1 from public.products where barcode = candidate);
  end loop;
  return candidate;
end $function$;

create or replace function public.tenh_numeric_product_barcode()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.barcode is null or btrim(new.barcode) !~ '^[0-9]{6,20}$' then
    new.barcode := public.tenh_new_product_barcode();
  else
    new.barcode := btrim(new.barcode);
  end if;
  return new;
end $function$;

drop trigger if exists tenh_numeric_barcode on public.products;
create trigger tenh_numeric_barcode before insert or update of barcode on public.products
  for each row execute function public.tenh_numeric_product_barcode();

-- Backfill only the barcode column; skip other product triggers (updated_at, stock sync).
set local session_replication_role = replica;
update public.products set barcode = public.tenh_new_product_barcode()
  where barcode is null or btrim(barcode) !~ '^[0-9]{6,20}$';
set local session_replication_role = origin;

revoke all on function public.tenh_new_product_barcode() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
