-- Pruebas SQL: caja, impuesto en documento, devolución y conciliación

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

  v_expected := public._cash_session_expected(v_session);
  v_close := public.close_cash_session(v_session, v_expected, 'Cierre prueba');
  PERFORM integration_test.assert_eq('close_difference', 0, (v_close->>'difference')::money_amount);

  v_rec := public.get_financial_reconciliation(CURRENT_DATE);
  FOR v_elem IN SELECT * FROM jsonb_array_elements(v_rec->'differences')
  LOOP
    IF v_elem->>'key' = 'cash_session_vs_gl' THEN
      CONTINUE;
    END IF;
    PERFORM integration_test.assert_eq(
      'recon_' || (v_elem->>'key'),
      0,
      (v_elem->>'delta')::numeric
    );
  END LOOP;

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

CREATE OR REPLACE FUNCTION integration_test.run_suite()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, integration_test
AS $$
DECLARE
  v_run UUID := integration_test.new_run_id();
  v_results JSONB := '[]'::jsonb;
  v_detail JSONB;
  v_name TEXT;
  v_failed INT := 0;
  v_tests TEXT[] := ARRAY[
    'reference_scenario',
    'idempotency_all_ops',
    'permissions_and_tenant',
    'partial_ap_and_variance',
    'rollback_on_fault',
    'reconciliation_by_date',
    'treasury_e2e_scenario',
    'tax_rounding'
  ];
  v_fn TEXT;
BEGIN
  IF NOT public.integration_tests_enabled() THEN
    RAISE EXCEPTION 'Pruebas de integración deshabilitadas. En staging ejecute: UPDATE database_capabilities SET value = ''true'' WHERE key = ''integration_tests_enabled''; (solo proyecto de prueba)';
  END IF;

  FOREACH v_name IN ARRAY v_tests
  LOOP
    v_fn := 'integration_test.test_' || v_name;
    BEGIN
      EXECUTE format('SELECT %s($1)', v_fn) INTO v_detail USING v_run;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'test', v_name, 'status', 'passed', 'detail', COALESCE(v_detail, '{}'::jsonb)
      ));
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'test', v_name, 'status', 'failed', 'error', SQLERRM
      ));
    END;
  END LOOP;

  PERFORM integration_test.teardown_run(v_run);

  IF v_failed > 0 THEN
    RAISE EXCEPTION 'Suite fallida: % prueba(s). Resultados: %', v_failed, v_results;
  END IF;

  RETURN jsonb_build_object(
    'suite_status', 'passed',
    'tests_run', array_length(v_tests, 1),
    'results', v_results,
    'pending_manual', jsonb_build_array(
      'concurrent_last_unit_two_connections',
      'physical_print',
      'on_site_install_verification'
    )
  );
END;
$$;
