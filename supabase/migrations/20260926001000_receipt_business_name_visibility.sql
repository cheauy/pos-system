-- Add at the end: existing branch-copy inserts retain their column order and
-- receive the default for this new field. Older clients can omit the field.
-- Rollback: roll back the UI/code and retain this harmless additive column.
begin;
alter table public.branch_receipt_settings
  add column if not exists show_business_name boolean not null default true;
notify pgrst, 'reload schema';
commit;
