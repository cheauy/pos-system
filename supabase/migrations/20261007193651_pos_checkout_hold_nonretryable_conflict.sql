-- Only the captured business-version guard changes. Genuine serialization failures remain 40001.
-- CREATE OR REPLACE preserves owner, grants, SECURITY DEFINER and search_path.
begin;
do $patch$
declare
  source text := pg_get_functiondef('public.tenh_pos_checkout_before_currency(uuid,jsonb)'::regprocedure);
  old_raise constant text := $s$raise exception 'The held order changed. Refresh and resume it again.' using errcode='40001';$s$;
  new_raise constant text := $s$raise exception 'The held order changed. Refresh and resume it again.' using errcode='PT409';$s$;
  old_count integer := (length(source)-length(replace(source,old_raise,'')))/length(old_raise);
begin
  if old_count=0 and position(new_raise in source)>0 then return; end if;
  if old_count<>1 then raise exception 'tenh_pos_checkout_before_currency stale guard changed; review this migration before applying.'; end if;
  execute replace(source,old_raise,new_raise);
end $patch$;
commit;
