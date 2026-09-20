-- TENH POS continuation of the operating-branches/register work in pos-system(9).
-- Apply AFTER 20260921100000_operating_branches.sql on a staging database first.
-- No historical balances, inventory, subscription prices or orders are rewritten.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
DO $preflight$
BEGIN
  IF to_regprocedure('public.tenh_request_branch(uuid)') IS NULL
     OR to_regprocedure('public.tenh_run_branch_stock(uuid,text,jsonb)') IS NULL
     OR to_regprocedure('public.tenh_pos_checkout_registered(uuid,jsonb)') IS NULL
     OR to_regprocedure('public.tenh_close_register_accounted(uuid,uuid,numeric,text)') IS NULL THEN
    RAISE EXCEPTION 'Apply the existing register-accounting and operating-branches migrations first.';
  END IF;
END;
$preflight$;

-- The same payment precedence is used by register-model.ts: immutable receipt,
-- cashReceived when present, otherwise the original tender list, then legacy cash.
-- Never silently close a drawer with NaN/Infinity in its recorded payment data.
CREATE OR REPLACE FUNCTION public.tenh_register_payment_parts(
  p_meta jsonb, p_method text, p_paid numeric, p_change numeric
) RETURNS TABLE(cash numeric, noncash numeric)
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $parts$
DECLARE
  v_paid numeric := coalesce((p_meta #>> '{receipt,amountPaid}')::numeric, p_paid, 0);
  v_change numeric := coalesce((p_meta #>> '{receipt,change}')::numeric, p_change, 0);
  v_received numeric;
  v_part jsonb;
  v_amount numeric;
  v_cash numeric := 0;
  v_noncash numeric := 0;
BEGIN
  IF v_paid::text IN ('NaN','Infinity','-Infinity') OR v_change::text IN ('NaN','Infinity','-Infinity')
     OR v_paid < 0 OR v_change < 0 OR v_change > v_paid THEN
    RAISE EXCEPTION 'Invalid recorded payment/change. Review the order before closing the register.';
  END IF;
  v_received := greatest(0, round(v_paid,2) - round(v_change,2));
  IF p_meta->>'cashReceived' IS NOT NULL THEN
    v_cash := (p_meta->>'cashReceived')::numeric;
    IF v_cash::text IN ('NaN','Infinity','-Infinity') OR v_cash < 0 OR round(v_cash,2) > v_received THEN
      RAISE EXCEPTION 'Recorded drawer cash exceeds the payment. Review the order before closing.';
    END IF;
    v_cash := round(v_cash,2);
    v_noncash := v_received - v_cash;
  ELSIF jsonb_typeof(p_meta->'tenders') = 'array' AND jsonb_array_length(p_meta->'tenders') > 0 THEN
    FOR v_part IN SELECT value FROM jsonb_array_elements(p_meta->'tenders') LOOP
      v_amount := (v_part->>'amount')::numeric;
      IF v_amount IS NULL OR v_amount::text IN ('NaN','Infinity','-Infinity') OR v_amount < 0 THEN
        RAISE EXCEPTION 'Invalid recorded tender amount. Review the order before closing.';
      END IF;
      IF v_part->>'method' = 'cash' THEN v_cash := v_cash + round(v_amount,2);
      ELSIF v_part->>'method' IS DISTINCT FROM 'credit' THEN v_noncash := v_noncash + round(v_amount,2);
      END IF;
    END LOOP;
    IF round(v_change,2) > v_cash THEN RAISE EXCEPTION 'Recorded cash change exceeds cash tenders.'; END IF;
    v_cash := v_cash - round(v_change,2);
    IF v_cash + v_noncash <> v_received THEN RAISE EXCEPTION 'Recorded tenders do not match payment received.'; END IF;
  ELSIF p_method IN ('cash','cod') THEN
    v_cash := v_received;
  ELSE
    v_noncash := v_received;
  END IF;
  RETURN QUERY SELECT v_cash, v_noncash;
END;
$parts$;
REVOKE ALL ON FUNCTION public.tenh_register_payment_parts(jsonb,text,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenh_register_payment_parts(jsonb,text,numeric,numeric) TO authenticated;

-- Lock order is business -> drawer, matching checkout and branch stock routines.
-- Closing a historical drawer does not require purchasing extra branch capacity.
CREATE OR REPLACE FUNCTION public.tenh_lock_register_business(p_business uuid, p_shift uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $lock_business$
DECLARE v_branch uuid; v_request_branch uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.business_members WHERE business_id=p_business AND user_id=auth.uid()
      AND is_active AND role IN ('owner','admin','manager','cashier')
  ) THEN RAISE EXCEPTION 'Register permission required.' USING ERRCODE='42501'; END IF;
  v_request_branch := public.tenh_request_branch(p_business);
  SELECT location_id INTO v_branch FROM public.cash_register_shifts WHERE id=p_shift AND business_id=p_business;
  IF NOT FOUND OR v_request_branch IS NULL OR v_branch IS DISTINCT FROM v_request_branch THEN
    RAISE EXCEPTION 'The register does not belong to the current operating branch.' USING ERRCODE='42501';
  END IF;
  PERFORM id FROM public.businesses WHERE id=p_business FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business not found.'; END IF;
END;
$lock_business$;
REVOKE ALL ON FUNCTION public.tenh_lock_register_business(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenh_lock_register_business(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tenh_close_register_accounted(
  p_business_id uuid,p_shift_id uuid,p_closing_cash numeric,p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $close_register$
DECLARE
  v_shift public.cash_register_shifts%rowtype;
  v_cash numeric; v_noncash numeric; v_in numeric; v_out numeric; v_refunds numeric;
  v_expected numeric; v_summary jsonb;
BEGIN
  IF p_closing_cash IS NULL OR p_closing_cash::text IN ('NaN','Infinity','-Infinity')
     OR p_closing_cash < 0 OR p_closing_cash > 999999999.99 OR p_closing_cash <> round(p_closing_cash,2) THEN
    RAISE EXCEPTION 'Enter finite counted cash with at most two decimal places.';
  END IF;
  PERFORM public.tenh_lock_register_business(p_business_id,p_shift_id);
  SELECT * INTO v_shift FROM public.cash_register_shifts WHERE id=p_shift_id AND business_id=p_business_id FOR UPDATE;
  IF NOT FOUND OR v_shift.status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'This register shift is not open.'; END IF;
  -- Legacy authorization and close side effects are retained. Any exception below
  -- aborts the entire close, not just the final summary update.
  PERFORM public.close_cash_register_shift(p_business_id,p_shift_id,p_closing_cash,p_note);
  SELECT coalesce(sum(p.cash),0),coalesce(sum(p.noncash),0) INTO v_cash,v_noncash
  FROM public.orders o CROSS JOIN LATERAL public.tenh_register_payment_parts(
    o.pos_checkout,o.payment_method::text,o.amount_paid,o.change_amount
  ) p WHERE o.business_id=p_business_id AND o.register_shift_id=p_shift_id
    AND (o.pos_checkout IS NOT NULL OR o.status NOT IN ('cancelled','refunded'));
  IF EXISTS(SELECT 1 FROM public.cash_movements WHERE business_id=p_business_id AND shift_id=p_shift_id
    AND (amount IS NULL OR amount::text IN ('NaN','Infinity','-Infinity') OR amount<0)) THEN
    RAISE EXCEPTION 'Invalid recorded cash movement. Review this drawer before closing.';
  END IF;
  SELECT coalesce(sum(amount) FILTER(WHERE movement_type='cash_in'),0),
    coalesce(sum(amount) FILTER(WHERE movement_type='cash_out'),0),
    coalesce(sum(amount) FILTER(WHERE movement_type='cash_out' AND reference LIKE 'return:%'),0)
    INTO v_in,v_out,v_refunds FROM public.cash_movements WHERE business_id=p_business_id AND shift_id=p_shift_id;
  IF v_shift.opening_cash IS NULL OR v_shift.opening_cash::text IN ('NaN','Infinity','-Infinity') OR v_shift.opening_cash<0 THEN
    RAISE EXCEPTION 'Invalid opening float. Review this register before closing.';
  END IF;
  v_expected := round(v_shift.opening_cash+v_cash+v_in-v_out,2);
  v_summary := jsonb_build_object('cash',v_cash,'noncash',v_noncash,'incoming',v_in,'outgoing',v_out,'refunds',v_refunds,'expected',v_expected);
  UPDATE public.cash_register_shifts SET expected_cash=v_expected,variance=round(p_closing_cash-v_expected,2),register_summary=v_summary
    WHERE id=p_shift_id AND business_id=p_business_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Register totals could not be saved.'; END IF;
  RETURN v_summary||jsonb_build_object('closing_cash',p_closing_cash,'variance',round(p_closing_cash-v_expected,2));
END;
$close_register$;

-- Validate branch/category assignments for direct RPC callers too. Already
-- committed retries are resolved first and never acquire a new drawer or stock.
CREATE OR REPLACE FUNCTION public.tenh_pos_checkout_registered(p_business_id uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $checkout$
DECLARE
  v_existing jsonb; v_result jsonb; v_shift public.cash_register_shifts%rowtype;
  v_order public.orders%rowtype; v_branch uuid; v_request_branch uuid; v_item jsonb;
BEGIN
  IF p_input IS NULL OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid sale request.'; END IF;
  v_existing := public.tenh_pos_checkout_status(p_business_id,(p_input->>'requestId')::uuid);
  IF v_existing IS NOT NULL AND v_existing->>'orderId' IS NOT NULL THEN
    RETURN public.tenh_pos_checkout(p_business_id,p_input);
  END IF;
  v_branch := (p_input->>'branchId')::uuid;
  v_request_branch := public.tenh_request_branch(p_business_id);
  IF v_request_branch IS NULL OR v_branch IS DISTINCT FROM v_request_branch THEN
    RAISE EXCEPTION 'The operating branch changed. Review this sale in its original branch.' USING ERRCODE='42501';
  END IF;
  PERFORM public.tenh_lock_checkout_branch(p_business_id,v_branch);
  SELECT * INTO v_shift FROM public.cash_register_shifts
    WHERE business_id=p_business_id AND location_id=v_branch AND status='open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Open the register for this POS branch before taking payment.'; END IF;
  IF jsonb_typeof(p_input->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'items') NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Add 1–100 items to the sale.';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_input->'items') LOOP
    IF NOT EXISTS(
      SELECT 1 FROM public.products p JOIN public.product_location_stock s ON s.product_id=p.id AND s.business_id=p.business_id
      WHERE p.business_id=p_business_id AND p.id=(v_item->>'productId')::uuid AND p.is_active AND s.location_id=v_branch
        AND (p.category_id IS NULL OR EXISTS(SELECT 1 FROM public.categories c WHERE c.id=p.category_id AND c.business_id=p_business_id
          AND (c.branch_ids IS NULL OR v_branch=ANY(c.branch_ids))))
    ) THEN RAISE EXCEPTION 'A cart product or category is not assigned to this branch. Refresh POS.'; END IF;
  END LOOP;
  v_result := public.tenh_pos_checkout(p_business_id,p_input);
  SELECT * INTO v_order FROM public.orders WHERE id=(v_result->>'orderId')::uuid AND business_id=p_business_id FOR UPDATE;
  IF NOT FOUND OR v_order.location_id IS DISTINCT FROM v_branch THEN RAISE EXCEPTION 'POS order branch does not match the open register.'; END IF;
  IF v_order.register_shift_id IS NOT NULL AND v_order.register_shift_id<>v_shift.id THEN RAISE EXCEPTION 'POS order is linked to a different shift.'; END IF;
  UPDATE public.orders SET register_shift_id=v_shift.id WHERE id=v_order.id AND business_id=p_business_id;
  RETURN v_result;
END;
$checkout$;

-- Rejection used to cancel/restock in one request and set online_status in a
-- second request. This RPC commits those operations together, or neither.
CREATE OR REPLACE FUNCTION public.tenh_update_online_order_status(
  p_business uuid,p_order uuid,p_status text,p_expected_status text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $online_status$
DECLARE v_order public.orders%rowtype; v_branch uuid; v_current text; v_role text; v_level integer; v_next_level integer; v_next_order_status public.orders.status%type; v_next_online_status public.orders.online_status%type;
BEGIN
  SELECT role INTO v_role FROM public.business_members WHERE business_id=p_business AND user_id=auth.uid() AND is_active;
  IF auth.uid() IS NULL OR coalesce(v_role,'') NOT IN ('owner','admin','manager','cashier') THEN
    RAISE EXCEPTION 'Order update permission required.' USING ERRCODE='42501';
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
$online_status$;
REVOKE ALL ON FUNCTION public.tenh_update_online_order_status(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenh_update_online_order_status(uuid,uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.tenh_pos_checkout_registered(uuid,jsonb), public.tenh_close_register_accounted(uuid,uuid,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenh_pos_checkout_registered(uuid,jsonb), public.tenh_close_register_accounted(uuid,uuid,numeric,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
