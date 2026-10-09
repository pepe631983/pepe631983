-- Devoluciones en facturas a crédito: reduce CxC hasta saldo abierto; excedente a saldo a favor (sin efectivo)

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

  UPDATE public.sales_returns
  SET total_refund = v_refund_total, confirmed_at = now()
  WHERE id = v_return_id;

  SELECT id INTO v_acct_cash FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1000';
  SELECT id INTO v_acct_ar FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1100';
  SELECT id INTO v_acct_sales FROM public.chart_of_accounts WHERE company_id = v_company AND code = '4000';
  SELECT id INTO v_acct_cogs FROM public.chart_of_accounts WHERE company_id = v_company AND code = '5000';
  SELECT id INTO v_acct_inventory FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1200';
  v_acct_tax := public.ensure_company_tax_payable_account(v_company);
  v_acct_credit := public.ensure_company_customer_credit_account(v_company);

  v_to_ar := 0;
  v_to_store := 0;
  IF v_inv.payment_kind = 'credit' THEN
    SELECT COALESCE(SUM(sr.total_refund), 0) INTO v_prior_returns
    FROM public.sales_returns sr
    WHERE sr.original_invoice_id = p_original_invoice_id AND sr.status = 'confirmed' AND sr.id <> v_return_id;
    v_open_ar := v_inv.total - v_inv.amount_paid - v_prior_returns;
    v_to_ar := LEAST(v_refund_total, GREATEST(v_open_ar, 0));
    v_to_store := v_refund_total - v_to_ar;
    IF v_to_store > 0 AND v_inv.customer_id IS NULL THEN
      RAISE EXCEPTION 'Saldo a favor requiere cliente en la factura';
    END IF;
  END IF;

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
