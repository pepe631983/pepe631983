-- Facturación parcial proveedor, variación costo provisional vs facturado, clientes/proveedores RPC, conciliación por fecha

CREATE TABLE IF NOT EXISTS public.database_capabilities (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO public.database_capabilities (key, value)
VALUES ('integration_tests_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.integration_tests_enabled()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT value FROM public.database_capabilities WHERE key = 'integration_tests_enabled'),
    'false'
  ) = 'true';
$$;

REVOKE ALL ON FUNCTION public.integration_tests_enabled() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.integration_tests_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_tests_enabled() TO service_role;

ALTER TABLE public.goods_receipts
  ADD COLUMN IF NOT EXISTS grni_open_amount money_amount NOT NULL DEFAULT 0;

ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS grni_cleared money_amount NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_variance money_amount NOT NULL DEFAULT 0;

UPDATE public.goods_receipts gr
SET grni_open_amount = GREATEST(
  0,
  (SELECT COALESCE(SUM(l.extended_cost), 0) FROM public.goods_receipt_lines l WHERE l.goods_receipt_id = gr.id)
  - (SELECT COALESCE(SUM(si.grni_cleared), 0) FROM public.supplier_invoices si WHERE si.goods_receipt_id = gr.id)
)
WHERE gr.receipt_kind = 'purchase_pending_invoice';

COMMENT ON COLUMN public.supplier_invoices.cost_variance IS
  'Diferencia factura vs costo provisional en GRNI; positivo = factura mayor (cargo a 6200).';

CREATE OR REPLACE FUNCTION public.create_supplier(p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_id UUID;
BEGIN
  PERFORM public.require_permission('purchase.create');
  v_company := public.current_company_id();
  INSERT INTO public.suppliers (company_id, name) VALUES (v_company, trim(p_name))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_customer(p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_id UUID;
BEGIN
  PERFORM public.require_permission('sales.confirm');
  v_company := public.current_company_id();
  INSERT INTO public.customers (company_id, name) VALUES (v_company, trim(p_name))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_supplier TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer TO authenticated;

DROP POLICY IF EXISTS suppliers_insert ON public.suppliers;
CREATE POLICY suppliers_insert ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('purchase.create'));

DROP POLICY IF EXISTS customers_insert ON public.customers;
CREATE POLICY customers_insert ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('sales.confirm'));

-- Actualizar recepción: abrir GRNI pendiente
CREATE OR REPLACE FUNCTION public.confirm_goods_receipt(
  p_warehouse_id UUID,
  p_receipt_kind public.goods_receipt_kind,
  p_lines JSONB,
  p_idempotency_key TEXT,
  p_supplier_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_branch UUID;
  v_receipt_id UUID;
  v_existing UUID;
  v_hash TEXT;
  v_stored_hash TEXT;
  v_line JSONB;
  v_idx SMALLINT := 0;
  v_product_id UUID;
  v_qty quantity_amount;
  v_unit_cost money_amount;
  v_ext money_amount;
  v_total_cost money_amount := 0;
  v_receipt_number TEXT;
  v_journal_id UUID;
  v_acct_inventory UUID;
  v_acct_grni UUID;
  v_acct_capital UUID;
  v_acct_inv_diff UUID;
  v_old_qty quantity_amount;
  v_old_cost money_amount;
  v_new_avg money_amount;
BEGIN
  PERFORM public.require_permission('purchase.post');
  v_company := public.current_company_id();
  v_hash := md5(COALESCE(p_lines::text, ''));

  SELECT result_entity_id INTO v_existing FROM public.operation_idempotency
  WHERE company_id = v_company AND operation = 'goods_receipt' AND idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    SELECT payload_hash INTO v_stored_hash FROM public.operation_idempotency
    WHERE company_id = v_company AND operation = 'goods_receipt' AND idempotency_key = p_idempotency_key;
    IF v_stored_hash <> v_hash THEN
      RAISE EXCEPTION 'Clave de idempotencia reutilizada con contenido distinto';
    END IF;
    RETURN v_existing;
  END IF;

  IF p_receipt_kind = 'purchase_pending_invoice' AND p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Indique proveedor para recepción de compra';
  END IF;
  IF p_receipt_kind = 'opening_balance' AND (p_reason IS NULL OR length(trim(p_reason)) < 5) THEN
    RAISE EXCEPTION 'Saldo inicial requiere motivo documentado';
  END IF;

  SELECT b.id INTO v_branch FROM public.warehouses w
  JOIN public.branches b ON b.id = w.branch_id
  WHERE w.id = p_warehouse_id AND w.company_id = v_company;

  SELECT id INTO v_acct_inventory FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1200';
  SELECT id INTO v_acct_grni FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1210';
  SELECT id INTO v_acct_capital FROM public.chart_of_accounts WHERE company_id = v_company AND code = '3000';
  SELECT id INTO v_acct_inv_diff FROM public.chart_of_accounts WHERE company_id = v_company AND code = '6200';

  v_receipt_number := public.next_document_number(v_company, 'goods_receipt', v_branch);

  INSERT INTO public.goods_receipts (
    company_id, warehouse_id, supplier_id, receipt_kind, receipt_number, status,
    idempotency_key, reason, created_by, confirmed_at, grni_open_amount
  ) VALUES (
    v_company, p_warehouse_id, p_supplier_id, p_receipt_kind, v_receipt_number, 'confirmed',
    p_idempotency_key, p_reason, auth.uid(), now(),
    CASE WHEN p_receipt_kind = 'purchase_pending_invoice' THEN 0 ELSE 0 END
  ) RETURNING id INTO v_receipt_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_idx := v_idx + 1;
    v_product_id := (v_line->>'product_id')::uuid;
    v_qty := (v_line->>'quantity')::numeric;
    v_unit_cost := (v_line->>'unit_cost')::numeric;
    IF p_receipt_kind = 'adjustment_out' THEN
      v_qty := -abs(v_qty);
      v_unit_cost := abs(v_unit_cost);
    ELSE
      v_qty := abs(v_qty);
    END IF;
    v_ext := abs(v_qty) * v_unit_cost;
    v_total_cost := v_total_cost + v_ext;

    INSERT INTO public.goods_receipt_lines (
      goods_receipt_id, company_id, product_id, line_number, quantity, unit_cost, extended_cost
    ) VALUES (
      v_receipt_id, v_company, v_product_id, v_idx, abs(v_qty), v_unit_cost, v_ext
    );

    SELECT quantity, avg_unit_cost INTO v_old_qty, v_old_cost
    FROM public.inventory_balances
    WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id
    FOR UPDATE;

    IF p_receipt_kind = 'adjustment_out' THEN
      IF v_old_qty IS NULL OR v_old_qty < abs(v_qty) THEN
        RAISE EXCEPTION 'Ajuste de salida excede existencia';
      END IF;
      UPDATE public.inventory_balances SET quantity = quantity - abs(v_qty), updated_at = now()
      WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id;
    ELSE
      IF NOT FOUND THEN
        INSERT INTO public.inventory_balances (company_id, warehouse_id, product_id, quantity, avg_unit_cost)
        VALUES (v_company, p_warehouse_id, v_product_id, v_qty, v_unit_cost);
      ELSE
        v_new_avg := ((v_old_qty * v_old_cost) + (v_qty * v_unit_cost)) / (v_old_qty + v_qty);
        UPDATE public.inventory_balances
        SET quantity = quantity + v_qty, avg_unit_cost = v_new_avg, updated_at = now()
        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id;
      END IF;
    END IF;

    IF public.integration_tests_enabled()
       AND current_setting('integration_test.abort_after_movements', true) = '1' THEN
      RAISE EXCEPTION 'integration_test: aborto simulado post-movimientos';
    END IF;

    INSERT INTO public.inventory_movements (
      company_id, warehouse_id, product_id, movement_kind, quantity_delta,
      unit_cost, extended_cost, source_document_type, source_document_id
    ) VALUES (
      v_company, p_warehouse_id, v_product_id,
      CASE WHEN p_receipt_kind IN ('adjustment_in', 'adjustment_out') THEN 'adjustment' ELSE 'receipt' END,
      CASE WHEN p_receipt_kind = 'adjustment_out' THEN -abs(v_qty) ELSE v_qty END,
      v_unit_cost, v_ext, 'goods_receipt', v_receipt_id
    );
  END LOOP;

  IF p_receipt_kind = 'purchase_pending_invoice' THEN
    UPDATE public.goods_receipts SET grni_open_amount = v_total_cost WHERE id = v_receipt_id;
  END IF;

  INSERT INTO public.journal_entries (
    company_id, status, description, source_document_type, source_document_id,
    idempotency_key, created_by, confirmed_at
  ) VALUES (
    v_company, 'confirmed', 'Recepción ' || v_receipt_number,
    'goods_receipt', v_receipt_id, 'je-gr-' || p_idempotency_key, auth.uid(), now()
  ) RETURNING id INTO v_journal_id;

  IF p_receipt_kind = 'purchase_pending_invoice' THEN
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
      (v_journal_id, v_company, v_acct_inventory, 1, v_total_cost, 0, 'Entrada inventario compra'),
      (v_journal_id, v_company, v_acct_grni, 2, 0, v_total_cost, 'Mercancía recibida pendiente factura');
  ELSIF p_receipt_kind = 'opening_balance' THEN
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
      (v_journal_id, v_company, v_acct_inventory, 1, v_total_cost, 0, 'Saldo inicial inventario'),
      (v_journal_id, v_company, v_acct_capital, 2, 0, v_total_cost, 'Contrapartida saldo inicial');
  ELSIF p_receipt_kind = 'adjustment_in' THEN
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
      (v_journal_id, v_company, v_acct_inventory, 1, v_total_cost, 0, 'Ajuste entrada'),
      (v_journal_id, v_company, v_acct_inv_diff, 2, 0, v_total_cost, 'Diferencia inventario');
  ELSE
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
      (v_journal_id, v_company, v_acct_inv_diff, 1, v_total_cost, 0, 'Ajuste salida'),
      (v_journal_id, v_company, v_acct_inventory, 2, 0, v_total_cost, 'Salida inventario');
  END IF;

  PERFORM public.assert_journal_balanced(v_journal_id);
  UPDATE public.goods_receipts SET journal_entry_id = v_journal_id WHERE id = v_receipt_id;

  INSERT INTO public.operation_idempotency (company_id, operation, idempotency_key, payload_hash, result_entity_id)
  VALUES (v_company, 'goods_receipt', p_idempotency_key, v_hash, v_receipt_id);

  PERFORM public.log_audit('goods_receipt.confirmed', 'goods_receipt', v_receipt_id, p_reason);
  RETURN v_receipt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_supplier_invoice_for_receipt(
  p_goods_receipt_id UUID,
  p_supplier_invoice_number TEXT,
  p_idempotency_key TEXT,
  p_invoice_total money_amount DEFAULT NULL,
  p_grni_amount_to_clear money_amount DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_receipt RECORD;
  v_receipt_cost money_amount;
  v_grni_open money_amount;
  v_grni_clear money_amount;
  v_invoice_total money_amount;
  v_variance money_amount;
  v_invoice_id UUID;
  v_existing UUID;
  v_hash TEXT;
  v_journal_id UUID;
  v_acct_grni UUID;
  v_acct_ap UUID;
  v_acct_variance UUID;
  v_ln SMALLINT := 0;
BEGIN
  PERFORM public.require_permission('purchase.post');
  v_company := public.current_company_id();

  v_hash := md5(
    p_goods_receipt_id::text || '|' || p_supplier_invoice_number || '|'
    || COALESCE(p_invoice_total::text, '') || '|' || COALESCE(p_grni_amount_to_clear::text, '')
  );

  SELECT result_entity_id INTO v_existing FROM public.operation_idempotency
  WHERE company_id = v_company AND operation = 'supplier_invoice' AND idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    IF (SELECT payload_hash FROM public.operation_idempotency
        WHERE company_id = v_company AND operation = 'supplier_invoice' AND idempotency_key = p_idempotency_key) <> v_hash THEN
      RAISE EXCEPTION 'Clave de idempotencia reutilizada con contenido distinto';
    END IF;
    RETURN v_existing;
  END IF;

  SELECT * INTO v_receipt FROM public.goods_receipts
  WHERE id = p_goods_receipt_id AND company_id = v_company AND status = 'confirmed' FOR UPDATE;

  IF NOT FOUND OR v_receipt.receipt_kind <> 'purchase_pending_invoice' THEN
    RAISE EXCEPTION 'Recepción de compra pendiente no válida';
  END IF;

  SELECT COALESCE(SUM(extended_cost), 0) INTO v_receipt_cost
  FROM public.goods_receipt_lines WHERE goods_receipt_id = p_goods_receipt_id;

  v_grni_open := v_receipt.grni_open_amount;
  IF v_grni_open <= 0 THEN
    RAISE EXCEPTION 'No queda GRNI por facturar en esta recepción';
  END IF;

  v_grni_clear := COALESCE(p_grni_amount_to_clear, v_grni_open);
  IF v_grni_clear <= 0 OR v_grni_clear > v_grni_open THEN
    RAISE EXCEPTION 'Monto GRNI a liquidar inválido (abierto %)', v_grni_open;
  END IF;

  v_invoice_total := COALESCE(p_invoice_total, v_grni_clear);
  IF v_invoice_total <= 0 THEN
    RAISE EXCEPTION 'Total de factura inválido';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.supplier_invoices si
    WHERE si.company_id = v_company AND si.goods_receipt_id = p_goods_receipt_id
      AND si.invoice_number = p_supplier_invoice_number
  ) THEN
    RAISE EXCEPTION 'Número de factura duplicado para esta recepción';
  END IF;

  v_variance := v_invoice_total - v_grni_clear;

  INSERT INTO public.supplier_invoices (
    company_id, supplier_id, invoice_number, goods_receipt_id, total,
    idempotency_key, grni_cleared, cost_variance
  ) VALUES (
    v_company, v_receipt.supplier_id, p_supplier_invoice_number, p_goods_receipt_id, v_invoice_total,
    p_idempotency_key, v_grni_clear, v_variance
  ) RETURNING id INTO v_invoice_id;

  SELECT id INTO v_acct_grni FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1210';
  SELECT id INTO v_acct_ap FROM public.chart_of_accounts WHERE company_id = v_company AND code = '2000';
  SELECT id INTO v_acct_variance FROM public.chart_of_accounts WHERE company_id = v_company AND code = '6200';

  INSERT INTO public.journal_entries (
    company_id, status, description, source_document_type, source_document_id,
    idempotency_key, created_by, confirmed_at
  ) VALUES (
    v_company, 'confirmed', 'Factura proveedor ' || p_supplier_invoice_number,
    'supplier_invoice', v_invoice_id, 'je-sinv-' || p_idempotency_key, auth.uid(), now()
  ) RETURNING id INTO v_journal_id;

  v_ln := 1;
  INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo)
  VALUES (v_journal_id, v_company, v_acct_grni, v_ln, v_grni_clear, 0, 'Cierra GRNI provisional');

  IF v_variance > 0 THEN
    v_ln := v_ln + 1;
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo)
    VALUES (v_journal_id, v_company, v_acct_variance, v_ln, v_variance, 0, 'Variación costo factura vs recepción');
  ELSIF v_variance < 0 THEN
    v_ln := v_ln + 1;
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo)
    VALUES (v_journal_id, v_company, v_acct_variance, v_ln, 0, abs(v_variance), 'Variación favorable compra');
  END IF;

  v_ln := v_ln + 1;
  INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo)
  VALUES (v_journal_id, v_company, v_acct_ap, v_ln, 0, v_invoice_total, 'Cuentas por pagar');

  PERFORM public.assert_journal_balanced(v_journal_id);
  UPDATE public.supplier_invoices SET journal_entry_id = v_journal_id WHERE id = v_invoice_id;

  UPDATE public.goods_receipts
  SET grni_open_amount = grni_open_amount - v_grni_clear
  WHERE id = p_goods_receipt_id;

  INSERT INTO public.operation_idempotency (company_id, operation, idempotency_key, payload_hash, result_entity_id)
  VALUES (v_company, 'supplier_invoice', p_idempotency_key, v_hash, v_invoice_id);

  RETURN v_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_financial_reconciliation(p_as_of DATE DEFAULT CURRENT_DATE)
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
    END, 0)
  INTO v_inv_gl
  FROM public.journal_lines jl
  JOIN public.chart_of_accounts coa ON coa.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.company_id = v_company AND coa.code = '1200' AND je.status = 'confirmed'
    AND je.entry_date <= p_as_of;

  v_cash_gl := public.account_balance_for_code_as_of(v_company, '1000', p_as_of);
  v_ar_gl := public.account_balance_for_code_as_of(v_company, '1100', p_as_of);
  v_ap_gl := public.account_balance_for_code_as_of(v_company, '2000', p_as_of);
  v_sales_gl := public.account_balance_for_code_as_of(v_company, '4000', p_as_of);
  v_cogs_gl := public.account_balance_for_code_as_of(v_company, '5000', p_as_of);

  SELECT COALESCE(SUM(total - amount_paid), 0) INTO v_ar_ops
  FROM public.sales_invoices
  WHERE company_id = v_company AND status = 'confirmed' AND payment_kind = 'credit'
    AND confirmed_at::date <= p_as_of;

  SELECT COALESCE(SUM(jl.debit), 0), COALESCE(SUM(jl.credit), 0)
  INTO v_debit, v_credit
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.company_id = v_company AND je.status = 'confirmed' AND je.entry_date <= p_as_of;

  v_gross := v_sales_gl - v_cogs_gl;

  RETURN jsonb_build_object(
    'as_of', p_as_of,
    'company_id', v_company,
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
        'confirmed_at', je.confirmed_at,
        'entry_date', je.entry_date
      ) ORDER BY je.confirmed_at NULLS LAST), '[]'::jsonb)
      FROM public.journal_entries je
      WHERE je.company_id = v_company AND je.status = 'confirmed' AND je.entry_date <= p_as_of
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.account_balance_for_code_as_of(
  p_company_id UUID,
  p_code TEXT,
  p_as_of DATE
)
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
    AND je.entry_date <= p_as_of
  GROUP BY coa.account_type;
$$;

GRANT EXECUTE ON FUNCTION public.get_financial_reconciliation(DATE) TO authenticated;

-- Gancho de prueba: aborto antes del asiento (solo si integration_tests_enabled)
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

  IF public.integration_tests_enabled()
     AND current_setting('integration_test.abort_before_journal', true) = '1' THEN
    RAISE EXCEPTION 'integration_test: aborto simulado pre-asiento';
  END IF;

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
