-- REVIEW REQUIRED: additive named-template persistence only. Do not execute without approval.
begin;

create or replace function public.tenh_shipping_templates_valid(p_templates jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare t jsonb;e jsonb;r jsonb;k text;n text;ids text[]:='{}';names text[]:='{}';element_ids text[];joined text;paper_width numeric;paper_height numeric;
begin
 if jsonb_typeof(p_templates) is distinct from 'array' or jsonb_array_length(p_templates)>20 or octet_length(p_templates::text)>65536 then raise exception 'Save up to 20 templates within 64 KiB.';end if;
 for t in select value from jsonb_array_elements(p_templates) loop
  if jsonb_typeof(t) is distinct from 'object' or jsonb_typeof(t->'id') is distinct from 'string' or (t->>'id')!~'^[a-zA-Z0-9_-]{1,80}$' or (t->>'id')=any(ids) then raise exception 'Invalid template identity.';end if;
  ids:=array_append(ids,t->>'id');
  if jsonb_typeof(t->'name') is distinct from 'string' then raise exception 'Enter a template name.';end if;
  n:=t->>'name';k:=lower(normalize(n,NFKC));
  if length(n)<1 or length(n)>60 or n<>regexp_replace(btrim(n),'\s+',' ','g') or n~'[[:cntrl:]]' or k=any(names) then raise exception 'Use a unique template name from 1 to 60 characters.';end if;
  names:=array_append(names,k);
  if jsonb_typeof(t->'revision') is distinct from 'number' or (t->>'revision')!~'^[0-9]+$' or (t->>'revision')::numeric>9007199254740991 then raise exception 'Invalid template revision.';end if;
  if t?'needsReview' and jsonb_typeof(t->'needsReview') is distinct from 'boolean' then raise exception 'Invalid template review state.';end if;
  if jsonb_typeof(t->'layout') is distinct from 'object' or t->'layout'->'version' is distinct from '1'::jsonb or jsonb_typeof(t->'layout'->'size') is distinct from 'string' or t->'layout'->>'size' not in ('80x50','100x100','100x150') or jsonb_typeof(t->'layout'->'enabled') is distinct from 'boolean' or jsonb_typeof(t->'layout'->'elements') is distinct from 'array' then raise exception 'Invalid template layout.';end if;
  paper_width:=split_part(t->'layout'->>'size','x',1)::numeric;paper_height:=split_part(t->'layout'->>'size','x',2)::numeric;
  if jsonb_array_length(t->'layout'->'elements')>40 then raise exception 'A design supports up to 40 elements.';end if;
  element_ids:='{}';
  for e in select value from jsonb_array_elements(t->'layout'->'elements') loop
   if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'id') is distinct from 'string' or length(e->>'id')>80 or (e->>'id')=any(element_ids) or e->>'field' is null or e->>'field' not in ('storeName','storePhone','storeAddress','customerName','customerPhone','customerAddress','orderNumber','barcode','qr','total','payment','itemCount','text','line') then raise exception 'Invalid shipping element.';end if;
   element_ids:=array_append(element_ids,e->>'id');
   foreach k in array array['x','y','width','height','fontSize'] loop
    if jsonb_typeof(e->k) is distinct from 'number' then raise exception 'Invalid element geometry.';end if;
   end loop;
   if (e->>'x')::numeric<0 or (e->>'y')::numeric<0 or (e->>'width')::numeric<2 or (e->>'height')::numeric<1 or (e->>'x')::numeric+(e->>'width')::numeric>100.01 or (e->>'y')::numeric+(e->>'height')::numeric>100.01 or (e->>'fontSize')::numeric not between 6 and 36 or jsonb_typeof(e->'bold') is distinct from 'boolean' or e->>'align' is null or e->>'align' not in ('left','center','right') or jsonb_typeof(e->'text') is distinct from 'string' or (select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0) from regexp_split_to_table(e->>'text','') ch)>300 then raise exception 'Keep elements inside the label and text under 300 characters.';end if;
   -- Runtime order-link density is checked by the authorized app and print guard;
   -- SQL also requires a physical square and the smallest possible QR quiet-zone footprint.
   if e->>'field'='qr' and (least((e->>'width')::numeric*paper_width,(e->>'height')::numeric*paper_height)/100<14.6 or abs((e->>'width')::numeric*paper_width-(e->>'height')::numeric*paper_height)/100>0.01) then raise exception 'Order QR must be square with its clear margin.';end if;
   foreach k in array array['italic','underline'] loop
    if e?k and jsonb_typeof(e->k) is distinct from 'boolean' then raise exception 'Invalid text formatting.';end if;
   end loop;
   if e?'richText' then
    if e->>'field'<>'text' or jsonb_typeof(e->'richText') is distinct from 'array' or jsonb_array_length(e->'richText')>300 then raise exception 'Order fields are protected placeholders.';end if;
    joined:='';
    for r in select value from jsonb_array_elements(e->'richText') loop
     if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'text') is distinct from 'string' or exists(select 1 from jsonb_object_keys(r) key where key not in ('text','bold','italic','underline','fontSize')) then raise exception 'Invalid rich text.';end if;
     foreach k in array array['bold','italic','underline'] loop
      if r?k and jsonb_typeof(r->k) is distinct from 'boolean' then raise exception 'Invalid rich text marks.';end if;
     end loop;
     if r?'fontSize' then
      if jsonb_typeof(r->'fontSize') is distinct from 'number' then raise exception 'Invalid font size.';end if;
      if (r->>'fontSize')::numeric not between 6 and 36 then raise exception 'Use font sizes from 6 to 36 px.';end if;
     end if;
     joined:=joined||(r->>'text');
    end loop;
    if joined<>e->>'text' then raise exception 'Custom text and formatting do not match.';end if;
   end if;
  end loop;
 end loop;
 return true;
end$$;

create table if not exists public.branch_shipping_templates (
 business_id uuid not null references public.businesses(id) on delete cascade,
 location_id uuid not null references public.business_locations(id) on delete cascade,
 templates jsonb not null default '[]'::jsonb check(public.tenh_shipping_templates_valid(templates)),
 updated_at timestamptz not null default now(),
 primary key(business_id,location_id)
);
alter table public.branch_shipping_templates enable row level security;
drop policy if exists shipping_templates_read on public.branch_shipping_templates;
create policy shipping_templates_read on public.branch_shipping_templates for select to authenticated using(public.tenh_branch_setting_visible(business_id,location_id));
drop trigger if exists shipping_templates_guard on public.branch_shipping_templates;
create trigger shipping_templates_guard before insert or update on public.branch_shipping_templates for each row execute function public.tenh_guard_branch_setting();
-- Direct catalogue replacement is forbidden to app callers. Authorized server order reads use SELECT only.
revoke all on public.branch_shipping_templates from public,anon,authenticated,service_role;
grant select on public.branch_shipping_templates to authenticated,service_role;

create or replace function public.tenh_save_shipping_template(p_business_id uuid,p_location_id uuid,p_mode text,p_entry jsonb,p_expected_revision bigint,p_legacy jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_templates jsonb;seed jsonb;entry jsonb;existing jsonb;next_templates jsonb;
begin
 if auth.uid() is null then raise exception 'Please sign in again.';end if;
 perform public.tenh_assert_effective_permission(p_business_id,'business.update');
 if not coalesce(public.tenh_branch_setting_visible(p_business_id,p_location_id),false) then raise exception 'Settings belong to another branch.';end if;
 perform public.tenh_assert_plan_branch(p_business_id,p_location_id);
 if p_mode not in ('create','update') or p_mode is null or p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=9007199254740991 or (p_mode='create' and p_expected_revision<>0) then raise exception 'Choose a valid template save operation.';end if;
 if jsonb_typeof(p_entry) is distinct from 'object' then raise exception 'Invalid custom template.';end if;
 entry:=jsonb_build_object('id',p_entry->'id','name',p_entry->'name','layout',p_entry->'layout','revision',p_expected_revision+1);
 perform public.tenh_shipping_templates_valid(jsonb_build_array(entry));
 if jsonb_typeof(p_legacy) is distinct from 'array' or octet_length(p_legacy::text)>65536 or jsonb_array_length(p_legacy)>20 then raise exception 'Invalid legacy template collection.';end if;
 select coalesce(jsonb_agg(value||jsonb_build_object('revision',0)),'[]'::jsonb) into seed from jsonb_array_elements(p_legacy);
 perform public.tenh_shipping_templates_valid(seed);
 -- A concurrent importer never replaces the first committed catalogue.
 insert into public.branch_shipping_templates(business_id,location_id,templates) values(p_business_id,p_location_id,seed) on conflict(business_id,location_id) do nothing;
 select templates into current_templates from public.branch_shipping_templates where business_id=p_business_id and location_id=p_location_id for update;
 select value into existing from jsonb_array_elements(current_templates) where value->>'id'=entry->>'id';
 if p_mode='create' and existing is not null then raise exception 'That template identity already exists. Reload settings.';end if;
 if p_mode='update' and (existing is null or (existing->>'revision')::bigint<>p_expected_revision) then raise exception 'This template changed since you opened it. Reload settings before saving.';end if;
 if p_mode='create' then next_templates:=current_templates||jsonb_build_array(entry);
 else select jsonb_agg(case when value->>'id'=entry->>'id' then entry else value end order by ordinal) into next_templates from jsonb_array_elements(current_templates) with ordinality as items(value,ordinal);end if;
 perform public.tenh_shipping_templates_valid(next_templates);
 update public.branch_shipping_templates set templates=next_templates,updated_at=now() where business_id=p_business_id and location_id=p_location_id;
 return next_templates;
end$$;
revoke all on function public.tenh_shipping_templates_valid(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.tenh_save_shipping_template(uuid,uuid,text,jsonb,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.tenh_save_shipping_template(uuid,uuid,text,jsonb,bigint,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
