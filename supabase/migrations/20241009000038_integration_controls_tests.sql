-- Pruebas: reversión aislada bloqueada, período cerrado en compras, devolución crédito parcial

CREATE OR REPLACE FUNCTION integration_test.test_isolated_reversal_blocked(p_run_id UUID)
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
  v_inv UUID;
  v_je UUID;
BEGIN
  v_user := integration_test.create_auth_user(p_run_id, 'revblock');
  SELECT company_id, warehouse_id INTO v_company, v_wh
  FROM integration_test.bootstrap_company(p_run_id, v_user, 'IT REV BLOCK');
  PERFORM integration_test.set_session_user(v_user);

  INSERT INTO public.products (company_id, internal_code, name, sale_price)
  VALUES (v_company, 'RB-1', 'P', 40) RETURNING id INTO v_product;
  PERFORM public.confirm_goods_receipt(
    v_wh, 'opening_balance',
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 5, 'unit_cost', 10)),
    'rb-gr', NULL, 'Stock prueba'
  );
  v_inv := public.confirm_pos_sale(
    'rb-pos', v_wh, 'cash', 40,
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1, 'unit_price', 40, 'discount', 0))
  );

  SELECT je.id INTO v_je FROM public.journal_entries je
  WHERE je.company_id = v_company AND je.source_document_type = 'sales_invoice' AND je.source_document_id = v_inv;

  PERFORM integration_test.expect_exception(
    'block_isolated_reversal',
    format($q$SELECT public.reverse_journal_entry(%L::uuid, 'test', 'rb-rev')$q$, v_je),
    '%Reversión aislada no permitida%'
  );

  PERFORM integration_test.assert_eq('invoice_still_confirmed', 1,
    (SELECT COUNT(*) FROM public.sales_invoices WHERE id = v_inv AND status = 'confirmed')::numeric);

  RETURN jsonb_build_object('status', 'blocked_as_expected');
END;
$$;

CREATE OR REPLACE FUNCTION integration_test.test_closed_period_blocks_purchases(p_run_id UUID)
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
  v_period UUID;
  v_lines JSONB;
BEGIN
  v_user := integration_test.create_auth_user(p_run_id, 'period');
  SELECT company_id, warehouse_id INTO v_company, v_wh
  FROM integration_test.bootstrap_company(p_run_id, v_user, 'IT PERIOD');
  PERFORM integration_test.set_session_user(v_user);

  INSERT INTO public.products (company_id, internal_code, name, sale_price)
  VALUES (v_company, 'PD-1', 'P', 10) RETURNING id INTO v_product;
  INSERT INTO public.suppliers (company_id, name) VALUES (v_company, 'S') RETURNING id INTO v_sup;

  SELECT id INTO v_period FROM public.accounting_periods
  WHERE company_id = v_company AND status = 'open'
  ORDER BY period_start LIMIT 1;

  PERFORM public.close_accounting_period(v_period);

  v_lines := jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1, 'unit_cost', 5));
  PERFORM integration_test.expect_exception(
    'block_gr_when_closed',
    format($q$SELECT public.confirm_goods_receipt(%L::uuid, 'purchase_pending_invoice', %L::jsonb, 'pd-gr', %L::uuid, NULL)$q$,
      v_wh, v_lines, v_sup),
    '%Período contable cerrado%'
  );

  PERFORM integration_test.expect_exception(
    'block_cash_open_when_closed',
    format($q$SELECT public.open_cash_session((SELECT id FROM public.branches WHERE company_id = %L LIMIT 1), 0)$q$, v_company),
    '%Período contable cerrado%'
  );

  RETURN jsonb_build_object('period_closed', true);
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
    'tax_rounding',
    'isolated_reversal_blocked',
    'closed_period_blocks_purchases',
    'credit_return_partial_paid'
  ];
  v_fn TEXT;
BEGIN
  IF NOT public.integration_tests_enabled() THEN
    RAISE EXCEPTION 'Pruebas de integración deshabilitadas.';
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
    'automated_outside_suite', jsonb_build_array(
      'concurrent_last_unit_two_psql_connections (npm run db:test:concurrent)'
    ),
    'pending_manual', jsonb_build_array(
      'physical_print',
      'on_site_install_verification',
      'browser_e2e_staging_requires_VITE_SUPABASE_ANON_KEY'
    )
  );
END;
$$;
