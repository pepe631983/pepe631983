CREATE OR REPLACE FUNCTION integration_test.test_idempotency_all_ops(p_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, integration_test
AS $$
DECLARE
  v_user UUID;
  v_company UUID;
  v_wh UUID;
  v_product UUID;
  v_sup UUID;
  v_lines JSONB;
  v_a UUID;
  v_b UUID;
  v_inv UUID;
  v_receipt UUID;
BEGIN
  v_user := integration_test.create_auth_user(p_run_id, 'idem');
  SELECT company_id, warehouse_id INTO v_company, v_wh
  FROM integration_test.bootstrap_company(p_run_id, v_user, 'IT IDEMPOTENCY');
  PERFORM integration_test.set_session_user(v_user);

  INSERT INTO public.products (company_id, internal_code, name, sale_price)
  VALUES (v_company, 'ID-1', 'X', 50) RETURNING id INTO v_product;
  INSERT INTO public.suppliers (company_id, name) VALUES (v_company, 'S') RETURNING id INTO v_sup;

  v_lines := jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 2, 'unit_cost', 10));
  v_a := public.confirm_goods_receipt(v_wh, 'purchase_pending_invoice', v_lines, 'idem-gr', v_sup, NULL);
  v_b := public.confirm_goods_receipt(v_wh, 'purchase_pending_invoice', v_lines, 'idem-gr', v_sup, NULL);
  PERFORM integration_test.assert_eq('goods_receipt_idempotent', v_a, v_b);

  PERFORM integration_test.expect_exception(
    'goods_receipt_hash',
    format($q$SELECT public.confirm_goods_receipt(%L::uuid, 'purchase_pending_invoice', %L::jsonb, 'idem-gr', %L::uuid, NULL)$q$,
      v_wh, jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 3, 'unit_cost', 10)), v_sup),
    '%contenido distinto%'
  );

  v_receipt := v_a;
  v_a := public.post_supplier_invoice_for_receipt(v_receipt, 'F1', 'idem-sinv');
  v_b := public.post_supplier_invoice_for_receipt(v_receipt, 'F1', 'idem-sinv');
  PERFORM integration_test.assert_eq('supplier_invoice_idempotent', v_a, v_b);

  v_lines := jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1, 'unit_price', 50, 'discount', 0));
  v_a := public.confirm_pos_sale('idem-pos', v_wh, 'cash', 50, v_lines);
  v_b := public.confirm_pos_sale('idem-pos', v_wh, 'cash', 50, v_lines);
  PERFORM integration_test.assert_eq('pos_idempotent', v_a, v_b);

  v_inv := public.confirm_pos_sale(
    'idem-cr', v_wh, 'credit', NULL,
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1, 'unit_price', 50, 'discount', 0))
  );
  v_a := public.collect_customer_payment(v_inv, 25, 'idem-pay');
  v_b := public.collect_customer_payment(v_inv, 25, 'idem-pay');
  PERFORM integration_test.assert_eq('payment_idempotent', v_a, v_b);

  RETURN jsonb_build_object('status', 'ok');
END;
$$;
