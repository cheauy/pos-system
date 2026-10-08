-- Local record of production migration 20261007174209 fix_order_conflict_nonretryable_sqlstate
-- (already applied there; same version, so it is never re-run in production).
-- SQLSTATE 40001 (serialization_failure) is treated as retryable by PostgREST/clients, but a
-- stale order version is a definite conflict: it now raises PT409 (HTTP 409) so the caller
-- shows refresh guidance instead of retrying. Only the stale-order raise changes; owner,
-- grants, SECURITY DEFINER and search_path are kept by CREATE OR REPLACE of the same body.
-- No-op when the function already raises PT409.
begin;

do $patch$
declare
  source text := pg_get_functiondef('public.tenh_manage_order(uuid,uuid,timestamptz,text,jsonb)'::regprocedure);
  old_raise constant text := $s$raise exception 'This order changed since you opened it. Refresh and try again.' using errcode='40001';$s$;
  new_raise constant text := $s$raise exception 'This order changed since you opened it. Refresh and try again.' using errcode='PT409';$s$;
  old_count integer := (length(source) - length(replace(source, old_raise, ''))) / length(old_raise);
begin
  if old_count = 0 and position(new_raise in source) > 0 then return; end if;
  if old_count <> 1 then
    raise exception 'tenh_manage_order stale-order conflict changed; review this migration before applying.';
  end if;
  execute replace(source, old_raise, new_raise);
end $patch$;

commit;
