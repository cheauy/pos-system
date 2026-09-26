-- Additive branch settings; old writers and branch-copy inserts keep defaults.
-- Rollback: restore the previous application and retain these unused columns.
begin;
alter table public.branch_receipt_settings
  add column if not exists receipt_wifi_password text not null default '',
  add column if not exists show_receipt_wifi boolean not null default false;
notify pgrst, 'reload schema';
commit;
