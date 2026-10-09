CREATE OR REPLACE FUNCTION integration_test.test_tax_rounding(p_run_id UUID)
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
  v_tax UUID;
  v_inv UUID;
  v_tax_total money_amount;
BEGIN
  v_user := integration_test.create_auth_user(p_run_id, 'tax');
  SELECT company_id, warehouse_id INTO v_company, v_wh
  FROM integration_test.bootstrap_company(p_run_id, v_user, 'IT TAX ROUND');
  PERFORM integration_test.set_session_user(v_user);

  INSERT INTO public.products (company_id, internal_code, name, sale_price)
  VALUES (v_company, 'TX-1', 'Item', 33.33) RETURNING id INTO v_product;

  INSERT INTO public.tax_rates (company_id, code, name, rate_percent, is_active, legal_format_pending)
  VALUES (v_company, 'TX-R', 'Redondeo', 8.8750, true, true)
  RETURNING id INTO v_tax;

  PERFORM public.confirm_goods_receipt(
    v_wh, 'opening_balance',
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 5, 'unit_cost', 10)),
    'tx-gr', NULL, 'Stock'
  );

  v_inv := public.confirm_pos_sale(
    'tx-pos', v_wh, 'cash', 108.88,
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1, 'unit_price', 100, 'discount', 0)),
    NULL, v_tax, NULL
  );

  SELECT tax_total INTO v_tax_total FROM public.sales_invoices WHERE id = v_inv;

  PERFORM integration_test.assert_eq('tax_stored_on_invoice', 8.88, v_tax_total);

  RETURN jsonb_build_object('tax_total', jsonb_build_object('expected', 8.88, 'actual', v_tax_total));
END;
$$;
