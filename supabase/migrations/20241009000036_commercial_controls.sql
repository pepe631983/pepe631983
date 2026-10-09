-- Bloqueo reversión aislada de asientos comerciales, períodos en compras, devoluciones crédito

CREATE OR REPLACE FUNCTION public.is_commercial_journal_source(p_source_document_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_source_document_type, '') IN (
    'sales_invoice', 'customer_payment', 'goods_receipt', 'supplier_invoice',
    'sales_return', 'cash_session'
  );
$$;

CREATE OR REPLACE FUNCTION public.reverse_journal_entry(
  p_entry_id UUID,
  p_reason TEXT,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_src RECORD;
  v_rev_id UUID;
  v_ln RECORD;
  v_n SMALLINT := 0;
  v_existing UUID;
BEGIN
  PERFORM public.require_permission('document.reverse');
  PERFORM public.require_open_accounting_period(CURRENT_DATE);
  v_company := public.current_company_id();

  SELECT result_entity_id INTO v_existing FROM public.operation_idempotency
  WHERE company_id = v_company AND operation = 'journal_reversal' AND idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_src FROM public.journal_entries
  WHERE id = p_entry_id AND company_id = v_company AND status = 'confirmed' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asiento no encontrado';
  END IF;

  IF public.is_commercial_journal_source(v_src.source_document_type) THEN
    RAISE EXCEPTION
      'Reversión aislada no permitida para documento comercial (%). Use anulación integral del documento o contacte soporte.',
      v_src.source_document_type;
  END IF;

  IF v_src.reversed_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'Asiento ya es reversión';
  END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.reversed_entry_id = p_entry_id) THEN
    RAISE EXCEPTION 'Asiento ya fue revertido';
  END IF;

  INSERT INTO public.journal_entries (
    company_id, status, description, source_document_type, source_document_id,
    idempotency_key, reversed_entry_id, created_by, confirmed_at, entry_date
  ) VALUES (
    v_company, 'confirmed', 'Reversión: ' || v_src.description,
    v_src.source_document_type, v_src.source_document_id,
    p_idempotency_key, p_entry_id, auth.uid(), now(), v_src.entry_date
  ) RETURNING id INTO v_rev_id;

  FOR v_ln IN
    SELECT * FROM public.journal_lines WHERE journal_entry_id = p_entry_id ORDER BY line_number
  LOOP
    v_n := v_n + 1;
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo)
    VALUES (v_rev_id, v_company, v_ln.account_id, v_n, v_ln.credit, v_ln.debit, 'Reversión: ' || COALESCE(v_ln.memo, ''));
  END LOOP;

  PERFORM public.assert_journal_balanced(v_rev_id);
  INSERT INTO public.operation_idempotency (company_id, operation, idempotency_key, payload_hash, result_entity_id)
  VALUES (v_company, 'journal_reversal', p_idempotency_key, md5(p_entry_id::text || p_reason), v_rev_id);
  PERFORM public.log_audit('accounting.journal.reversed', 'journal_entry', v_rev_id, p_reason);
  RETURN v_rev_id;
END;
$$;

-- Período abierto obligatorio en recepciones (incluye ajustes vía receipt_kind)
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
  PERFORM public.require_open_accounting_period(CURRENT_DATE);
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

-- Período abierto en factura proveedor (copia canónica 5-arg + check)
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
  v_grni_open money_amount;
  v_grni_clear money_amount;
  v_invoice_total money_amount;
  v_variance money_amount;
  v_policy public.supplier_invoice_variance_policy;
  v_recv_qty quantity_amount;
  v_sold_qty quantity_amount;
  v_ratio numeric;
  v_v_inv money_amount := 0;
  v_v_exp money_amount := 0;
  v_invoice_id UUID;
  v_existing UUID;
  v_hash TEXT;
  v_journal_id UUID;
  v_acct_grni UUID;
  v_acct_ap UUID;
  v_acct_variance UUID;
  v_acct_inventory UUID;
  v_ln SMALLINT := 0;
BEGIN
  PERFORM public.require_permission('purchase.post');
  PERFORM public.require_open_accounting_period(CURRENT_DATE);
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

  SELECT bp.supplier_invoice_variance_policy INTO v_policy
  FROM public.business_policies bp WHERE bp.company_id = v_company;
  IF NOT FOUND THEN
    v_policy := 'split_sold_and_remaining';
  END IF;

  IF v_policy = 'split_sold_and_remaining' AND v_variance <> 0 THEN
    SELECT COALESCE(SUM(quantity), 0) INTO v_recv_qty
    FROM public.goods_receipt_lines WHERE goods_receipt_id = p_goods_receipt_id;
    v_sold_qty := public.receipt_sold_qty_since_receipt(p_goods_receipt_id);
    IF v_recv_qty > 0 THEN
      v_ratio := LEAST(1, GREATEST(0, v_sold_qty / v_recv_qty));
      v_v_exp := round(v_variance * v_ratio, 4);
      v_v_inv := v_variance - v_v_exp;
      IF v_sold_qty >= v_recv_qty THEN
        v_v_exp := v_variance;
        v_v_inv := 0;
      ELSIF v_sold_qty <= 0 THEN
        v_v_exp := 0;
        v_v_inv := v_variance;
      END IF;
    ELSE
      v_v_exp := v_variance;
      v_v_inv := 0;
    END IF;
  ELSE
    v_v_exp := v_variance;
    v_v_inv := 0;
  END IF;

  INSERT INTO public.supplier_invoices (
    company_id, supplier_id, invoice_number, goods_receipt_id, total,
    idempotency_key, grni_cleared, cost_variance, variance_to_inventory, variance_to_expense_sold
  ) VALUES (
    v_company, v_receipt.supplier_id, p_supplier_invoice_number, p_goods_receipt_id, v_invoice_total,
    p_idempotency_key, v_grni_clear, v_variance, v_v_inv, v_v_exp
  ) RETURNING id INTO v_invoice_id;

  SELECT id INTO v_acct_grni FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1210';
  SELECT id INTO v_acct_ap FROM public.chart_of_accounts WHERE company_id = v_company AND code = '2000';
  SELECT id INTO v_acct_variance FROM public.chart_of_accounts WHERE company_id = v_company AND code = '6200';
  SELECT id INTO v_acct_inventory FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1200';

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

  IF v_v_inv > 0 THEN
    v_ln := v_ln + 1;
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo)
    VALUES (v_journal_id, v_company, v_acct_inventory, v_ln, v_v_inv, 0, 'Variación a inventario');
  END IF;
  IF v_v_exp > 0 THEN
    v_ln := v_ln + 1;
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo)
    VALUES (v_journal_id, v_company, v_acct_variance, v_ln, v_v_exp, 0, 'Variación vendido');
  END IF;

  v_ln := v_ln + 1;
  INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo)
  VALUES (v_journal_id, v_company, v_acct_ap, v_ln, 0, v_invoice_total, 'Cuentas por pagar');

  PERFORM public.apply_supplier_invoice_variance_to_inventory(p_goods_receipt_id, v_v_inv);
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
