begin;
do $$
declare source text;
begin
  source := pg_get_functiondef('public.tenh_cancel_order_item(uuid,uuid,uuid,timestamptz,text)'::regprocedure);
  if position('sale.remaining_balance is distinct from sale.total' in source)=0 then
    if position('sale.total is distinct from sale.subtotal+coalesce(sale.delivery_fee,0)' in source)=0 then
      raise exception 'Item cancellation function changed; review the balance guard.';
    end if;
    source := replace(source,
      'sale.total is distinct from sale.subtotal+coalesce(sale.delivery_fee,0)',
      'sale.remaining_balance is distinct from sale.total or sale.total is distinct from sale.subtotal+coalesce(sale.delivery_fee,0)');
    execute source;
  end if;
end $$;
commit;
