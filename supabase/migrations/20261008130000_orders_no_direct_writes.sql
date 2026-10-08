-- Signed-in members could INSERT/UPDATE/DELETE orders and order_items directly
-- through PostgREST: the permissive policies only checked membership or
-- owner_id, so role permissions (orders.update, orders.cancel, ...) were
-- bypassed. All app writes go through SECURITY DEFINER RPCs or service_role,
-- so remove direct writes and keep reads (still branch-scoped by RLS).
begin;
drop policy if exists "Business members can create orders" on public.orders;
drop policy if exists "Business members can update orders" on public.orders;
drop policy if exists "Business members can delete orders" on public.orders;
drop policy if exists "Users can create their orders" on public.orders;
drop policy if exists "Users can update their orders" on public.orders;
drop policy if exists "Users can create their order items" on public.order_items;

revoke insert, update, delete, truncate on public.orders, public.order_items from public, anon, authenticated;

-- Only tenh_incoming_order_action (definer, permission-checked) calls this.
revoke all on function public.tenh_update_online_order_status(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.tenh_update_online_order_status(uuid,uuid,text,text) to service_role;
commit;
