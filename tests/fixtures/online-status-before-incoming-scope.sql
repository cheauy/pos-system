CREATE OR REPLACE FUNCTION public.tenh_update_online_order_status(p_business uuid, p_order uuid, p_status text, p_expected_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_order public.orders%rowtype; v_branch uuid; v_current text; v_level integer; v_next_level integer; v_next_order_status public.orders.status%type; v_next_online_status public.orders.online_status%type;
BEGIN
  IF p_status='rejected' THEN
    PERFORM public.tenh_assert_effective_permission(p_business,'orders.cancel');
  ELSE
    PERFORM public.tenh_assert_effective_permission(p_business,'orders.update');
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('accepted','preparing','ready','completed','rejected') THEN RAISE EXCEPTION 'Invalid online order status.'; END IF;
  v_branch := public.tenh_request_branch(p_business);
  IF v_branch IS NULL THEN RAISE EXCEPTION 'Choose an operating branch.'; END IF;
  PERFORM public.tenh_lock_checkout_branch(p_business,v_branch);
  SELECT * INTO v_order FROM public.orders WHERE id=p_order AND business_id=p_business AND location_id=v_branch AND order_source IN ('online','qr') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Online order not found in this branch.'; END IF;
  v_current := coalesce(v_order.online_status,'new');
  IF v_current=p_status AND ((p_status='rejected' AND v_order.status='cancelled') OR (p_status='completed' AND v_order.status='completed')
     OR (p_status NOT IN ('completed','rejected') AND v_order.status='pending')) THEN
    RETURN jsonb_build_object('orderId',v_order.id,'orderNumber',v_order.order_number,'onlineStatus',p_status,'alreadyApplied',true);
  END IF;
  IF v_order.status IN ('cancelled','refunded','completed') OR v_current IN ('completed','rejected') THEN RAISE EXCEPTION 'A finalized order cannot be changed.'; END IF;
  IF p_expected_status IS NOT NULL AND p_expected_status IS DISTINCT FROM v_current THEN
    RAISE EXCEPTION 'This order changed. Refresh before updating it again.' USING ERRCODE='40001';
  END IF;
  v_level := CASE v_current WHEN 'new' THEN 0 WHEN 'accepted' THEN 1 WHEN 'preparing' THEN 2 WHEN 'ready' THEN 3 ELSE -1 END;
  v_next_level := CASE p_status WHEN 'accepted' THEN 1 WHEN 'preparing' THEN 2 WHEN 'ready' THEN 3 WHEN 'completed' THEN 4 ELSE 5 END;
  IF v_level<0 OR (p_status<>'rejected' AND v_next_level<=v_level) THEN RAISE EXCEPTION 'Choose a forward order status.'; END IF;
  IF p_status='rejected' THEN
    IF greatest(0,coalesce(v_order.amount_paid,0)-coalesce(v_order.change_amount,0))>0
      OR (v_order.payment_status='paid' AND coalesce(v_order.total,0)>0) THEN
      RAISE EXCEPTION 'This order has a recorded payment. Use the refund workflow before cancellation; rejection does not refund money.';
    END IF;
    PERFORM public.tenh_run_branch_stock(p_business,'reject_online',jsonb_build_object('p_order_id',p_order,'p_reason','Online order rejected by shop'));
  END IF;
  v_next_online_status := p_status;
  IF p_status='completed' THEN v_next_order_status := 'completed';
  ELSIF p_status='rejected' THEN v_next_order_status := 'cancelled';
  ELSE v_next_order_status := 'pending'; END IF;
  UPDATE public.orders SET online_status=v_next_online_status,status=v_next_order_status,updated_at=clock_timestamp()
    WHERE id=p_order AND business_id=p_business AND location_id=v_branch;
  IF NOT FOUND THEN RAISE EXCEPTION 'The online order status could not be saved.'; END IF;
  RETURN jsonb_build_object('orderId',v_order.id,'orderNumber',v_order.order_number,'onlineStatus',p_status,'alreadyApplied',false);
END;
$function$
;
