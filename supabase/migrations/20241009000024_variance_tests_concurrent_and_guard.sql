-- Pruebas variación compra, concurrencia, guardia post-pruebas

CREATE OR REPLACE FUNCTION integration_test.test_supplier_variance_unsold(p_run_id UUID)
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
  v_r UUID;
  v_inv UUID;
  v_avg money_amount;
  v_exp6200 money_amount;
BEGIN
  v_user := integration_test.create_auth_user(p_run_id, 'var-none');
  SELECT company_id, warehouse_id INTO v_company, v_wh FROM integration_test.bootstrap_company(p_run_id, v_user, 'IT VAR UNSOLD');
  PERFORM integration_test.set_session_user(v_user);
  INSERT INTO public.products (company_id, internal_code, name, sale_price) VALUES (v_company, 'V0', 'P', 10) RETURNING id INTO v_product;
  INSERT INTO public.suppliers (company_id, name) VALUES (v_company, 'S') RETURNING id INTO v_sup;
  v_r := public.confirm_goods_receipt(v_wh, 'purchase_pending_invoice',
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 10, 'unit_cost', 10)),
    'var-gr-0', v_sup, NULL);
  v_inv := public.post_supplier_invoice_for_receipt(v_r, 'F0', 'var-inv-0', 105, 100);
  SELECT variance_to_inventory, variance_to_expense_sold INTO v_avg, v_exp6200
  FROM public.supplier_invoices WHERE id = v_inv;
  PERFORM integration_test.assert_eq('var_unsold_to_inv', 5, v_avg);
  PERFORM integration_test.assert_eq('var_unsold_exp', 0, v_exp6200);
  SELECT avg_unit_cost INTO v_avg FROM public.inventory_balances WHERE warehouse_id = v_wh AND product_id = v_product;
  PERFORM integration_test.assert_eq('avg_cost_bumped', 10.5, v_avg);
  RETURN jsonb_build_object('variance_to_inventory', 5, 'avg_unit_cost', v_avg);
END;
$$;

CREATE OR REPLACE FUNCTION integration_test.test_supplier_variance_partial_sold(p_run_id UUID)
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
  v_r UUID;
  v_inv UUID;
  v_si RECORD;
BEGIN
  v_user := integration_test.create_auth_user(p_run_id, 'var-part');
  SELECT company_id, warehouse_id INTO v_company, v_wh FROM integration_test.bootstrap_company(p_run_id, v_user, 'IT VAR PART');
  PERFORM integration_test.set_session_user(v_user);
  INSERT INTO public.products (company_id, internal_code, name, sale_price) VALUES (v_company, 'VP', 'P', 20) RETURNING id INTO v_product;
  INSERT INTO public.suppliers (company_id, name) VALUES (v_company, 'S') RETURNING id INTO v_sup;
  v_r := public.confirm_goods_receipt(v_wh, 'purchase_pending_invoice',
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 10, 'unit_cost', 10)),
    'var-gr-p', v_sup, NULL);
  PERFORM public.confirm_pos_sale('var-sale-p', v_wh, 'cash', 100,
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 5, 'unit_price', 20, 'discount', 0)));
  v_inv := public.post_supplier_invoice_for_receipt(v_r, 'FP', 'var-inv-p', 110, 100);
  SELECT * INTO v_si FROM public.supplier_invoices WHERE id = v_inv;
  PERFORM integration_test.assert_eq('var_partial_exp', 5, v_si.variance_to_expense_sold);
  PERFORM integration_test.assert_eq('var_partial_inv', 5, v_si.variance_to_inventory);
  RETURN jsonb_build_object('expense_sold', v_si.variance_to_expense_sold, 'to_inventory', v_si.variance_to_inventory);
END;
$$;

CREATE OR REPLACE FUNCTION integration_test.test_supplier_variance_all_sold(p_run_id UUID)
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
  v_r UUID;
  v_inv UUID;
  v_si RECORD;
BEGIN
  v_user := integration_test.create_auth_user(p_run_id, 'var-all');
  SELECT company_id, warehouse_id INTO v_company, v_wh FROM integration_test.bootstrap_company(p_run_id, v_user, 'IT VAR ALL');
  PERFORM integration_test.set_session_user(v_user);
  INSERT INTO public.products (company_id, internal_code, name, sale_price) VALUES (v_company, 'VA', 'P', 15) RETURNING id INTO v_product;
  INSERT INTO public.suppliers (company_id, name) VALUES (v_company, 'S') RETURNING id INTO v_sup;
  v_r := public.confirm_goods_receipt(v_wh, 'purchase_pending_invoice',
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 4, 'unit_cost', 10)),
    'var-gr-a', v_sup, NULL);
  PERFORM public.confirm_pos_sale('var-sale-a', v_wh, 'cash', 60,
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 4, 'unit_price', 15, 'discount', 0)));
  v_inv := public.post_supplier_invoice_for_receipt(v_r, 'FA', 'var-inv-a', 48, 40);
  SELECT * INTO v_si FROM public.supplier_invoices WHERE id = v_inv;
  PERFORM integration_test.assert_eq('var_all_exp', 8, v_si.variance_to_expense_sold);
  PERFORM integration_test.assert_eq('var_all_inv', 0, v_si.variance_to_inventory);
  RETURN jsonb_build_object('expense_sold', 8);
END;
$$;

CREATE OR REPLACE FUNCTION integration_test.prepare_concurrent_last_unit(p_run_id UUID)
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
BEGIN
  v_user := integration_test.create_auth_user(p_run_id, 'conc');
  SELECT company_id, warehouse_id INTO v_company, v_wh FROM integration_test.bootstrap_company(p_run_id, v_user, 'IT CONCURRENT');
  PERFORM integration_test.set_session_user(v_user);
  INSERT INTO public.products (company_id, internal_code, name, sale_price) VALUES (v_company, 'C1', 'P', 50) RETURNING id INTO v_product;
  INSERT INTO public.suppliers (company_id, name) VALUES (v_company, 'S') RETURNING id INTO v_sup;
  PERFORM public.confirm_goods_receipt(v_wh, 'purchase_pending_invoice',
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1, 'unit_cost', 20)),
    'conc-gr', v_sup, NULL);
  RETURN jsonb_build_object(
    'run_id', p_run_id,
    'user_id', v_user,
    'warehouse_id', v_wh,
    'product_id', v_product,
    'company_id', v_company
  );
END;
$$;

CREATE OR REPLACE FUNCTION integration_test.run_concurrent_last_unit_test()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, integration_test
AS $$
DECLARE
  v_run UUID := integration_test.new_run_id();
  v_prep JSONB;
  v_before INT;
  v_after INT;
  v_winner INT;
BEGIN
  IF NOT public.integration_tests_enabled() THEN
    RAISE EXCEPTION 'Pruebas deshabilitadas';
  END IF;
  v_prep := integration_test.prepare_concurrent_last_unit(v_run);
  SELECT COUNT(*) INTO v_before FROM public.sales_invoices WHERE company_id = (v_prep->>'company_id')::uuid;
  RETURN jsonb_build_object(
    'status', 'prepared',
    'run_id', v_run,
    'fixture', v_prep,
    'note', 'Ejecute scripts/db-test-concurrent-last-unit.sh para dos sesiones'
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
    'supplier_variance_unsold',
    'supplier_variance_partial_sold',
    'supplier_variance_all_sold'
  ];
  v_fn TEXT;
BEGIN
  IF NOT public.integration_tests_enabled() THEN
    RAISE EXCEPTION 'Pruebas de integración deshabilitadas';
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
    'pending_manual', jsonb_build_array('concurrent_last_unit_two_psql')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.disable_integration_tests()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.database_capabilities SET value = 'false' WHERE key = 'integration_tests_enabled';
END;
$$;

REVOKE ALL ON FUNCTION public.disable_integration_tests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.disable_integration_tests() TO service_role;

CREATE OR REPLACE FUNCTION integration_test.assert_tests_disabled()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, integration_test
AS $$
BEGIN
  IF public.integration_tests_enabled() THEN
    RAISE EXCEPTION 'integration_tests_enabled sigue activo';
  END IF;
  BEGIN
    PERFORM integration_test.run_suite();
    RAISE EXCEPTION 'run_suite debió fallar con flag desactivado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%deshabilitad%' THEN
      RAISE;
    END IF;
  END;
END;
$$;
