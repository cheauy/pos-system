begin;

-- Branch guards still protect ordinary deletes. During a business FK cascade
-- the business row has already gone, so there is no signed-in branch to check.
do $$
declare definition text;
  record_pattern text := $re$if[[:space:]]+tg_op[[:space:]]*=[[:space:]]*'DELETE'[[:space:]]+then[[:space:]]+b[[:space:]]*:=[[:space:]]*tenh_request_branch\(old\.business_id\);$re$;
  child_pattern text := $re$b[[:space:]]*:=[[:space:]]*tenh_request_branch\(\(parent_row->>'business_id'\)::uuid\);$re$;
begin
  definition := pg_get_functiondef('public.tenh_guard_operating_record()'::regprocedure);
  if position('not exists(select 1 from public.businesses where id=old.business_id)' in definition)=0 then
    if definition !~ record_pattern then
      raise exception 'Operating record guard changed; review account erasure.';
    end if;
    execute regexp_replace(definition, record_pattern,
      'if tg_op=''DELETE'' then if not exists(select 1 from public.businesses where id=old.business_id) then return old; end if; b:=tenh_request_branch(old.business_id);', 'i');
  end if;

  definition := pg_get_functiondef('public.tenh_guard_operating_child()'::regprocedure);
  if position('not exists(select 1 from public.businesses where id=(parent_row->>''business_id'')::uuid)' in definition)=0 then
    if definition !~ child_pattern then
      raise exception 'Operating child guard changed; review account erasure.';
    end if;
    execute regexp_replace(definition, child_pattern,
      'if tg_op=''DELETE'' and not exists(select 1 from public.businesses where id=(parent_row->>''business_id'')::uuid) then return old; end if; b:=tenh_request_branch((parent_row->>''business_id'')::uuid);', 'i');
  end if;

  definition := pg_get_functiondef('public.tenh_freeze_packed_recipe()'::regprocedure);
  if position('if tg_op=''DELETE'' and not exists(select 1 from public.businesses where id=old.business_id) then return old;' in definition)=0 then
    if position('begin' in definition)=0 then
      raise exception 'Packed recipe guard changed; review account erasure.';
    end if;
    execute replace(definition, 'begin',
      'begin if tg_op=''DELETE'' and not exists(select 1 from public.businesses where id=old.business_id) then return old; end if;');
  end if;
end $$;

-- These rows belong to the erased workspace, including its support history.
alter table public.tenh_team_requests drop constraint tenh_team_requests_business_id_fkey;
alter table public.tenh_team_requests add constraint tenh_team_requests_business_id_fkey
  foreign key (business_id) references public.businesses(id) on delete cascade;
alter table public.platform_support_reports drop constraint platform_support_reports_business_id_fkey;
alter table public.platform_support_reports add constraint platform_support_reports_business_id_fkey
  foreign key (business_id) references public.businesses(id) on delete cascade;
alter table public.trial_claims drop constraint trial_claims_business_id_fkey;
alter table public.trial_claims add constraint trial_claims_business_id_fkey
  foreign key (business_id) references public.businesses(id) on delete cascade;
alter table public.trial_signup_events drop constraint trial_signup_events_business_id_fkey;
alter table public.trial_signup_events add constraint trial_signup_events_business_id_fkey
  foreign key (business_id) references public.businesses(id) on delete cascade;
alter table public.branch_bundle_recipes drop constraint branch_bundle_recipes_location_id_fkey;
alter table public.branch_bundle_recipes add constraint branch_bundle_recipes_location_id_fkey
  foreign key (location_id) references public.business_locations(id) on delete cascade;
alter table public.branch_product_details drop constraint branch_product_details_location_id_fkey;
alter table public.branch_product_details add constraint branch_product_details_location_id_fkey
  foreign key (location_id) references public.business_locations(id) on delete cascade;

-- RESTRICT checks fire before sibling cascades. Use deferred NO ACTION for
-- links between business-owned rows: standalone deletes still fail at commit,
-- while a whole-business cascade can remove both sides in one transaction.
do $$
declare relation record;
begin
  for relation in
    select c.conrelid::regclass as child, c.conname,
      replace(pg_get_constraintdef(c.oid), 'ON DELETE RESTRICT', '') as definition
    from pg_constraint c
    where c.contype='f' and c.confdeltype='r'
      and c.conrelid in (
        with recursive owned(relid) as (
          select 'public.businesses'::regclass::oid
          union
          select link.conrelid from pg_constraint link join owned on link.confrelid=owned.relid
          where link.contype='f' and link.confdeltype='c'
        ) select relid from owned
      )
      and c.confrelid in (
        with recursive owned(relid) as (
          select 'public.businesses'::regclass::oid
          union
          select link.conrelid from pg_constraint link join owned on link.confrelid=owned.relid
          where link.contype='f' and link.confdeltype='c'
        ) select relid from owned
      )
  loop
    execute format('alter table %s drop constraint %I', relation.child, relation.conname);
    execute format('alter table %s add constraint %I %s deferrable initially deferred',
      relation.child, relation.conname, relation.definition);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
