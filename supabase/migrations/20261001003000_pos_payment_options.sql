-- Preserve existing availability until the owner changes the branch settings.
alter table public.branch_pos_settings
  add column if not exists split_payment_enabled boolean not null default true,
  add column if not exists customer_credit_enabled boolean not null default true;
notify pgrst, 'reload schema';
