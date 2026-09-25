begin;

create or replace function public.guard_credit_checkout_deadline()
returns trigger language plpgsql set search_path=public as $$
begin
  if not new.credit_purchase then return new; end if;
  if tg_op='UPDATE' and old.payment_expires_at is not null then
    new.payment_expires_at:=old.payment_expires_at;
  else
    new.payment_expires_at:=coalesce(new.payment_expires_at,coalesce(new.created_at,now())+interval '10 minutes');
  end if;
  if tg_op='UPDATE' and old.status='pending_payment' and new.payment_expires_at<=now() and
    (new.status='payment_submitted' or (old.payway_tran_id is null and new.payway_tran_id is not null)) then
    raise exception 'Payment request expired. Create a new checkout.';
  end if;
  return new;
end;$$;

drop trigger if exists credit_checkout_deadline on public.business_change_orders;
create trigger credit_checkout_deadline before insert or update on public.business_change_orders
for each row execute function public.guard_credit_checkout_deadline();

update public.business_change_orders set payment_expires_at=created_at+interval '10 minutes'
where credit_purchase and payment_expires_at is null and status='pending_payment';

commit;
