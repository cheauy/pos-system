begin;
create table if not exists public.branch_receipt_settings (
 like public.business_receipt_settings including defaults including constraints,
 location_id uuid not null references public.business_locations(id) on delete cascade,
 primary key(business_id,location_id)
);
create table if not exists public.branch_customer_settings (
 like public.business_customer_settings including defaults including constraints,
 location_id uuid not null references public.business_locations(id) on delete cascade,
 primary key(business_id,location_id)
);
create table if not exists public.branch_pos_settings (
 business_id uuid not null references public.businesses(id) on delete cascade,
 location_id uuid not null references public.business_locations(id) on delete cascade,
 currency text not null default 'USD', currency_format jsonb,
 pos_tax_rate numeric not null default 0 check(pos_tax_rate between 0 and 100),
 pos_point_value numeric not null default 0 check(pos_point_value>=0),
 pos_dual_currency_enabled boolean not null default true,
 pos_usd_khr_rate numeric not null default 4000 check(pos_usd_khr_rate between 1 and 1000000),
 loyalty_enabled boolean not null default false,loyalty_spend_per_point numeric not null default 1,
 loyalty_minimum_order numeric not null default 0,updated_at timestamptz not null default now(),
 primary key(business_id,location_id)
);

create or replace function public.tenh_seed_branch_settings() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 perform set_config('tenh.seed_branch_settings',new.id::text,true);
 insert into branch_receipt_settings select s.*,new.id from business_receipt_settings s where s.business_id=new.business_id on conflict do nothing;
 insert into branch_receipt_settings(business_id,location_id) values(new.business_id,new.id) on conflict do nothing;
 insert into branch_customer_settings select s.*,new.id from business_customer_settings s where s.business_id=new.business_id on conflict do nothing;
 insert into branch_customer_settings(business_id,location_id) values(new.business_id,new.id) on conflict do nothing;
 insert into branch_pos_settings(business_id,location_id,currency,currency_format,pos_tax_rate,pos_point_value,pos_dual_currency_enabled,pos_usd_khr_rate,loyalty_enabled,loyalty_spend_per_point,loyalty_minimum_order)
 select new.business_id,new.id,coalesce(s.currency,'USD'),s.currency_format,coalesce(s.pos_tax_rate,0),coalesce(s.pos_point_value,0),coalesce(s.pos_dual_currency_enabled,true),coalesce(s.pos_usd_khr_rate,4000),coalesce(s.loyalty_enabled,false),coalesce(s.loyalty_spend_per_point,1),coalesce(s.loyalty_minimum_order,0)
 from business_storefronts s where s.business_id=new.business_id on conflict do nothing;
 insert into branch_pos_settings(business_id,location_id) values(new.business_id,new.id) on conflict do nothing;
 perform set_config('tenh.seed_branch_settings','',true);
 return new;
end$$;
insert into public.branch_receipt_settings select s.*,l.id from public.business_receipt_settings s join public.business_locations l on l.business_id=s.business_id on conflict do nothing;
insert into public.branch_receipt_settings(business_id,location_id) select business_id,id from public.business_locations on conflict do nothing;
insert into public.branch_customer_settings select s.*,l.id from public.business_customer_settings s join public.business_locations l on l.business_id=s.business_id on conflict do nothing;
insert into public.branch_customer_settings(business_id,location_id) select business_id,id from public.business_locations on conflict do nothing;
insert into public.branch_pos_settings(business_id,location_id,currency,currency_format,pos_tax_rate,pos_point_value,pos_dual_currency_enabled,pos_usd_khr_rate,loyalty_enabled,loyalty_spend_per_point,loyalty_minimum_order)
select l.business_id,l.id,coalesce(s.currency,'USD'),s.currency_format,coalesce(s.pos_tax_rate,0),coalesce(s.pos_point_value,0),coalesce(s.pos_dual_currency_enabled,true),coalesce(s.pos_usd_khr_rate,4000),coalesce(s.loyalty_enabled,false),coalesce(s.loyalty_spend_per_point,1),coalesce(s.loyalty_minimum_order,0)
from public.business_locations l left join public.business_storefronts s on s.business_id=l.business_id on conflict do nothing;
drop trigger if exists tenh_seed_branch_settings on public.business_locations;
create trigger tenh_seed_branch_settings after insert on public.business_locations for each row execute function public.tenh_seed_branch_settings();

create or replace function public.tenh_branch_setting_visible(p_business uuid,p_location uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.business_members where business_id=p_business and user_id=auth.uid() and is_active and not coalesce(team_password_required,false)) then return false;end if;
 return p_location=public.tenh_request_branch(p_business);
end$$;
create or replace function public.tenh_guard_branch_setting() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if pg_trigger_depth()>1 and current_setting('tenh.seed_branch_settings',true)=new.location_id::text then return new;end if;
 perform public.tenh_assert_effective_permission(new.business_id,'business.update');
 new.location_id:=coalesce(new.location_id,public.tenh_request_branch(new.business_id));
 if not coalesce(public.tenh_branch_setting_visible(new.business_id,new.location_id),false) then raise exception 'Settings belong to another branch.';end if;
 if tg_op='UPDATE' and (new.business_id<>old.business_id or new.location_id<>old.location_id) then raise exception 'Settings cannot be moved to another branch.';end if;
 perform public.tenh_assert_plan_branch(new.business_id,new.location_id);
 if exists(select 1 from public.business_locations where id=new.location_id and plan_disable_pending) then raise exception 'This branch is closing after a plan change.';end if;
 return new;
end$$;
do $$declare t text;begin
 foreach t in array array['branch_receipt_settings','branch_customer_settings','branch_pos_settings'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy branch_read on public.%I for select to authenticated using(public.tenh_branch_setting_visible(business_id,location_id))',t);
 execute format('create policy branch_write on public.%I for all to authenticated using(public.tenh_branch_setting_visible(business_id,location_id) and public.tenh_user_permission_allowed(business_id,auth.uid(),''business.update'')) with check(public.tenh_branch_setting_visible(business_id,location_id) and public.tenh_user_permission_allowed(business_id,auth.uid(),''business.update''))',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
 execute format('create trigger branch_setting_guard before insert or update on public.%I for each row execute function public.tenh_guard_branch_setting()',t);
 end loop;
end$$;
notify pgrst,'reload schema';
commit;
