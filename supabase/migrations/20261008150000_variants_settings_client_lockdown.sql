-- product_variants: four "Authenticated users can ... product variants" policies
-- used true for USING/WITH CHECK, so any signed-in user of any business could
-- read or rewrite variants of every business's products. The table has no
-- business_id; its only readers are the SECURITY DEFINER import/export RPCs,
-- which scope rows through products.business_id and require the owner.
--
-- system_settings: a legacy single-row table (no business_id) holding one
-- store's name/address/receipt settings, readable by every signed-in user.
-- Its only app readers use service_role and have no callers.
--
-- Both tables and their data are kept. RLS stays enabled with no client
-- policies, so a future accidental GRANT still exposes no rows.
begin;

drop policy if exists "Authenticated users can view product variants" on public.product_variants;
drop policy if exists "Authenticated users can insert product variants" on public.product_variants;
drop policy if exists "Authenticated users can update product variants" on public.product_variants;
drop policy if exists "Authenticated users can delete product variants" on public.product_variants;
revoke all on table public.product_variants from public, anon, authenticated;

drop policy if exists "Authenticated users can read system settings" on public.system_settings;
revoke all on table public.system_settings from public, anon, authenticated;

alter table public.product_variants enable row level security;
alter table public.system_settings enable row level security;

commit;
