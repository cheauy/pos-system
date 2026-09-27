begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

-- Retire the removed Customer Credit workspace alert without deleting its data.
do $$
declare definition text; credit_start integer; insert_start integer; next_insert integer;
begin
  definition:=pg_get_functiondef('public.refresh_business_notifications(uuid)'::regprocedure);
  credit_start:=position('select a.business_id,''credit-overdue:'' ' in definition);
  -- The deployed generator uses compact concatenation; accept its exact form.
  if credit_start=0 then credit_start:=position('select a.business_id,''credit-overdue:''||' in definition);end if;
  if credit_start>0 then
    insert_start:=length(left(definition,credit_start))-position(reverse('  insert into public.business_notifications (') in reverse(left(definition,credit_start)))+2-length('  insert into public.business_notifications (');
    next_insert:=position('  insert into public.business_notifications (' in substring(definition from credit_start));
    if insert_start<=0 or next_insert=0 then raise exception 'Unexpected notification generator. No changes applied.';end if;
    definition:=left(definition,insert_start-1)||substring(definition from credit_start+next_insert-1);
  end if;
  definition:=replace(definition,'d.is_active,d.low_stock_quantity,s.quantity stock_quantity',
    'd.is_active,coalesce(s.low_stock_threshold,d.low_stock_quantity,0) low_stock_quantity,s.quantity stock_quantity');
  if position('from public.customer_credit_accounts' in definition)>0 then raise exception 'Retired credit alert is still present.';end if;
  execute definition;
end;
$$;
update public.business_notifications set is_active=false,updated_at=now()
where notification_type='credit_overdue' and is_active;
notify pgrst,'reload schema';
commit;
