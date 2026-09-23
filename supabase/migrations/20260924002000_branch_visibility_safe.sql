begin;
set local lock_timeout='5s';
-- RLS predicates may run before the query's business filter, including on joined
-- rows. Deny an inaccessible row instead of throwing and aborting the whole read.
-- The strict tenh_request_branch validator remains unchanged for write RPCs.
create or replace function public.tenh_branch_visible(p_business uuid,p_location uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare branch uuid; h jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.business_members where business_id=p_business and user_id=auth.uid() and is_active and not coalesce(team_password_required,false)) then return false;end if;
 if nullif(h->>'x-tenh-business-id','') is not null and (h->>'x-tenh-business-id')::uuid is distinct from p_business then return false;end if;
 branch:=public.tenh_request_branch(p_business);
 return branch is null or coalesce(p_location=branch,false);
exception when insufficient_privilege or invalid_text_representation then return false;
end;$$;
alter policy tenh_assigned_branch_locations on public.business_locations
 using (public.tenh_branch_visible(business_id,id))
 with check (public.tenh_branch_visible(business_id,id));
commit;
