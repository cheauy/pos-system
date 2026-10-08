-- place_online_order inserted order_items without sku/cost_price, so online
-- lines saved cost 0 and inflated profit. Copy both from the product row.
DO $$
DECLARE src text; patched text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='place_online_order';
  IF position('online_item_cost' in src) > 0 THEN RETURN; END IF;
  patched := regexp_replace(src,
    'variant_label,(\s*)selected_options(\s*)\)(\s*)values',
    'variant_label,\1selected_options, sku, cost_price /* online_item_cost */\2)\3values');
  patched := regexp_replace(patched,
    'coalesce\(v_computed -> ''selectedOptions'', ''\[\]''::jsonb\)(\s*)\);',
    'coalesce(v_computed -> ''selectedOptions'', ''[]''::jsonb),
        (select p.sku from public.products p where p.id = (v_computed ->> ''productId'')::uuid),
        coalesce((select p.cost_price from public.products p where p.id = (v_computed ->> ''productId'')::uuid), 0)\1);');
  IF patched = src OR position('online_item_cost' in patched) = 0 OR position('p.cost_price' in patched) = 0 THEN
    RAISE EXCEPTION 'place_online_order body changed; patch by hand.';
  END IF;
  EXECUTE patched;
END $$;
