begin;

-- All editors must take the parent lock before changing a transfer's recipe.
-- This also protects a mobile send from a simultaneous website draft edit.
create or replace function public.tenh_transfer_item_draft_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare transfer public.stock_transfers%rowtype;
begin
  if tg_op='UPDATE' and (new.transfer_id is distinct from old.transfer_id or new.business_id is distinct from old.business_id) then
    raise exception 'Transfer item ownership cannot change.';
  end if;
  select * into transfer from public.stock_transfers where id=case when tg_op='DELETE' then old.transfer_id else new.transfer_id end for update;
  if not found and tg_op='DELETE' then return old; end if; -- Parent cascade.
  if not found or transfer.business_id is distinct from (case when tg_op='DELETE' then old.business_id else new.business_id end) then raise exception 'Transfer not found.'; end if;
  if tg_op='DELETE' and not exists(select 1 from public.businesses where id=transfer.business_id) then return old; end if;
  if transfer.status is distinct from 'draft' then raise exception 'Only draft transfer items can be changed.'; end if;
  if tg_op='DELETE' then return old; end if;
  if new.quantity is null or new.quantity<=0 then raise exception 'Enter a positive transfer quantity.'; end if;
  if not exists(select 1 from public.products where id=new.product_id and business_id=new.business_id and is_active) then raise exception 'Choose an active product in this business.'; end if;
  return new;
end $$;
drop trigger if exists tenh_transfer_item_draft_guard on public.stock_transfer_items;
create trigger tenh_transfer_item_draft_guard before insert or update or delete on public.stock_transfer_items for each row execute function public.tenh_transfer_item_draft_guard();
revoke all on function public.tenh_transfer_item_draft_guard() from public,anon,authenticated;

create or replace function public.tenh_transfer_forward_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then
    -- Preserve the existing business deletion cascade, including sent transfers.
    if not exists(select 1 from public.businesses where id=old.business_id) then return old; end if;
    if old.status is distinct from 'draft' then raise exception 'Only draft transfers can be deleted.'; end if;
    return old;
  end if;
  if new.business_id is distinct from old.business_id or new.id is distinct from old.id then raise exception 'Transfer ownership cannot change.'; end if;
  if old.status='received' and new.status is distinct from 'received'
    or old.status='in_transit' and (new.status is null or new.status not in ('in_transit','received')) then raise exception 'A sent transfer cannot be reopened.'; end if;
  if old.status<>'draft' and (new.source_location_id is distinct from old.source_location_id or new.destination_location_id is distinct from old.destination_location_id) then raise exception 'Sent transfer branches cannot change.'; end if;
  return new;
end $$;
drop trigger if exists tenh_transfer_forward_guard on public.stock_transfers;
create trigger tenh_transfer_forward_guard before update or delete on public.stock_transfers for each row execute function public.tenh_transfer_forward_guard();
revoke all on function public.tenh_transfer_forward_guard() from public,anon,authenticated;

create or replace function public.tenh_mobile_transfer_action(
  p_business_id uuid,p_branch_id uuid,p_transfer_id uuid,p_action text,p_expected timestamptz,p_items jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare transfer public.stock_transfers%rowtype; actual jsonb; expected jsonb; item record; available integer;
begin
  if auth.uid() is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  perform public.tenh_assert_effective_permission(p_business_id,'transfers.manage');
  if p_branch_id is null or public.tenh_request_branch(p_business_id) is distinct from p_branch_id then raise exception 'Your operating branch changed.' using errcode='42501'; end if;
  perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);
  if p_action='check' then return jsonb_build_object('ready',true); end if;
  if p_action is null or p_action not in ('send','receive') then raise exception 'Choose Send or Receive.'; end if;
  select * into transfer from public.stock_transfers where id=p_transfer_id and business_id=p_business_id for update;
  if not found then raise exception 'Transfer not found.'; end if;
  if (p_action='send' and transfer.source_location_id is distinct from p_branch_id) or (p_action='receive' and transfer.destination_location_id is distinct from p_branch_id) then
    raise exception 'Send from the source branch or receive at the destination branch.' using errcode='42501';
  end if;
  -- Forward-only status makes retrying the same transition harmless.
  if (p_action='send' and transfer.status in ('in_transit','received')) or (p_action='receive' and transfer.status='received') then
    return jsonb_build_object('transferId',transfer.id,'status',transfer.status,'alreadyApplied',true);
  end if;
  if (p_action='send' and transfer.status is distinct from 'draft') or (p_action='receive' and transfer.status is distinct from 'in_transit') then raise exception 'This transfer cannot make that change.'; end if;
  if transfer.source_location_id is null or transfer.destination_location_id is null or transfer.source_location_id=transfer.destination_location_id then raise exception 'Choose different source and destination branches.'; end if;
  perform public.tenh_assert_plan_branch(p_business_id,transfer.source_location_id);
  perform public.tenh_assert_plan_branch(p_business_id,transfer.destination_location_id);
  if (select count(*) from public.business_locations where business_id=p_business_id and id in (transfer.source_location_id,transfer.destination_location_id) and is_active and not coalesce(plan_disable_pending,false))<>2 then raise exception 'A transfer branch is unavailable.'; end if;
  if transfer.updated_at is distinct from p_expected then raise exception 'Transfer changed. Refresh before continuing.'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Reload the transfer items.'; end if;
  if jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100 then raise exception 'Use the website for transfers larger than 100 items.'; end if;
  select jsonb_agg(jsonb_build_object('productId',product_id,'quantity',quantity) order by product_id) into actual
    from public.stock_transfer_items where transfer_id=transfer.id and business_id=p_business_id;
  select jsonb_agg(jsonb_build_object('productId',(value->>'productId')::uuid,'quantity',(value->>'quantity')::numeric) order by (value->>'productId')::uuid) into expected from jsonb_array_elements(p_items);
  if actual is null or actual is distinct from expected then raise exception 'Transfer items changed. Refresh before continuing.'; end if;
  for item in select * from public.stock_transfer_items where transfer_id=transfer.id and business_id=p_business_id order by product_id loop
    if item.quantity is null or item.quantity<=0 then raise exception 'Invalid transfer quantity.'; end if;
    perform id from public.products where id=item.product_id and business_id=p_business_id and (p_action='receive' or is_active) for update;
    if not found then raise exception 'Product not found in this business.'; end if;
    if p_action='send' then
      select s.quantity into available from public.product_location_stock s where s.business_id=p_business_id and s.location_id=transfer.source_location_id and s.product_id=item.product_id for update;
      if not found or available<item.quantity then raise exception 'Not enough stock in the source branch.'; end if;
      update public.product_location_stock set quantity=product_location_stock.quantity-item.quantity,updated_at=now() where business_id=p_business_id and location_id=transfer.source_location_id and product_id=item.product_id;
    else
      insert into public.product_location_stock(business_id,location_id,product_id,quantity) values(p_business_id,transfer.destination_location_id,item.product_id,item.quantity)
      on conflict(location_id,product_id) do update set quantity=product_location_stock.quantity+excluded.quantity,updated_at=now();
    end if;
  end loop;
  if p_action='send' then
    update public.stock_transfers set status='in_transit',sent_by=auth.uid(),sent_at=now(),updated_at=now() where id=transfer.id;
  else
    update public.stock_transfers set status='received',received_by=auth.uid(),received_at=now(),updated_at=now() where id=transfer.id;
  end if;
  return jsonb_build_object('transferId',transfer.id,'status',case when p_action='send' then 'in_transit' else 'received' end,'alreadyApplied',false);
end $$;
revoke all on function public.tenh_mobile_transfer_action(uuid,uuid,uuid,text,timestamptz,jsonb) from public,anon;
grant execute on function public.tenh_mobile_transfer_action(uuid,uuid,uuid,text,timestamptz,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
