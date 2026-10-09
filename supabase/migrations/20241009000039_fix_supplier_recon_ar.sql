-- Corrige post_supplier (función canónica), CxC operacional con devoluciones, períodos en bootstrap IT

ALTER TABLE public.sales_returns
  ADD COLUMN IF NOT EXISTS refund_to_ar money_amount NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_to_store_credit money_amount NOT NULL DEFAULT 0;

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

  INSERT INTO public.accounting_periods (company_id, name, period_start, period_end, status)
  VALUES (
    v_company,
    to_char(CURRENT_DATE, 'YYYY-MM'),
    date_trunc('month', CURRENT_DATE)::date,
    (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date,
    'open'
  );

  SELECT r.id INTO v_role FROM public.roles r WHERE r.company_id = v_company AND r.code = p_role_code;
  INSERT INTO public.user_roles (user_id, role_id) VALUES (p_user, v_role);

  company_id := v_company;
  branch_id := v_branch;
  warehouse_id := v_wh;
  role_id := v_role;
  RETURN NEXT;
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
    VALUES (v_journal_id, v_company, v_acct_inventory, v_ln, v_v_inv, 0, 'Variación capitalizada en existencia restante');
  ELSIF v_v_inv < 0 THEN
    v_ln := v_ln + 1;
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo)
    VALUES (v_journal_id, v_company, v_acct_inventory, v_ln, 0, abs(v_v_inv), 'Variación favorable en existencia');
  END IF;

  IF v_v_exp > 0 THEN
    v_ln := v_ln + 1;
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo)
    VALUES (v_journal_id, v_company, v_acct_variance, v_ln, v_v_exp, 0, 'Variación en unidades ya vendidas');
  ELSIF v_v_exp < 0 THEN
    v_ln := v_ln + 1;
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo)
    VALUES (v_journal_id, v_company, v_acct_variance, v_ln, 0, abs(v_v_exp), 'Variación favorable unidades vendidas');
  END IF;

  v_ln := v_ln + 1;
  INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo)
  VALUES (v_journal_id, v_company, v_acct_ap, v_ln, 0, v_invoice_total, 'Cuentas por pagar');

  PERFORM public.assert_journal_balanced(v_journal_id);
  UPDATE public.supplier_invoices SET journal_entry_id = v_journal_id WHERE id = v_invoice_id;

  PERFORM public.apply_remaining_inventory_cost_adjustment(p_goods_receipt_id, v_v_inv);

  UPDATE public.goods_receipts
  SET grni_open_amount = grni_open_amount - v_grni_clear
  WHERE id = p_goods_receipt_id;

  INSERT INTO public.operation_idempotency (company_id, operation, idempotency_key, payload_hash, result_entity_id)
  VALUES (v_company, 'supplier_invoice', p_idempotency_key, v_hash, v_invoice_id);

  RETURN v_invoice_id;
END;
$$;

-- Persistir reparto devolución crédito y conciliar CxC operacional
CREATE OR REPLACE FUNCTION public.confirm_sales_return(
  p_idempotency_key TEXT,
  p_original_invoice_id UUID,
  p_lines JSONB,
  p_refund_kind TEXT,
  p_cash_session_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_inv RECORD;
  v_return_id UUID;
  v_existing UUID;
  v_hash TEXT;
  v_line JSONB;
  v_sil RECORD;
  v_qty quantity_amount;
  v_return_net money_amount := 0;
  v_return_tax money_amount := 0;
  v_refund_total money_amount := 0;
  v_cost_rev money_amount := 0;
  v_line_net money_amount;
  v_line_tax money_amount;
  v_journal_id UUID;
  v_acct_cash UUID;
  v_acct_ar UUID;
  v_acct_sales UUID;
  v_acct_cogs UUID;
  v_acct_inventory UUID;
  v_acct_tax UUID;
  v_acct_credit UUID;
  v_return_number TEXT;
  v_prior_returns money_amount;
  v_open_ar money_amount;
  v_to_ar money_amount;
  v_to_store money_amount;
  v_ln SMALLINT;
BEGIN
  PERFORM public.require_permission('returns.process');
  PERFORM public.require_open_accounting_period(CURRENT_DATE);
  v_company := public.current_company_id();

  v_hash := md5(p_original_invoice_id::text || '|' || p_lines::text || '|' || p_refund_kind);

  SELECT result_entity_id INTO v_existing FROM public.operation_idempotency
  WHERE company_id = v_company AND operation = 'sales_return' AND idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_inv FROM public.sales_invoices
  WHERE id = p_original_invoice_id AND company_id = v_company AND status = 'confirmed' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura original no encontrada';
  END IF;

  IF p_refund_kind NOT IN ('cash', 'credit_balance') THEN
    RAISE EXCEPTION 'Tipo de reembolso inválido';
  END IF;

  IF v_inv.payment_kind = 'credit' AND p_refund_kind = 'cash' THEN
    RAISE EXCEPTION 'No se reembolsa efectivo en ventas a crédito; ajuste CxC y saldo a favor';
  END IF;

  IF p_refund_kind = 'cash' AND v_inv.payment_kind <> 'cash' THEN
    RAISE EXCEPTION 'Reembolso en efectivo solo para ventas al contado';
  END IF;

  IF p_refund_kind = 'cash' AND p_cash_session_id IS NULL THEN
    RAISE EXCEPTION 'Indique sesión de caja para reembolso en efectivo';
  END IF;

  IF p_refund_kind = 'credit_balance' AND v_inv.payment_kind = 'cash' AND v_inv.customer_id IS NULL THEN
    RAISE EXCEPTION 'Saldo a favor requiere cliente en la factura';
  END IF;

  IF p_cash_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cash_sessions cs
    WHERE cs.id = p_cash_session_id AND cs.company_id = v_company AND cs.status = 'open'
  ) THEN
    RAISE EXCEPTION 'Sesión de caja no válida';
  END IF;

  v_return_number := public.next_document_number(v_company, 'sales_return', v_inv.branch_id);

  INSERT INTO public.sales_returns (
    company_id, original_invoice_id, return_number, status, idempotency_key, reason
  ) VALUES (
    v_company, p_original_invoice_id, v_return_number, 'confirmed', p_idempotency_key, 'Devolución POS'
  ) RETURNING id INTO v_return_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := (v_line->>'quantity')::numeric;
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida en devolución';
    END IF;

    SELECT sil.* INTO v_sil
    FROM public.sales_invoice_lines sil
    WHERE sil.id = (v_line->>'sales_invoice_line_id')::uuid
      AND sil.sales_invoice_id = p_original_invoice_id
      AND sil.company_id = v_company
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Línea de factura no válida';
    END IF;

    IF v_qty > (v_sil.quantity - v_sil.quantity_returned) THEN
      RAISE EXCEPTION 'Cantidad de devolución excede lo vendido';
    END IF;

    v_line_net := public._round_money((v_sil.line_subtotal / v_sil.quantity) * v_qty);
    IF v_inv.applied_tax_rate_percent IS NOT NULL AND v_inv.applied_tax_rate_percent > 0 THEN
      v_line_tax := public._round_money(v_line_net * v_inv.applied_tax_rate_percent / 100.0);
    ELSE
      v_line_tax := 0;
    END IF;

    v_return_net := v_return_net + v_line_net;
    v_return_tax := v_return_tax + v_line_tax;
    v_cost_rev := v_cost_rev + (v_sil.unit_cost * v_qty);

    INSERT INTO public.sales_return_lines (
      sales_return_id, company_id, sales_invoice_line_id, quantity,
      refund_net, refund_tax, unit_cost_at_return, line_cost_reversal
    ) VALUES (
      v_return_id, v_company, v_sil.id, v_qty,
      v_line_net, v_line_tax, v_sil.unit_cost, v_sil.unit_cost * v_qty
    );

    UPDATE public.sales_invoice_lines
    SET quantity_returned = quantity_returned + v_qty
    WHERE id = v_sil.id;

    UPDATE public.inventory_balances ib
    SET quantity = quantity + v_qty,
        avg_unit_cost = CASE
          WHEN ib.quantity + v_qty = 0 THEN v_sil.unit_cost
          ELSE ((ib.quantity * ib.avg_unit_cost) + (v_qty * v_sil.unit_cost)) / (ib.quantity + v_qty)
        END,
        updated_at = now()
    WHERE ib.warehouse_id = v_inv.warehouse_id AND ib.product_id = v_sil.product_id;

    IF NOT FOUND THEN
      INSERT INTO public.inventory_balances (company_id, warehouse_id, product_id, quantity, avg_unit_cost)
      VALUES (v_company, v_inv.warehouse_id, v_sil.product_id, v_qty, v_sil.unit_cost);
    END IF;

    INSERT INTO public.inventory_movements (
      company_id, warehouse_id, product_id, movement_kind, quantity_delta,
      unit_cost, extended_cost, source_document_type, source_document_id
    ) VALUES (
      v_company, v_inv.warehouse_id, v_sil.product_id, 'return', v_qty,
      v_sil.unit_cost, v_sil.unit_cost * v_qty, 'sales_return', v_return_id
    );
  END LOOP;

  v_refund_total := v_return_net + v_return_tax;

  v_to_ar := 0;
  v_to_store := 0;
  IF v_inv.payment_kind = 'credit' THEN
    SELECT COALESCE(SUM(sr.refund_to_ar), 0) INTO v_prior_returns
    FROM public.sales_returns sr
    WHERE sr.original_invoice_id = p_original_invoice_id AND sr.status = 'confirmed' AND sr.id <> v_return_id;
    v_open_ar := v_inv.total - v_inv.amount_paid - v_prior_returns;
    v_to_ar := LEAST(v_refund_total, GREATEST(v_open_ar, 0));
    v_to_store := v_refund_total - v_to_ar;
    IF v_to_store > 0 AND v_inv.customer_id IS NULL THEN
      RAISE EXCEPTION 'Saldo a favor requiere cliente en la factura';
    END IF;
  END IF;

  UPDATE public.sales_returns
  SET total_refund = v_refund_total,
      confirmed_at = now(),
      refund_to_ar = v_to_ar,
      refund_to_store_credit = v_to_store
  WHERE id = v_return_id;

  SELECT id INTO v_acct_cash FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1000';
  SELECT id INTO v_acct_ar FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1100';
  SELECT id INTO v_acct_sales FROM public.chart_of_accounts WHERE company_id = v_company AND code = '4000';
  SELECT id INTO v_acct_cogs FROM public.chart_of_accounts WHERE company_id = v_company AND code = '5000';
  SELECT id INTO v_acct_inventory FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1200';
  v_acct_tax := public.ensure_company_tax_payable_account(v_company);
  v_acct_credit := public.ensure_company_customer_credit_account(v_company);

  INSERT INTO public.journal_entries (
    company_id, status, description, source_document_type, source_document_id,
    idempotency_key, created_by, confirmed_at
  ) VALUES (
    v_company, 'confirmed', 'Devolución ' || v_return_number,
    'sales_return', v_return_id,
    'je-ret-' || p_idempotency_key, auth.uid(), now()
  ) RETURNING id INTO v_journal_id;

  v_ln := 1;
  INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
    (v_journal_id, v_company, v_acct_sales, v_ln, v_return_net, 0, 'Reversa ingreso');

  IF v_return_tax > 0 THEN
    v_ln := v_ln + 1;
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
      (v_journal_id, v_company, v_acct_tax, v_ln, v_return_tax, 0, 'Reversa impuesto');
  END IF;

  IF p_refund_kind = 'cash' THEN
    v_ln := v_ln + 1;
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
      (v_journal_id, v_company, v_acct_cash, v_ln, 0, v_refund_total, 'Reembolso efectivo');
  ELSIF v_inv.payment_kind = 'credit' THEN
    IF v_to_ar > 0 THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
        (v_journal_id, v_company, v_acct_ar, v_ln, 0, v_to_ar, 'Reduce CxC');
    END IF;
    IF v_to_store > 0 THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
        (v_journal_id, v_company, v_acct_credit, v_ln, 0, v_to_store, 'Saldo a favor cliente');
      INSERT INTO public.customer_credit_balances (company_id, customer_id, balance, updated_at)
      VALUES (v_company, v_inv.customer_id, v_to_store, now())
      ON CONFLICT (company_id, customer_id) DO UPDATE
      SET balance = customer_credit_balances.balance + EXCLUDED.balance, updated_at = now();
    END IF;
  ELSE
    v_ln := v_ln + 1;
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
      (v_journal_id, v_company, v_acct_credit, v_ln, 0, v_refund_total, 'Saldo a favor');
    INSERT INTO public.customer_credit_balances (company_id, customer_id, balance, updated_at)
    VALUES (v_company, v_inv.customer_id, v_refund_total, now())
    ON CONFLICT (company_id, customer_id) DO UPDATE
    SET balance = customer_credit_balances.balance + EXCLUDED.balance, updated_at = now();
  END IF;

  v_ln := v_ln + 1;
  INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
    (v_journal_id, v_company, v_acct_inventory, v_ln, v_cost_rev, 0, 'Reingreso inventario');
  v_ln := v_ln + 1;
  INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
    (v_journal_id, v_company, v_acct_cogs, v_ln, 0, v_cost_rev, 'Reversa costo');

  PERFORM public.assert_journal_balanced(v_journal_id);
  UPDATE public.sales_returns SET journal_entry_id = v_journal_id WHERE id = v_return_id;

  IF p_refund_kind = 'cash' AND p_cash_session_id IS NOT NULL THEN
    INSERT INTO public.cash_movements (
      company_id, cash_session_id, movement_kind, amount,
      source_document_type, source_document_id, reason, created_by
    ) VALUES (
      v_company, p_cash_session_id, 'refund', v_refund_total,
      'sales_return', v_return_id, 'Devolución ' || v_return_number, auth.uid()
    );
    UPDATE public.cash_sessions SET expected_cash = expected_cash - v_refund_total WHERE id = p_cash_session_id;
  END IF;

  INSERT INTO public.operation_idempotency (company_id, operation, idempotency_key, payload_hash, result_entity_id)
  VALUES (v_company, 'sales_return', p_idempotency_key, v_hash, v_return_id);

  PERFORM public.log_audit('sales.return.confirmed', 'sales_return', v_return_id, NULL);
  RETURN v_return_id;
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
  v_cash_sess money_amount;
  v_open_session UUID;
  v_diffs JSONB := '[]'::jsonb;
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

  v_inv_gl := public.account_balance_for_code_as_of(v_company, '1200', p_as_of);
  v_cash_gl := public.account_balance_for_code_as_of(v_company, '1000', p_as_of);
  v_ar_gl := public.account_balance_for_code_as_of(v_company, '1100', p_as_of);
  v_ap_gl := public.account_balance_for_code_as_of(v_company, '2000', p_as_of);
  v_sales_gl := public.account_balance_for_code_as_of(v_company, '4000', p_as_of);
  v_cogs_gl := public.account_balance_for_code_as_of(v_company, '5000', p_as_of);

  SELECT COALESCE(SUM(
    si.total - si.amount_paid - COALESCE((
      SELECT SUM(sr.refund_to_ar) FROM public.sales_returns sr
      WHERE sr.original_invoice_id = si.id AND sr.status = 'confirmed'
    ), 0)
  ), 0) INTO v_ar_ops
  FROM public.sales_invoices si
  WHERE si.company_id = v_company AND si.status = 'confirmed' AND si.payment_kind = 'credit'
    AND si.confirmed_at::date <= p_as_of;

  SELECT COALESCE(SUM(jl.debit), 0), COALESCE(SUM(jl.credit), 0)
  INTO v_debit, v_credit
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.company_id = v_company AND je.status = 'confirmed' AND je.entry_date <= p_as_of;

  v_gross := v_sales_gl - v_cogs_gl;

  SELECT cs.id INTO v_open_session
  FROM public.cash_sessions cs
  WHERE cs.company_id = v_company AND cs.status = 'open'
  ORDER BY cs.opened_at DESC LIMIT 1;

  IF v_open_session IS NOT NULL THEN
    v_cash_sess := public._cash_session_expected(v_open_session);
  ELSE
    v_cash_sess := NULL;
  END IF;

  v_diffs := v_diffs || jsonb_build_object(
    'key', 'inventory_gl_vs_book',
    'label', 'Inventario libro vs contabilidad',
    'expected', v_inv_book,
    'actual', v_inv_gl,
    'delta', v_inv_book - v_inv_gl
  ) || jsonb_build_object(
    'key', 'ar_ops_vs_gl',
    'label', 'CxC operacional vs contabilidad',
    'expected', v_ar_ops,
    'actual', v_ar_gl,
    'delta', v_ar_ops - v_ar_gl
  ) || jsonb_build_object(
    'key', 'journal_balance',
    'label', 'Asientos cuadrados (débitos - créditos)',
    'expected', 0,
    'actual', v_debit - v_credit,
    'delta', v_debit - v_credit
  );

  IF v_cash_sess IS NOT NULL THEN
    v_diffs := v_diffs || jsonb_build_object(
      'key', 'cash_session_vs_gl',
      'label', 'Caja sesión abierta vs cuenta 1000',
      'expected', v_cash_sess,
      'actual', v_cash_gl,
      'delta', v_cash_sess - v_cash_gl
    );
  END IF;

  RETURN jsonb_build_object(
    'company_id', v_company,
    'as_of', p_as_of,
    'metrics', jsonb_build_object(
      'inventory_quantity', v_inv_qty,
      'inventory_units', v_inv_qty,
      'inventory_book_value', v_inv_book,
      'inventory_gl_balance', v_inv_gl,
      'inventory_gl', v_inv_gl,
      'cash_gl_balance', v_cash_gl,
      'cash_gl', v_cash_gl,
      'accounts_receivable_gl', v_ar_gl,
      'accounts_receivable_operational', v_ar_ops,
      'ar_operational_open', v_ar_ops,
      'accounts_payable_gl', v_ap_gl,
      'net_sales_gl', v_sales_gl,
      'cost_of_goods_sold_gl', v_cogs_gl,
      'cogs_gl', v_cogs_gl,
      'gross_profit', v_gross,
      'gross_profit_gl', v_gross,
      'journal_debits_total', v_debit,
      'journal_credits_total', v_credit,
      'journal_debit_total', v_debit,
      'journal_credit_total', v_credit,
      'open_cash_session_expected', v_cash_sess
    ),
    'differences', v_diffs,
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
