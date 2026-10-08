-- tenh_cancel_order_item: the stale order-version guard (orders.updated_at checked after
-- SELECT ... FOR UPDATE) is a business conflict, not a serialization failure. SQLSTATE 40001
-- is retryable to PostgREST/clients; PT409 (HTTP 409) is definite, so the caller shows
-- refresh guidance instead of retrying. Only that one raise changes: permission, branch,
-- payment/pricing, stock and audit logic, owner, grants, SECURITY DEFINER and search_path are
-- kept by CREATE OR REPLACE of the same body. No-op when the function already raises PT409.
begin;

do $patch$
declare
  source text := pg_get_functiondef('public.tenh_cancel_order_item(uuid,uuid,uuid,timestamptz,text)'::regprocedure);
  old_raise constant text := $s$raise exception 'This order changed. Refresh before cancelling an item.' using errcode='40001';$s$;
  new_raise constant text := $s$raise exception 'This order changed. Refresh before cancelling an item.' using errcode='PT409';$s$;
  old_count integer := (length(source) - length(replace(source, old_raise, ''))) / length(old_raise);
begin
  if old_count = 0 and position(new_raise in source) > 0 then return; end if;
  if old_count <> 1 then
    raise exception 'tenh_cancel_order_item stale-order conflict changed; review this migration before applying.';
  end if;
  execute replace(source, old_raise, new_raise);
end $patch$;

commit;
