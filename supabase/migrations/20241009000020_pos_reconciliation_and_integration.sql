-- POS: idempotencia con hash, asiento balanceado; conciliación financiera; prueba de integración (solo staging)

CREATE OR REPLACE FUNCTION public.confirm_pos_sale(
  p_idempotency_key TEXT,
  p_warehouse_id UUID,
  p_payment_kind TEXT,
  p_amount_paid money_amount,
  p_lines JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_branch UUID;
  v_invoice_id UUID;
  v_existing UUID;
  v_hash TEXT;
  v_stored_hash TEXT;
  v_line JSONB;
  v_idx SMALLINT := 0;
  v_product_id UUID;
  v_qty quantity_amount;
  v_unit_price money_amount;
  v_discount money_amount;
  v_subtotal money_amount := 0;
  v_discount_total money_amount := 0;
  v_total money_amount := 0;
  v_cost_total money_amount := 0;
  v_balance RECORD;
  v_line_subtotal money_amount;
  v_line_cost money_amount;
  v_invoice_number TEXT;
  v_journal_id UUID;
  v_acct_cash UUID;
  v_acct_ar UUID;
  v_acct_sales UUID;
  v_acct_cogs UUID;
  v_acct_inventory UUID;
BEGIN
  PERFORM public.require_permission('sales.confirm');
  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Sin empresa activa';
  END IF;

  v_hash := md5(
    p_warehouse_id::text || '|' || p_payment_kind || '|'
    || COALESCE(p_amount_paid::text, '') || '|' || COALESCE(p_lines::text, '')
  );

  SELECT result_entity_id INTO v_existing FROM public.operation_idempotency
  WHERE company_id = v_company AND operation = 'pos_sale' AND idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    SELECT payload_hash INTO v_stored_hash FROM public.operation_idempotency
    WHERE company_id = v_company AND operation = 'pos_sale' AND idempotency_key = p_idempotency_key;
    IF v_stored_hash <> v_hash THEN
      RAISE EXCEPTION 'Clave de idempotencia reutilizada con contenido distinto';
    END IF;
    RETURN v_existing;
  END IF;

  SELECT id INTO v_existing FROM public.sales_invoices
  WHERE company_id = v_company AND idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT b.id INTO v_branch
  FROM public.warehouses w
  JOIN public.branches b ON b.id = w.branch_id
  WHERE w.id = p_warehouse_id AND w.company_id = v_company;
  IF v_branch IS NULL THEN
    RAISE EXCEPTION 'Almacén inválido';
  END IF;

  IF p_payment_kind = 'cash' AND p_amount_paid IS NULL THEN
    RAISE EXCEPTION 'Indique monto pagado';
  END IF;

  SELECT id INTO v_acct_cash FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1000';
  SELECT id INTO v_acct_ar FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1100';
  SELECT id INTO v_acct_sales FROM public.chart_of_accounts WHERE company_id = v_company AND code = '4000';
  SELECT id INTO v_acct_cogs FROM public.chart_of_accounts WHERE company_id = v_company AND code = '5000';
  SELECT id INTO v_acct_inventory FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1200';

  v_invoice_number := public.next_document_number(v_company, 'sales_invoice', v_branch);

  INSERT INTO public.sales_invoices (
    company_id, branch_id, warehouse_id, invoice_number, status, payment_kind,
    idempotency_key, created_by
  ) VALUES (
    v_company, v_branch, p_warehouse_id, v_invoice_number, 'confirmed', p_payment_kind,
    p_idempotency_key, auth.uid()
  ) RETURNING id INTO v_invoice_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_idx := v_idx + 1;
    v_product_id := (v_line->>'product_id')::uuid;
    v_qty := (v_line->>'quantity')::numeric;
    v_unit_price := (v_line->>'unit_price')::numeric;
    v_discount := COALESCE((v_line->>'discount')::numeric, 0);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida';
    END IF;

    SELECT * INTO v_balance
    FROM public.inventory_balances
    WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id
    FOR UPDATE;

    IF v_balance IS NULL OR v_balance.quantity < v_qty THEN
      RAISE EXCEPTION 'Existencia insuficiente para producto %', v_product_id;
    END IF;

    v_line_subtotal := (v_qty * v_unit_price) - v_discount;
    v_line_cost := v_qty * v_balance.avg_unit_cost;
    v_subtotal := v_subtotal + (v_qty * v_unit_price);
    v_discount_total := v_discount_total + v_discount;
    v_cost_total := v_cost_total + v_line_cost;

    INSERT INTO public.sales_invoice_lines (
      sales_invoice_id, company_id, product_id, line_number, description,
      quantity, unit_price, discount, line_subtotal, unit_cost, line_cost
    )
    SELECT
      v_invoice_id, v_company, p.id, v_idx, p.name,
      v_qty, v_unit_price, v_discount, v_line_subtotal, v_balance.avg_unit_cost, v_line_cost
    FROM public.products p WHERE p.id = v_product_id AND p.company_id = v_company;

    UPDATE public.inventory_balances
    SET quantity = quantity - v_qty, updated_at = now()
    WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id;

    INSERT INTO public.inventory_movements (
      company_id, warehouse_id, product_id, movement_kind, quantity_delta,
      unit_cost, extended_cost, source_document_type, source_document_id
    ) VALUES (
      v_company, p_warehouse_id, v_product_id, 'sale', -v_qty,
      v_balance.avg_unit_cost, v_line_cost, 'sales_invoice', v_invoice_id
    );
  END LOOP;

  v_total := v_subtotal - v_discount_total;

  IF p_payment_kind = 'cash' AND p_amount_paid < v_total THEN
    RAISE EXCEPTION 'Pago insuficiente para venta al contado';
  END IF;

  UPDATE public.sales_invoices
  SET subtotal = v_subtotal,
      discount_total = v_discount_total,
      tax_total = 0,
      total = v_total,
      amount_paid = CASE WHEN p_payment_kind = 'cash' THEN p_amount_paid ELSE 0 END,
      cost_total = v_cost_total,
      confirmed_at = now()
  WHERE id = v_invoice_id;

  INSERT INTO public.journal_entries (
    company_id, status, description, source_document_type, source_document_id,
    idempotency_key, created_by, confirmed_at
  ) VALUES (
    v_company, 'confirmed',
    'Venta POS ' || v_invoice_number,
    'sales_invoice', v_invoice_id,
    'je-' || p_idempotency_key, auth.uid(), now()
  ) RETURNING id INTO v_journal_id;

  IF p_payment_kind = 'cash' THEN
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
      (v_journal_id, v_company, v_acct_cash, 1, v_total, 0, 'Cobro contado'),
      (v_journal_id, v_company, v_acct_sales, 2, 0, v_total, 'Ingreso venta');
  ELSE
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
      (v_journal_id, v_company, v_acct_ar, 1, v_total, 0, 'Venta crédito'),
      (v_journal_id, v_company, v_acct_sales, 2, 0, v_total, 'Ingreso venta');
  END IF;

  INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
    (v_journal_id, v_company, v_acct_cogs, 3, v_cost_total, 0, 'Costo venta'),
    (v_journal_id, v_company, v_acct_inventory, 4, 0, v_cost_total, 'Salida inventario');

  PERFORM public.assert_journal_balanced(v_journal_id);

  INSERT INTO public.operation_idempotency (company_id, operation, idempotency_key, payload_hash, result_entity_id)
  VALUES (v_company, 'pos_sale', p_idempotency_key, v_hash, v_invoice_id);

  PERFORM public.log_audit('sales.invoice.confirmed', 'sales_invoice', v_invoice_id, 'POS confirmado');

  RETURN v_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.account_balance_for_code(p_company_id UUID, p_code TEXT)
RETURNS money_amount
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    CASE coa.account_type
      WHEN 'asset' THEN SUM(jl.debit) - SUM(jl.credit)
      WHEN 'expense' THEN SUM(jl.debit) - SUM(jl.credit)
      WHEN 'contra_asset' THEN SUM(jl.credit) - SUM(jl.debit)
      WHEN 'liability' THEN SUM(jl.credit) - SUM(jl.debit)
      WHEN 'equity' THEN SUM(jl.credit) - SUM(jl.debit)
      WHEN 'income' THEN SUM(jl.credit) - SUM(jl.debit)
      WHEN 'contra_income' THEN SUM(jl.debit) - SUM(jl.credit)
      ELSE SUM(jl.debit) - SUM(jl.credit)
    END,
    0
  )
  FROM public.journal_lines jl
  JOIN public.chart_of_accounts coa ON coa.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.company_id = p_company_id
    AND coa.code = p_code
    AND je.status = 'confirmed'
  GROUP BY coa.account_type;
$$;

CREATE OR REPLACE FUNCTION public.get_financial_reconciliation()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_inv_qty numeric;
  v_inv_book money_amount;
  v_inv_gl money_amount;
  v_cash_gl money_amount;
  v_ar_gl money_amount;
  v_ap_gl money_amount;
  v_sales_gl money_amount;
  v_cogs_gl money_amount;
  v_ar_ops money_amount;
  v_debit money_amount;
  v_credit money_amount;
  v_gross money_amount;
BEGIN
  IF NOT (public.has_permission('reports.financial') OR public.has_permission('accounting.journal.view')) THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;
  v_company := public.current_company_id();

  SELECT COALESCE(SUM(quantity), 0),
         COALESCE(SUM(quantity * avg_unit_cost), 0)
  INTO v_inv_qty, v_inv_book
  FROM public.inventory_balances
  WHERE company_id = v_company;

  v_inv_gl := public.account_balance_for_code(v_company, '1200');
  v_cash_gl := public.account_balance_for_code(v_company, '1000');
  v_ar_gl := public.account_balance_for_code(v_company, '1100');
  v_ap_gl := public.account_balance_for_code(v_company, '2000');
  v_sales_gl := public.account_balance_for_code(v_company, '4000');
  v_cogs_gl := public.account_balance_for_code(v_company, '5000');

  SELECT COALESCE(SUM(total - amount_paid), 0) INTO v_ar_ops
  FROM public.sales_invoices
  WHERE company_id = v_company AND status = 'confirmed' AND payment_kind = 'credit';

  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
  INTO v_debit, v_credit
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.company_id = v_company AND je.status = 'confirmed';

  v_gross := v_sales_gl - v_cogs_gl;

  RETURN jsonb_build_object(
    'as_of', now(),
    'metrics', jsonb_build_object(
      'inventory_quantity', v_inv_qty,
      'inventory_book_value', v_inv_book,
      'inventory_gl_balance', v_inv_gl,
      'cash_gl_balance', v_cash_gl,
      'accounts_receivable_gl', v_ar_gl,
      'accounts_receivable_operational', v_ar_ops,
      'accounts_payable_gl', v_ap_gl,
      'net_sales_gl', v_sales_gl,
      'cost_of_goods_sold_gl', v_cogs_gl,
      'gross_profit', v_gross,
      'journal_debits_total', v_debit,
      'journal_credits_total', v_credit
    ),
    'differences', jsonb_build_array(
      jsonb_build_object(
        'key', 'inventory_vs_gl',
        'label', 'Inventario valorizado vs cuenta 1200',
        'expected', v_inv_book,
        'actual', v_inv_gl,
        'delta', v_inv_book - v_inv_gl
      ),
      jsonb_build_object(
        'key', 'ar_vs_gl',
        'label', 'CxC operacional vs cuenta 1100',
        'expected', v_ar_ops,
        'actual', v_ar_gl,
        'delta', v_ar_ops - v_ar_gl
      ),
      jsonb_build_object(
        'key', 'debits_vs_credits',
        'label', 'Total débitos vs créditos',
        'expected', v_debit,
        'actual', v_credit,
        'delta', v_debit - v_credit
      )
    ),
    'documents', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'type', je.source_document_type,
        'id', je.source_document_id,
        'description', je.description,
        'confirmed_at', je.confirmed_at
      ) ORDER BY je.confirmed_at NULLS LAST), '[]'::jsonb)
      FROM public.journal_entries je
      WHERE je.company_id = v_company AND je.status = 'confirmed'
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_financial_reconciliation TO authenticated;
GRANT EXECUTE ON FUNCTION public.account_balance_for_code TO authenticated;

-- Prueba de integración autónoma (entorno local/staging; no producción)
CREATE OR REPLACE FUNCTION public.run_commercial_integration_tests()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user UUID := gen_random_uuid();
  v_company UUID;
  v_company_b UUID;
  v_branch UUID;
  v_wh UUID;
  v_role UUID;
  v_product UUID;
  v_supplier UUID;
  v_receipt UUID;
  v_supplier_inv UUID;
  v_inv_cash UUID;
  v_inv_credit UUID;
  v_payment UUID;
  v_lines JSONB;
  v_j_before INT;
  v_j_after INT;
  v_rec JSONB;
  v_qty numeric;
  v_inv_val money_amount;
  v_cash money_amount;
  v_ar money_amount;
  v_ap money_amount;
  v_sales money_amount;
  v_cogs money_amount;
  v_debit money_amount;
  v_credit money_amount;
  v_inv_gl money_amount;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    v_user,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'integration+' || v_user::text || '@local.invalid',
    crypt('integration-test', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  );

  INSERT INTO public.companies (commercial_name, country_code, timezone, primary_currency_code, is_demo)
  VALUES ('INTEGRATION TEST CO A', 'TC', 'America/Grand_Turk', 'USD', true)
  RETURNING id INTO v_company;

  INSERT INTO public.branches (company_id, code, name, is_default)
  VALUES (v_company, 'MAIN', 'Test', true) RETURNING id INTO v_branch;

  INSERT INTO public.warehouses (company_id, branch_id, code, name, is_default)
  VALUES (v_company, v_branch, 'WH1', 'Test WH', true) RETURNING id INTO v_wh;

  INSERT INTO public.profiles (user_id, company_id, full_name, is_active)
  VALUES (v_user, v_company, 'Integration Tester', true);

  PERFORM public.seed_chart_of_accounts(v_company);
  PERFORM public.seed_default_roles(v_company);
  PERFORM public.seed_operational_defaults(v_company, v_branch, v_wh);
  PERFORM public.seed_print_profiles(v_company);

  SELECT id INTO v_role FROM public.roles WHERE company_id = v_company AND code = 'owner';
  INSERT INTO public.user_roles (user_id, role_id) VALUES (v_user, v_role);

  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);

  INSERT INTO public.products (company_id, internal_code, name, sale_price)
  VALUES (v_company, 'FILT-001', 'Filtro prueba', 100)
  RETURNING id INTO v_product;

  INSERT INTO public.suppliers (company_id, name) VALUES (v_company, 'Proveedor Test')
  RETURNING id INTO v_supplier;

  v_lines := jsonb_build_array(jsonb_build_object(
    'product_id', v_product, 'quantity', 10, 'unit_cost', 60
  ));

  v_receipt := public.confirm_goods_receipt(
    v_wh, 'purchase_pending_invoice', v_lines, 'gr-int-1', v_supplier, NULL
  );

  v_supplier_inv := public.post_supplier_invoice_for_receipt(v_receipt, 'PROV-1001', 'sinv-int-1');

  v_lines := jsonb_build_array(jsonb_build_object(
    'product_id', v_product, 'quantity', 3, 'unit_price', 100, 'discount', 0
  ));
  v_inv_cash := public.confirm_pos_sale('pos-cash-1', v_wh, 'cash', 300, v_lines);
  IF public.confirm_pos_sale('pos-cash-1', v_wh, 'cash', 300, v_lines) <> v_inv_cash THEN
    RAISE EXCEPTION 'Idempotencia POS: segundo intento debe devolver mismo id';
  END IF;

  BEGIN
    PERFORM public.confirm_pos_sale('pos-cash-1', v_wh, 'cash', 299, v_lines);
    RAISE EXCEPTION 'Idempotencia POS: debió rechazar payload distinto';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%contenido distinto%' THEN
      RAISE;
    END IF;
  END;

  v_lines := jsonb_build_array(jsonb_build_object(
    'product_id', v_product, 'quantity', 2, 'unit_price', 100, 'discount', 0
  ));
  v_inv_credit := public.confirm_pos_sale('pos-credit-1', v_wh, 'credit', NULL, v_lines);

  v_payment := public.collect_customer_payment(v_inv_credit, 120, 'pay-int-1');

  v_lines := jsonb_build_array(jsonb_build_object(
    'product_id', v_product, 'quantity', 6, 'unit_price', 100, 'discount', 0
  ));
  BEGIN
    PERFORM public.confirm_pos_sale('pos-fail-stock', v_wh, 'cash', 600, v_lines);
    RAISE EXCEPTION 'Debió fallar por existencia insuficiente (5 unidades restantes)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Existencia insuficiente%' THEN
      RAISE;
    END IF;
  END;

  SELECT COUNT(*) INTO v_j_before FROM public.journal_entries WHERE company_id = v_company;
  PERFORM public.request_reprint_for_document(
    'sales_invoice', v_inv_cash, 'sales_receipt', 'pdf_download', 'reprint-int-1', NULL
  );
  SELECT COUNT(*) INTO v_j_after FROM public.journal_entries WHERE company_id = v_company;
  IF v_j_before <> v_j_after THEN
    RAISE EXCEPTION 'Reimpresión alteró asientos contables';
  END IF;

  SELECT quantity INTO v_qty FROM public.inventory_balances WHERE warehouse_id = v_wh AND product_id = v_product;
  IF v_qty <> 5 THEN
    RAISE EXCEPTION 'Existencia esperada 5, obtenida %', v_qty;
  END IF;

  v_inv_val := (SELECT quantity * avg_unit_cost FROM public.inventory_balances WHERE warehouse_id = v_wh AND product_id = v_product);
  v_cash := public.account_balance_for_code(v_company, '1000');
  v_ar := public.account_balance_for_code(v_company, '1100');
  v_ap := public.account_balance_for_code(v_company, '2000');
  v_sales := public.account_balance_for_code(v_company, '4000');
  v_cogs := public.account_balance_for_code(v_company, '5000');
  v_inv_gl := public.account_balance_for_code(v_company, '1200');

  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
  INTO v_debit, v_credit
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.company_id = v_company AND je.status = 'confirmed';

  IF v_cash <> 420 THEN RAISE EXCEPTION 'Caja esperada 420, obtenida %', v_cash; END IF;
  IF v_ar <> 80 THEN RAISE EXCEPTION 'CxC esperada 80, obtenida %', v_ar; END IF;
  IF v_ap <> 600 THEN RAISE EXCEPTION 'CxP esperada 600, obtenida %', v_ap; END IF;
  IF v_sales <> 500 THEN RAISE EXCEPTION 'Ventas netas esperadas 500, obtenidas %', v_sales; END IF;
  IF v_cogs <> 300 THEN RAISE EXCEPTION 'COGS esperado 300, obtenido %', v_cogs; END IF;
  IF v_inv_val <> 300 OR v_inv_gl <> 300 THEN
    RAISE EXCEPTION 'Inventario esperado 300, libro % gl %', v_inv_val, v_inv_gl;
  END IF;
  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'Asientos desbalanceados: D % C %', v_debit, v_credit;
  END IF;

  INSERT INTO public.companies (commercial_name, country_code, timezone, primary_currency_code, is_demo)
  VALUES ('INTEGRATION TEST CO B', 'TC', 'America/Grand_Turk', 'USD', true)
  RETURNING id INTO v_company_b;

  IF EXISTS (
    SELECT 1 FROM public.sales_invoices si
    WHERE si.company_id = v_company_b AND si.id = v_inv_cash
  ) THEN
    RAISE EXCEPTION 'Aislamiento entre empresas falló';
  END IF;

  v_rec := public.get_financial_reconciliation();

  RETURN jsonb_build_object(
    'status', 'passed',
    'scenario', jsonb_build_object(
      'purchase_units', 10,
      'unit_cost', 60,
      'cash_sale_units', 3,
      'credit_sale_units', 2,
      'partial_payment', 120
    ),
    'expected_vs_actual', jsonb_build_array(
      jsonb_build_object('metric', 'inventory_units', 'expected', 5, 'actual', v_qty),
      jsonb_build_object('metric', 'inventory_value', 'expected', 300, 'actual', v_inv_val),
      jsonb_build_object('metric', 'cash', 'expected', 420, 'actual', v_cash),
      jsonb_build_object('metric', 'accounts_receivable', 'expected', 80, 'actual', v_ar),
      jsonb_build_object('metric', 'accounts_payable', 'expected', 600, 'actual', v_ap),
      jsonb_build_object('metric', 'net_sales', 'expected', 500, 'actual', v_sales),
      jsonb_build_object('metric', 'cost_of_goods_sold', 'expected', 300, 'actual', v_cogs),
      jsonb_build_object('metric', 'gross_profit', 'expected', 200, 'actual', v_sales - v_cogs),
      jsonb_build_object('metric', 'journal_debits', 'expected', v_debit, 'actual', v_debit),
      jsonb_build_object('metric', 'journal_credits', 'expected', v_credit, 'actual', v_credit)
    ),
    'reconciliation_snapshot', v_rec,
    'entities', jsonb_build_object(
      'goods_receipt_id', v_receipt,
      'supplier_invoice_id', v_supplier_inv,
      'cash_invoice_id', v_inv_cash,
      'credit_invoice_id', v_inv_credit,
      'payment_id', v_payment
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_commercial_integration_tests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_commercial_integration_tests() TO service_role;
