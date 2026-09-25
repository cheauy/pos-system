begin;
set local lock_timeout='5s';

-- Version 7 uses tenh_apply_subscription_order, just like versions 5 and 6.
-- Approval must not apply capacity ahead of a scheduled renewal/downgrade.
-- Legacy versions retain their existing approval-time validation.
create or replace function public.tenh_apply_approved_branch_plan()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_limit integer;
begin
  if new.status<>'approved' or old.status='approved' then return new; end if;
  if new.pricing_version in (5,6,7) then return new; end if;
  perform 1 from public.businesses where id=new.business_id for update;
  v_limit:=case when new.plan_key='custom' then new.requested_branch_limit else 1 end;
  if (select count(*) from public.business_locations where business_id=new.business_id and is_active)>v_limit then raise exception 'The payment plan has fewer branches than are active.'; end if;
  if (select count(*) from public.business_members where business_id=new.business_id and is_active)>new.requested_user_limit then raise exception 'The payment plan has fewer seats than are active.'; end if;
  update public.businesses
  set subscription_branch_limit=v_limit,
      subscription_base_plan_key=case when new.pricing_version=3 then null else coalesce(new.base_plan_key,case when new.plan_key='custom' then 'growth' else new.plan_key end) end
  where id=new.business_id;
  return new;
end;
$function$;
-- Rollback: restore only the prior (5,6) condition in this function; no rows
-- are transformed, deleted, or rewritten by this migration.
commit;
