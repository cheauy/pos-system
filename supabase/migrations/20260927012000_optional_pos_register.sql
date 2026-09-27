begin;

alter table public.branch_pos_settings add column if not exists require_open_register boolean not null default true;

-- Preserve the installed branch, permission, pricing and idempotency checks.
do $$declare definition text; original text;begin
 original:=pg_get_functiondef('public.tenh_pos_checkout_registered(uuid,jsonb)'::regprocedure);
 definition:=replace(original,
   'IF NOT FOUND THEN RAISE EXCEPTION ''Open the register for this POS branch before taking payment.''; END IF;',
   'IF v_shift.id IS NULL AND coalesce((select require_open_register from public.branch_pos_settings where business_id=p_business_id and location_id=v_branch),true) THEN RAISE EXCEPTION ''Open the register for this POS branch before taking payment.''; END IF;');
 if definition=original and position('require_open_register' in original)=0 then
   raise exception 'Register guard does not match the installed function. No changes applied.';
 end if;
 execute definition;
end$$;

create or replace function public.tenh_pos_save_options(p_business_id uuid,p_tax_rate numeric,p_point_value numeric,p_require_open_register boolean)
returns void language plpgsql security definer set search_path='' as $$
declare branch uuid;
begin
 if p_require_open_register is null then raise exception 'Choose whether an open register is required.'; end if;
 perform public.tenh_assert_effective_permission(p_business_id,'business.update');
 branch:=public.tenh_request_branch(p_business_id);
 perform public.tenh_pos_settings(p_business_id,p_tax_rate,p_point_value);
 update public.branch_pos_settings set require_open_register=p_require_open_register where business_id=p_business_id and location_id=branch;
 if not found then raise exception 'Branch POS settings are unavailable.'; end if;
end$$;
revoke all on function public.tenh_pos_save_options(uuid,numeric,numeric,boolean) from public,anon;
grant execute on function public.tenh_pos_save_options(uuid,numeric,numeric,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
