begin;
-- Only the authenticated Super Admin server action may delete an offer.
-- Existing order discount snapshots have no foreign key to offers and are preserved.
grant delete on public.subscription_promotions to service_role;
commit;
