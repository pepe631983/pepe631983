-- Tras 00040: exigir delta 0 en todas las filas de conciliación (incl. caja)

CREATE OR REPLACE FUNCTION integration_test.test_treasury_e2e_scenario(p_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, integration_test
AS $$
DECLARE
  v_user UUID;
  v_company UUID;
  v_branch UUID;
  v_wh UUID;
  v_product UUID;
  v_supplier UUID;
  v_receipt UUID;
  v_tax UUID;
  v_session UUID;
  v_cash_inv UUID;
  v_credit_inv UUID;
  v_line_id UUID;
  v_lines JSONB;
  v_expected money_amount;
  v_close JSONB;
  v_rec JSONB;
  v_diff JSONB;
  v_j_before INT;
  v_j_after INT;
  v_elem JSONB;
BEGIN
  v_user := integration_test.create_auth_user(p_run_id, 'treasury');
  SELECT company_id, branch_id, warehouse_id INTO v_company, v_branch, v_wh
  FROM integration_test.bootstrap_company(p_run_id, v_user, 'IT TREASURY E2E');
  PERFORM integration_test.set_session_user(v_user);

  INSERT INTO public.products (company_id, internal_code, name, sale_price)
  VALUES (v_company, 'TR-1', 'Part', 50) RETURNING id INTO v_product;
  INSERT INTO public.suppliers (company_id, name) VALUES (v_company, 'Sup TR') RETURNING id INTO v_supplier;

  INSERT INTO public.tax_rates (company_id, code, name, rate_percent, is_active, is_default_sales, legal_format_pending)
  VALUES (v_company, 'IT-VAT', 'Impuesto prueba integración', 10.0000, true, false, true)
  RETURNING id INTO v_tax;

  v_lines := jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 10, 'unit_cost', 60));
  v_receipt := public.confirm_goods_receipt(v_wh, 'purchase_pending_invoice', v_lines, 'tr-gr', v_supplier, NULL);
  PERFORM public.post_supplier_invoice_for_receipt(v_receipt, 'TR-INV-1', 'tr-sinv');

  v_session := public.open_cash_session(v_branch, 100);

  v_lines := jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 2, 'unit_price', 50, 'discount', 0));
  v_cash_inv := public.confirm_pos_sale(
    'tr-pos-cash', v_wh, 'cash', 110, v_lines, v_session, v_tax, NULL
  );

  v_lines := jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1, 'unit_price', 50, 'discount', 0));
  v_credit_inv := public.confirm_pos_sale('tr-pos-credit', v_wh, 'credit', NULL, v_lines);

  PERFORM public.collect_customer_payment(v_credit_inv, 25, 'tr-pay', v_session, NULL);

  SELECT sil.id INTO v_line_id
  FROM public.sales_invoice_lines sil
  WHERE sil.sales_invoice_id = v_cash_inv
  ORDER BY sil.line_number LIMIT 1;

  PERFORM public.confirm_sales_return(
    'tr-ret',
    v_cash_inv,
    jsonb_build_array(jsonb_build_object('sales_invoice_line_id', v_line_id, 'quantity', 1)),
    'cash',
    v_session
  );

  v_rec := public.get_financial_reconciliation(CURRENT_DATE);
  FOR v_elem IN SELECT * FROM jsonb_array_elements(v_rec->'differences')
  LOOP
    PERFORM integration_test.assert_eq(
      'recon_' || (v_elem->>'key'),
      0,
      (v_elem->>'delta')::numeric
    );
  END LOOP;

  v_expected := public._cash_session_expected(v_session);
  v_close := public.close_cash_session(v_session, v_expected, 'Cierre prueba');
  PERFORM integration_test.assert_eq('close_difference', 0, (v_close->>'difference')::money_amount);

  SELECT COUNT(*) INTO v_j_before FROM public.journal_entries WHERE company_id = v_company;
  PERFORM public.request_reprint_for_document(
    'sales_invoice', v_cash_inv, 'sales_receipt', 'pdf_download', 'tr-reprint', NULL
  );
  SELECT COUNT(*) INTO v_j_after FROM public.journal_entries WHERE company_id = v_company;
  PERFORM integration_test.assert_eq('reprint_no_new_journals', v_j_before, v_j_after);

  RETURN jsonb_build_object(
    'cash_session_close', v_close,
    'reconciliation_deltas', v_rec->'differences',
    'inventory_units', (SELECT quantity FROM public.inventory_balances WHERE warehouse_id = v_wh AND product_id = v_product)
  );
END;
$$;

CREATE OR REPLACE FUNCTION integration_test.test_credit_return_partial_paid(p_run_id UUID)
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
  v_cust UUID;
  v_tax UUID;
  v_inv UUID;
  v_line UUID;
  v_store money_amount;
  v_ar_ops money_amount;
  v_rec JSONB;
  v_elem JSONB;
BEGIN
  v_user := integration_test.create_auth_user(p_run_id, 'cret');
  SELECT company_id, warehouse_id INTO v_company, v_wh
  FROM integration_test.bootstrap_company(p_run_id, v_user, 'IT CRED RET');
  PERFORM integration_test.set_session_user(v_user);

  INSERT INTO public.customers (company_id, name) VALUES (v_company, 'Cliente CR') RETURNING id INTO v_cust;
  INSERT INTO public.products (company_id, internal_code, name, sale_price)
  VALUES (v_company, 'CR-1', 'P', 100) RETURNING id INTO v_product;
  INSERT INTO public.tax_rates (company_id, code, name, rate_percent, is_active, legal_format_pending)
  VALUES (v_company, 'CR-VAT', 'Test', 10.0000, true, true) RETURNING id INTO v_tax;

  PERFORM public.confirm_goods_receipt(
    v_wh, 'opening_balance',
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 10, 'unit_cost', 20)),
    'cr-gr', NULL, 'Stock'
  );

  v_inv := public.confirm_pos_sale(
    'cr-pos', v_wh, 'credit', NULL,
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 2, 'unit_price', 50, 'discount', 0)),
    NULL, v_tax, NULL
  );
  UPDATE public.sales_invoices SET customer_id = v_cust WHERE id = v_inv;

  PERFORM public.collect_customer_payment(v_inv, 60, 'cr-pay');

  SELECT sil.id INTO v_line FROM public.sales_invoice_lines sil WHERE sil.sales_invoice_id = v_inv LIMIT 1;

  PERFORM public.confirm_sales_return(
    'cr-ret', v_inv,
    jsonb_build_array(jsonb_build_object('sales_invoice_line_id', v_line, 'quantity', 1)),
    'credit_balance', NULL
  );

  SELECT balance INTO v_store FROM public.customer_credit_balances
  WHERE company_id = v_company AND customer_id = v_cust;
  PERFORM integration_test.assert_eq('store_credit_excess', 5, v_store);

  v_rec := public.get_financial_reconciliation(CURRENT_DATE);
  v_ar_ops := (v_rec#>>'{metrics,accounts_receivable_operational}')::money_amount;
  PERFORM integration_test.assert_eq('ar_open_after_return', 0, v_ar_ops);

  FOR v_elem IN SELECT * FROM jsonb_array_elements(v_rec->'differences')
  LOOP
    PERFORM integration_test.assert_eq('recon_' || (v_elem->>'key'), 0, (v_elem->>'delta')::numeric);
  END LOOP;

  RETURN jsonb_build_object(
    'store_credit', jsonb_build_object('expected', 5, 'actual', v_store),
    'ar_operational', jsonb_build_object('expected', 0, 'actual', v_ar_ops)
  );
END;
$$;
