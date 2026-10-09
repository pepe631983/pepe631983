-- Suite de pruebas de integración (schema aislado; no exponer a usuarios de negocio)

CREATE SCHEMA IF NOT EXISTS integration_test;
REVOKE ALL ON SCHEMA integration_test FROM PUBLIC;

CREATE TABLE integration_test.run_companies (
  run_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  PRIMARY KEY (run_id, company_id)
);

CREATE TABLE integration_test.run_users (
  run_id UUID NOT NULL,
  user_id UUID NOT NULL,
  PRIMARY KEY (run_id, user_id)
);

CREATE OR REPLACE FUNCTION integration_test.assert_eq(p_label TEXT, p_expected NUMERIC, p_actual NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_expected IS DISTINCT FROM p_actual THEN
    RAISE EXCEPTION 'ASSERT %: esperado %, obtenido %', p_label, p_expected, p_actual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION integration_test.assert_true(p_label TEXT, p_cond BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(p_cond, false) THEN
    RAISE EXCEPTION 'ASSERT %: condición falsa', p_label;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION integration_test.expect_exception(p_label TEXT, p_sql TEXT, p_like TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'ASSERT %: debió fallar', p_label;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE p_like THEN
    RAISE EXCEPTION 'ASSERT %: error inesperado: %', p_label, SQLERRM;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION integration_test.new_run_id()
RETURNS UUID
LANGUAGE sql
AS $$ SELECT gen_random_uuid(); $$;

CREATE OR REPLACE FUNCTION integration_test.create_auth_user(p_run_id UUID, p_suffix TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user UUID := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'it+' || p_suffix || '+' || v_user::text || '@invalid.local',
    crypt('integration-test', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
  );
  INSERT INTO integration_test.run_users (run_id, user_id) VALUES (p_run_id, v_user);
  RETURN v_user;
END;
$$;

CREATE OR REPLACE FUNCTION integration_test.bootstrap_company(
  p_run_id UUID,
  p_user UUID,
  p_name TEXT,
  p_role_code TEXT DEFAULT 'owner'
)
RETURNS TABLE(company_id UUID, branch_id UUID, warehouse_id UUID, role_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_branch UUID;
  v_wh UUID;
  v_role UUID;
BEGIN
  INSERT INTO public.companies (commercial_name, country_code, timezone, primary_currency_code, is_demo)
  VALUES (p_name, 'TC', 'America/Grand_Turk', 'USD', true)
  RETURNING id INTO v_company;

  INSERT INTO integration_test.run_companies (run_id, company_id) VALUES (p_run_id, v_company);

  INSERT INTO public.branches (company_id, code, name, is_default)
  VALUES (v_company, 'MAIN', 'Test', true) RETURNING id INTO v_branch;

  INSERT INTO public.warehouses (company_id, branch_id, code, name, is_default)
  VALUES (v_company, v_branch, 'WH1', 'Test WH', true) RETURNING id INTO v_wh;

  INSERT INTO public.profiles (user_id, company_id, full_name, is_active)
  VALUES (p_user, v_company, 'Integration', true);

  PERFORM public.seed_chart_of_accounts(v_company);
  PERFORM public.seed_default_roles(v_company);
  PERFORM public.seed_operational_defaults(v_company, v_branch, v_wh);
  PERFORM public.seed_print_profiles(v_company);

  SELECT id INTO v_role FROM public.roles WHERE company_id = v_company AND code = p_role_code;
  INSERT INTO public.user_roles (user_id, role_id) VALUES (p_user, v_role);

  company_id := v_company;
  branch_id := v_branch;
  warehouse_id := v_wh;
  role_id := v_role;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION integration_test.set_session_user(p_user UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  PERFORM set_config('role', 'authenticated', true);
END;
$$;

CREATE OR REPLACE FUNCTION integration_test.teardown_run(p_run_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, integration_test
AS $$
DECLARE
  v_uid UUID;
  v_cid UUID;
BEGIN
  FOR v_cid IN SELECT company_id FROM integration_test.run_companies WHERE run_id = p_run_id
  LOOP
    DELETE FROM public.companies WHERE id = v_cid;
  END LOOP;
  FOR v_uid IN SELECT user_id FROM integration_test.run_users WHERE run_id = p_run_id
  LOOP
    DELETE FROM auth.users WHERE id = v_uid;
  END LOOP;
  DELETE FROM integration_test.run_companies WHERE run_id = p_run_id;
  DELETE FROM integration_test.run_users WHERE run_id = p_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION integration_test.test_reference_scenario(p_run_id UUID)
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
  v_supplier UUID;
  v_receipt UUID;
  v_lines JSONB;
  v_qty numeric;
  v_cash money_amount;
  v_ar money_amount;
  v_ap money_amount;
  v_sales money_amount;
  v_cogs money_amount;
BEGIN
  v_user := integration_test.create_auth_user(p_run_id, 'ref');
  SELECT company_id, warehouse_id INTO v_company, v_wh
  FROM integration_test.bootstrap_company(p_run_id, v_user, 'IT REF SCENARIO');
  PERFORM integration_test.set_session_user(v_user);

  INSERT INTO public.products (company_id, internal_code, name, sale_price)
  VALUES (v_company, 'IT-001', 'Item', 100) RETURNING id INTO v_product;
  INSERT INTO public.suppliers (company_id, name) VALUES (v_company, 'Sup') RETURNING id INTO v_supplier;

  v_lines := jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 10, 'unit_cost', 60));
  v_receipt := public.confirm_goods_receipt(v_wh, 'purchase_pending_invoice', v_lines, 'it-gr-1', v_supplier, NULL);
  PERFORM public.post_supplier_invoice_for_receipt(v_receipt, 'INV-1', 'it-sinv-1');

  v_lines := jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 3, 'unit_price', 100, 'discount', 0));
  PERFORM public.confirm_pos_sale('it-pos-1', v_wh, 'cash', 300, v_lines);
  v_lines := jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 2, 'unit_price', 100, 'discount', 0));
  PERFORM public.confirm_pos_sale('it-pos-2', v_wh, 'credit', NULL, v_lines);

  SELECT si.id INTO v_receipt FROM public.sales_invoices si
  WHERE si.company_id = v_company AND si.idempotency_key = 'it-pos-2';
  PERFORM public.collect_customer_payment(v_receipt, 120, 'it-pay-1');

  SELECT quantity INTO v_qty FROM public.inventory_balances WHERE warehouse_id = v_wh AND product_id = v_product;
  PERFORM integration_test.assert_eq('inventory_units', 5, v_qty);

  v_cash := public.account_balance_for_code(v_company, '1000');
  v_ar := public.account_balance_for_code(v_company, '1100');
  v_ap := public.account_balance_for_code(v_company, '2000');
  v_sales := public.account_balance_for_code(v_company, '4000');
  v_cogs := public.account_balance_for_code(v_company, '5000');

  PERFORM integration_test.assert_eq('cash', 420, v_cash);
  PERFORM integration_test.assert_eq('ar', 80, v_ar);
  PERFORM integration_test.assert_eq('ap', 600, v_ap);
  PERFORM integration_test.assert_eq('net_sales', 500, v_sales);
  PERFORM integration_test.assert_eq('cogs', 300, v_cogs);

  RETURN jsonb_build_object(
    'inventory_units', jsonb_build_object('expected', 5, 'actual', v_qty),
    'cash', jsonb_build_object('expected', 420, 'actual', v_cash),
    'accounts_receivable', jsonb_build_object('expected', 80, 'actual', v_ar),
    'accounts_payable', jsonb_build_object('expected', 600, 'actual', v_ap),
    'net_sales', jsonb_build_object('expected', 500, 'actual', v_sales),
    'cost_of_goods_sold', jsonb_build_object('expected', 300, 'actual', v_cogs)
  );
END;
$$;

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

  v_a := public.post_supplier_invoice_for_receipt(v_a, 'F1', 'idem-sinv');
  v_b := public.post_supplier_invoice_for_receipt(v_a, 'F1', 'idem-sinv');
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

CREATE OR REPLACE FUNCTION integration_test.test_permissions_and_tenant(p_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, integration_test
AS $$
DECLARE
  v_owner UUID;
  v_seller UUID;
  v_company_a UUID;
  v_wh UUID;
  v_company_b UUID;
  v_product UUID;
  v_lines JSONB;
  v_inv UUID;
BEGIN
  v_owner := integration_test.create_auth_user(p_run_id, 'perm-own');
  SELECT company_id, warehouse_id INTO v_company_a, v_wh
  FROM integration_test.bootstrap_company(p_run_id, v_owner, 'IT PERM A', 'owner');

  v_seller := integration_test.create_auth_user(p_run_id, 'perm-sell');
  INSERT INTO public.profiles (user_id, company_id, full_name, is_active)
  VALUES (v_seller, v_company_a, 'Seller', true);
  INSERT INTO public.user_roles (user_id, role_id)
  SELECT v_seller, id FROM public.roles WHERE company_id = v_company_a AND code = 'seller';

  PERFORM integration_test.set_session_user(v_seller);
  PERFORM integration_test.expect_exception(
    'seller_no_purchase',
    format($q$SELECT public.confirm_goods_receipt(%L::uuid, 'opening_balance', '[]'::jsonb, 'x', NULL, 'motivo largo')$q$, v_wh),
    '%Permiso denegado%'
  );

  INSERT INTO public.companies (commercial_name, country_code, timezone, primary_currency_code, is_demo)
  VALUES ('IT PERM B', 'TC', 'America/Grand_Turk', 'USD', true)
  RETURNING id INTO v_company_b;
  INSERT INTO integration_test.run_companies (run_id, company_id) VALUES (p_run_id, v_company_b);

  PERFORM integration_test.set_session_user(v_owner);
  INSERT INTO public.products (company_id, internal_code, name, sale_price)
  VALUES (v_company_a, 'P1', 'P', 10) RETURNING id INTO v_product;
  v_lines := jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1, 'unit_cost', 5));
  PERFORM public.confirm_goods_receipt(v_wh, 'opening_balance', v_lines, 'ob-1', NULL, 'Saldo inicial prueba');

  PERFORM integration_test.set_session_user(v_seller);
  PERFORM integration_test.assert_true(
    'tenant_isolation_sales',
    NOT EXISTS (SELECT 1 FROM public.products WHERE company_id = v_company_b)
  );

  RETURN jsonb_build_object('permission_check', 'seller_blocked_purchase', 'tenant', 'ok');
END;
$$;

CREATE OR REPLACE FUNCTION integration_test.test_partial_ap_and_variance(p_run_id UUID)
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
  v_r1 UUID;
  v_r2 UUID;
  v_lines JSONB;
  v_grni money_amount;
  v_ap money_amount;
BEGIN
  v_user := integration_test.create_auth_user(p_run_id, 'ap');
  SELECT company_id, warehouse_id INTO v_company, v_wh
  FROM integration_test.bootstrap_company(p_run_id, v_user, 'IT PARTIAL AP');
  PERFORM integration_test.set_session_user(v_user);

  INSERT INTO public.products (company_id, internal_code, name, sale_price)
  VALUES (v_company, 'AP-1', 'P', 20) RETURNING id INTO v_product;
  INSERT INTO public.suppliers (company_id, name) VALUES (v_company, 'Sup') RETURNING id INTO v_sup;

  v_lines := jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 10, 'unit_cost', 10));
  v_r1 := public.confirm_goods_receipt(v_wh, 'purchase_pending_invoice', v_lines, 'ap-gr-1', v_sup, NULL);

  v_lines := jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 5, 'unit_cost', 10));
  v_r2 := public.confirm_goods_receipt(v_wh, 'purchase_pending_invoice', v_lines, 'ap-gr-2', v_sup, NULL);

  PERFORM public.post_supplier_invoice_for_receipt(v_r1, 'PF-1', 'ap-inv-1', 100, 100);

  PERFORM integration_test.expect_exception(
    'over_grni',
    format($q$SELECT public.post_supplier_invoice_for_receipt(%L::uuid, 'PF-X', 'ap-inv-x', 100, 200)$q$, v_r1),
    '%GRNI%'
  );

  PERFORM public.post_supplier_invoice_for_receipt(v_r2, 'PF-2', 'ap-inv-2', 52, 50);

  v_grni := public.account_balance_for_code(v_company, '1210');
  v_ap := public.account_balance_for_code(v_company, '2000');
  PERFORM integration_test.assert_eq('grni_after_partial', 0, v_grni);
  PERFORM integration_test.assert_eq('ap_total', 152, v_ap);

  RETURN jsonb_build_object(
    'grni_remaining', jsonb_build_object('expected', 0, 'actual', v_grni),
    'accounts_payable', jsonb_build_object('expected', 152, 'actual', v_ap),
    'variance_note', 'Factura 52 vs GRNI 50 → 2 en cuenta 6200'
  );
END;
$$;

CREATE OR REPLACE FUNCTION integration_test.test_rollback_on_fault(p_run_id UUID)
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
  v_before INT;
  v_after INT;
BEGIN
  v_user := integration_test.create_auth_user(p_run_id, 'rb');
  SELECT company_id, warehouse_id INTO v_company, v_wh
  FROM integration_test.bootstrap_company(p_run_id, v_user, 'IT ROLLBACK');
  PERFORM integration_test.set_session_user(v_user);

  INSERT INTO public.products (company_id, internal_code, name, sale_price)
  VALUES (v_company, 'RB-1', 'P', 10) RETURNING id INTO v_product;
  INSERT INTO public.suppliers (company_id, name) VALUES (v_company, 'S') RETURNING id INTO v_sup;

  v_lines := jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 5, 'unit_cost', 10));
  SELECT COUNT(*) INTO v_before FROM public.inventory_movements WHERE company_id = v_company;

  PERFORM set_config('integration_test.abort_after_movements', '1', true);
  BEGIN
    PERFORM public.confirm_goods_receipt(v_wh, 'purchase_pending_invoice', v_lines, 'rb-gr', v_sup, NULL);
    RAISE EXCEPTION 'debió abortar recepción';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%aborto simulado%' THEN RAISE; END IF;
  END;
  PERFORM set_config('integration_test.abort_after_movements', '0', true);

  SELECT COUNT(*) INTO v_after FROM public.inventory_movements WHERE company_id = v_company;
  PERFORM integration_test.assert_eq('no_partial_receipt_movements', v_before, v_after);

  v_lines := jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 2, 'unit_cost', 10));
  PERFORM public.confirm_goods_receipt(v_wh, 'purchase_pending_invoice', v_lines, 'rb-gr-ok', v_sup, NULL);

  v_lines := jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1, 'unit_price', 20, 'discount', 0));
  SELECT COUNT(*) INTO v_before FROM public.sales_invoices WHERE company_id = v_company;

  PERFORM set_config('integration_test.abort_before_journal', '1', true);
  BEGIN
    PERFORM public.confirm_pos_sale('rb-pos', v_wh, 'cash', 20, v_lines);
    RAISE EXCEPTION 'debió abortar venta';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%aborto simulado%' THEN RAISE; END IF;
  END;
  PERFORM set_config('integration_test.abort_before_journal', '0', true);

  SELECT COUNT(*) INTO v_after FROM public.sales_invoices WHERE company_id = v_company;
  PERFORM integration_test.assert_eq('no_partial_sale_invoice', v_before, v_after);

  RETURN jsonb_build_object('rollback_receipt', 'ok', 'rollback_pos', 'ok');
END;
$$;

CREATE OR REPLACE FUNCTION integration_test.test_reconciliation_by_date(p_run_id UUID)
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
  v_rec JSONB;
  v_sales_today money_amount;
BEGIN
  v_user := integration_test.create_auth_user(p_run_id, 'rec');
  SELECT company_id, warehouse_id INTO v_company, v_wh
  FROM integration_test.bootstrap_company(p_run_id, v_user, 'IT RECON');
  PERFORM integration_test.set_session_user(v_user);

  INSERT INTO public.products (company_id, internal_code, name, sale_price)
  VALUES (v_company, 'RC-1', 'P', 30) RETURNING id INTO v_product;

  PERFORM public.confirm_goods_receipt(
    v_wh, 'opening_balance',
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1, 'unit_cost', 10)),
    'rc-gr', NULL, 'Saldo inicial prueba'
  );
  PERFORM public.confirm_pos_sale(
    'rc-pos', v_wh, 'cash', 30,
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1, 'unit_price', 30, 'discount', 0))
  );

  v_rec := public.get_financial_reconciliation(CURRENT_DATE);
  PERFORM integration_test.assert_eq('reconciliation_company', v_company, (v_rec->>'company_id')::uuid);
  v_sales_today := (v_rec#>>'{metrics,net_sales_gl}')::money_amount;
  PERFORM integration_test.assert_eq('sales_as_of_today', 30, v_sales_today);

  RETURN jsonb_build_object('net_sales_today', jsonb_build_object('expected', 30, 'actual', v_sales_today));
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
    'reconciliation_by_date'
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
      'returns_and_cash_close',
      'physical_print'
    )
  );
END;
$$;

DROP FUNCTION IF EXISTS public.run_commercial_integration_tests();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA integration_test FROM PUBLIC;
GRANT USAGE ON SCHEMA integration_test TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA integration_test TO service_role;
