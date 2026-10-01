begin;
-- Optional branch field; hiding it never removes saved customer values.
alter table public.branch_customer_settings add column if not exists gender_enabled boolean not null default false;
alter table public.customers add column if not exists gender text;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.customers'::regclass and conname='customers_gender_values') then
  alter table public.customers add constraint customers_gender_values check(gender is null or gender in ('male','female'));
 end if;
end $$;
CREATE OR REPLACE FUNCTION public.tenh_pos_customer_create(p_business_id uuid, p_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text; v_user uuid; v_name text; v_phone text; v_address text; v_digits text;
  v_customer public.customers%rowtype; v_email text; v_birthday date; v_email_enabled boolean:=true; v_birthday_enabled boolean:=true; v_gender text; v_gender_enabled boolean:=false;
begin
  v_role:=public.tenh_pos_guard(p_business_id);v_user:=auth.uid();
  if v_user is null or coalesce(v_role,'') not in ('owner','cashier') then
    raise exception 'You do not have permission to create customers from POS.' using errcode='42501';
  end if;
  if p_id is null or jsonb_typeof(p_input) is distinct from 'object'
     or pg_column_size(p_input)>10000
     or jsonb_typeof(p_input->'name') is distinct from 'string'
     or jsonb_typeof(p_input->'phone') is distinct from 'string'
     or jsonb_typeof(p_input->'address') is distinct from 'string' then
    raise exception 'Enter valid customer details.';
  end if;
  SELECT coalesce(email_enabled,true),coalesce(birthday_enabled,true)
    INTO v_email_enabled,v_birthday_enabled FROM public.business_customer_settings WHERE business_id=p_business_id FOR SHARE;
  v_email_enabled:=coalesce(v_email_enabled,true);v_birthday_enabled:=coalesce(v_birthday_enabled,true);
  -- Ignore disabled optional fields even on a stale/forged client request.
  IF v_email_enabled AND p_input ? 'email' THEN
    IF jsonb_typeof(p_input->'email') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid email.'; END IF;
    v_email:=nullif(btrim(p_input->>'email'),'');
    IF length(v_email)>254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RAISE EXCEPTION 'Enter a valid email address.'; END IF;
  END IF;
  IF v_birthday_enabled AND p_input ? 'birthday' THEN
    IF jsonb_typeof(p_input->'birthday') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid birthday.'; END IF;
    IF nullif(p_input->>'birthday','') IS NOT NULL THEN
      IF (p_input->>'birthday') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Enter a valid birthday.'; END IF;
      v_birthday:=(p_input->>'birthday')::date;
      IF v_birthday>current_date THEN RAISE EXCEPTION 'Birthday cannot be in the future.'; END IF;
    END IF;
  END IF;
  select coalesce(gender_enabled,false) into v_gender_enabled from public.branch_customer_settings
    where business_id=p_business_id and location_id=public.tenh_request_branch(p_business_id);
  if coalesce(v_gender_enabled,false) and p_input ? 'gender' then
    if jsonb_typeof(p_input->'gender') is distinct from 'string' then raise exception 'Choose Male or Female.'; end if;
    v_gender:=nullif(p_input->>'gender','');
    if v_gender is not null and v_gender not in ('male','female') then raise exception 'Choose Male or Female.'; end if;
  end if;
  v_name:=btrim(p_input->>'name');v_phone:=btrim(p_input->>'phone');
  v_address:=btrim(p_input->>'address');v_digits:=regexp_replace(v_phone,'[^0-9]','','g');
  if length(v_name) not between 2 and 120 then raise exception 'Customer name must contain 2–120 characters.'; end if;
  if v_phone !~ '^[+0-9() .-]{5,40}$' or length(v_digits) not between 5 and 20 then
    raise exception 'Enter a phone number with 5–20 digits.';
  end if;
  if length(v_address)>500 then raise exception 'Address must be 500 characters or fewer.'; end if;
  -- A retry after a lost response reuses the same UUID. Never upsert or overwrite
  -- an existing customer, and never expose another business's customer data.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tenh-pos-customer-id:'||p_id::text,0));
  select * into v_customer from public.customers where id=p_id for update;
  if found then
    if v_customer.business_id is distinct from p_business_id
       or v_customer.owner_id is distinct from v_user
       or v_customer.name is distinct from v_name
       or v_customer.phone is distinct from v_phone
       or coalesce(v_customer.address,'') is distinct from v_address
       or (v_email_enabled AND p_input ? 'email' AND coalesce(v_customer.email,'') IS DISTINCT FROM coalesce(v_email,''))
       or (v_gender_enabled and p_input ? 'gender' and v_customer.gender is distinct from v_gender)
       or (v_birthday_enabled AND p_input ? 'birthday' AND v_customer.birthday IS DISTINCT FROM v_birthday) then
      raise exception 'This customer request is already in use. Review Customers before trying again.';
    end if;
  else
    if length(v_address)=0 then raise exception 'Customer address is required.'; end if;
    -- Same phone lock used by the opt-in POS checkout customer-creation flow.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tenh-pos-customer:'||p_business_id::text||':'||v_digits,0));
    if exists(select 1 from public.customers c where c.business_id=p_business_id
       and regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=v_digits) then
      raise exception 'A customer with this phone already exists. Search and select that customer instead.';
    end if;
    insert into public.customers(id,owner_id,business_id,name,phone,address,email,birthday,gender,note)
      values(p_id,v_user,p_business_id,v_name,v_phone,nullif(v_address,''),v_email,v_birthday,v_gender,null)
      returning * into v_customer;
    insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,description,metadata)
      values(p_business_id,v_user,'create','customer',p_id,'Created customer from POS customer picker',
        jsonb_build_object('source','pos_customer_picker','requestId',p_id));
  end if;
  return jsonb_build_object('id',v_customer.id,'name',v_customer.name,'phone',v_customer.phone,
    'address',v_customer.address,'loyalty_points',coalesce(v_customer.loyalty_points,0),
    'created_at',v_customer.created_at,'gender',v_customer.gender);
end $function$
;
notify pgrst, 'reload schema';
commit;
