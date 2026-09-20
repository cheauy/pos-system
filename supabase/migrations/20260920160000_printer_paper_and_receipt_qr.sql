-- Apply after the existing business_receipt_settings / receipt-logo migration.
begin;
alter table public.business_receipt_settings
  add column if not exists receipt_qr_url text,
  add column if not exists show_receipt_qr boolean not null default true;

-- Replace existing size/template checks, whose names vary between installations.
do $$
declare constraint_row record;
begin
  for constraint_row in
    select distinct c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
    where c.conrelid='public.business_receipt_settings'::regclass
      and c.contype='c'
      and a.attname in ('paper_size','receipt_template','barcode_label_size','shipping_label_size')
  loop
    execute format('alter table public.business_receipt_settings drop constraint %I', constraint_row.conname);
  end loop;
end $$;

update public.business_receipt_settings set receipt_template='classic';
update public.business_receipt_settings set paper_size='80mm' where paper_size is null or paper_size not in ('58mm','76mm','80mm');
update public.business_receipt_settings set barcode_label_size='50x30' where barcode_label_size is null or barcode_label_size not in ('40x20','40x30','50x30','60x40','80x50');
update public.business_receipt_settings set shipping_label_size='100x150' where shipping_label_size is null or shipping_label_size not in ('80x50','100x100','100x150');

alter table public.business_receipt_settings
  alter column paper_size set default '80mm',
  alter column receipt_template set default 'classic',
  alter column barcode_label_size set default '50x30',
  alter column shipping_label_size set default '100x150',
  add constraint printer_receipt_paper_check check (paper_size in ('58mm','76mm','80mm')),
  add constraint printer_receipt_template_check check (receipt_template='classic'),
  add constraint printer_barcode_size_check check (barcode_label_size in ('40x20','40x30','50x30','60x40','80x50')),
  add constraint printer_shipping_size_check check (shipping_label_size in ('80x50','100x100','100x150'));
notify pgrst,'reload schema';
commit;
