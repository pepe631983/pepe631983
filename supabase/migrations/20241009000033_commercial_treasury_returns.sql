-- Motor comercial: caja en ventas/cobros, impuesto configurable en documento, devoluciones

CREATE TABLE IF NOT EXISTS public.sales_return_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_return_id UUID NOT NULL REFERENCES public.sales_returns (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  sales_invoice_line_id UUID NOT NULL REFERENCES public.sales_invoice_lines (id) ON DELETE RESTRICT,
  quantity quantity_amount NOT NULL CHECK (quantity > 0),
  refund_net money_amount NOT NULL,
  refund_tax money_amount NOT NULL DEFAULT 0,
  unit_cost_at_return money_amount NOT NULL,
  line_cost_reversal money_amount NOT NULL
);

CREATE INDEX idx_sales_return_lines_return ON public.sales_return_lines (sales_return_id);

ALTER TABLE public.sales_return_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_return_lines_select ON public.sales_return_lines
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());

CREATE OR REPLACE FUNCTION public.ensure_company_customer_credit_account(p_company_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.chart_of_accounts
  WHERE company_id = p_company_id AND code = '2130';
  IF v_id IS NULL THEN
    INSERT INTO public.chart_of_accounts (company_id, code, name, account_type, is_postable, is_system)
    VALUES (p_company_id, '2130', 'Saldo a favor clientes', 'liability', true, true)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._round_money(p_value NUMERIC)
RETURNS money_amount
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ROUND(p_value, 2)::money_amount;
$$;

DROP FUNCTION IF EXISTS public.confirm_pos_sale(text, uuid, text, money_amount, jsonb);

CREATE OR REPLACE FUNCTION public.confirm_pos_sale(
  p_idempotency_key TEXT,
  p_warehouse_id UUID,
  p_payment_kind TEXT,
  p_amount_paid money_amount,
  p_lines JSONB,
  p_cash_session_id UUID DEFAULT NULL,
  p_tax_rate_id UUID DEFAULT NULL,
  p_payment_method_id UUID DEFAULT NULL
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
  v_net money_amount := 0;
  v_tax_total money_amount := 0;
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
  v_acct_tax UUID;
  v_tax_rate NUMERIC(9, 4);
  v_tax_id UUID;
  v_cash_in money_amount;
  v_sess RECORD;
BEGIN
  PERFORM public.require_permission('sales.confirm');
  PERFORM public.require_open_accounting_period(CURRENT_DATE);
  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Sin empresa activa';
  END IF;

  v_hash := md5(
    p_warehouse_id::text || '|' || p_payment_kind || '|'
    || COALESCE(p_amount_paid::text, '') || '|' || COALESCE(p_lines::text, '')
    || '|' || COALESCE(p_cash_session_id::text, '') || '|' || COALESCE(p_tax_rate_id::text, '')
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

  IF p_cash_session_id IS NOT NULL THEN
    SELECT * INTO v_sess FROM public.cash_sessions
    WHERE id = p_cash_session_id AND company_id = v_company AND status = 'open';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sesión de caja no válida';
    END IF;
  END IF;

  v_tax_id := NULL;
  v_tax_rate := NULL;
  IF p_tax_rate_id IS NOT NULL THEN
    SELECT tr.id, tr.rate_percent INTO v_tax_id, v_tax_rate
    FROM public.tax_rates tr
    WHERE tr.id = p_tax_rate_id AND tr.company_id = v_company AND tr.is_active = true;
    IF v_tax_id IS NULL THEN
      RAISE EXCEPTION 'Tasa de impuesto no válida';
    END IF;
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
  v_acct_tax := public.ensure_company_tax_payable_account(v_company);

  v_invoice_number := public.next_document_number(v_company, 'sales_invoice', v_branch);

  INSERT INTO public.sales_invoices (
    company_id, branch_id, warehouse_id, invoice_number, status, payment_kind,
    idempotency_key, created_by, cash_session_id, applied_tax_rate_id, applied_tax_rate_percent
  ) VALUES (
    v_company, v_branch, p_warehouse_id, v_invoice_number, 'confirmed', p_payment_kind,
    p_idempotency_key, auth.uid(), p_cash_session_id, v_tax_id, v_tax_rate
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

  v_net := v_subtotal - v_discount_total;
  IF v_tax_rate IS NOT NULL THEN
    v_tax_total := public._round_money(v_net * v_tax_rate / 100.0);
  ELSE
    v_tax_total := 0;
  END IF;
  v_total := v_net + v_tax_total;

  IF p_payment_kind = 'cash' AND p_amount_paid < v_total THEN
    RAISE EXCEPTION 'Pago insuficiente para venta al contado';
  END IF;

  UPDATE public.sales_invoices
  SET subtotal = v_subtotal,
      discount_total = v_discount_total,
      tax_total = v_tax_total,
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
    v_cash_in := v_total;
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
      (v_journal_id, v_company, v_acct_cash, 1, v_cash_in, 0, 'Cobro contado'),
      (v_journal_id, v_company, v_acct_sales, 2, 0, v_net, 'Ingreso venta');
    IF v_tax_total > 0 THEN
      INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
        (v_journal_id, v_company, v_acct_tax, 3, 0, v_tax_total, 'Impuesto venta');
    END IF;
  ELSE
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
      (v_journal_id, v_company, v_acct_ar, 1, v_total, 0, 'Venta crédito'),
      (v_journal_id, v_company, v_acct_sales, 2, 0, v_net, 'Ingreso venta');
    IF v_tax_total > 0 THEN
      INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
        (v_journal_id, v_company, v_acct_tax, 3, 0, v_tax_total, 'Impuesto venta');
    END IF;
  END IF;

  INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
    (v_journal_id, v_company, v_acct_cogs, 4, v_cost_total, 0, 'Costo venta'),
    (v_journal_id, v_company, v_acct_inventory, 5, 0, v_cost_total, 'Salida inventario');

  PERFORM public.assert_journal_balanced(v_journal_id);

  IF p_payment_kind = 'cash' AND p_cash_session_id IS NOT NULL THEN
    INSERT INTO public.cash_movements (
      company_id, cash_session_id, movement_kind, amount, payment_method_id,
      source_document_type, source_document_id, reason, created_by
    ) VALUES (
      v_company, p_cash_session_id, 'sale', v_total, p_payment_method_id,
      'sales_invoice', v_invoice_id, 'Venta POS ' || v_invoice_number, auth.uid()
    );
    UPDATE public.cash_sessions SET expected_cash = expected_cash + v_total WHERE id = p_cash_session_id;
  END IF;

  INSERT INTO public.operation_idempotency (company_id, operation, idempotency_key, payload_hash, result_entity_id)
  VALUES (v_company, 'pos_sale', p_idempotency_key, v_hash, v_invoice_id);

  PERFORM public.log_audit('sales.invoice.confirmed', 'sales_invoice', v_invoice_id, 'POS confirmado');

  RETURN v_invoice_id;
END;
$$;

DROP FUNCTION IF EXISTS public.collect_customer_payment(uuid, money_amount, text);

CREATE OR REPLACE FUNCTION public.collect_customer_payment(
  p_sales_invoice_id UUID,
  p_amount money_amount,
  p_idempotency_key TEXT,
  p_cash_session_id UUID DEFAULT NULL,
  p_payment_method_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_invoice RECORD;
  v_payment_id UUID;
  v_existing UUID;
  v_hash TEXT;
  v_journal_id UUID;
  v_acct_cash UUID;
  v_acct_ar UUID;
  v_open money_amount;
BEGIN
  PERFORM public.require_permission('payment.collect');
  PERFORM public.require_open_accounting_period(CURRENT_DATE);
  v_company := public.current_company_id();
  v_hash := md5(p_sales_invoice_id::text || '|' || p_amount::text || '|' || COALESCE(p_cash_session_id::text, ''));

  SELECT result_entity_id INTO v_existing FROM public.operation_idempotency
  WHERE company_id = v_company AND operation = 'customer_payment' AND idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    IF (SELECT payload_hash FROM public.operation_idempotency
        WHERE company_id = v_company AND operation = 'customer_payment' AND idempotency_key = p_idempotency_key) <> v_hash THEN
      RAISE EXCEPTION 'Clave de idempotencia reutilizada con contenido distinto';
    END IF;
    RETURN v_existing;
  END IF;

  SELECT * INTO v_invoice FROM public.sales_invoices
  WHERE id = p_sales_invoice_id AND company_id = v_company AND status = 'confirmed' FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura no encontrada';
  END IF;
  IF v_invoice.payment_kind <> 'credit' THEN
    RAISE EXCEPTION 'Solo aplica a facturas a crédito';
  END IF;

  v_open := v_invoice.total - v_invoice.amount_paid;
  IF p_amount <= 0 OR p_amount > v_open THEN
    RAISE EXCEPTION 'Monto de cobro inválido';
  END IF;

  IF p_cash_session_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.cash_sessions cs
      WHERE cs.id = p_cash_session_id AND cs.company_id = v_company AND cs.status = 'open'
    ) THEN
      RAISE EXCEPTION 'Sesión de caja no válida';
    END IF;
  END IF;

  SELECT id INTO v_acct_cash FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1000';
  SELECT id INTO v_acct_ar FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1100';

  INSERT INTO public.customer_payments (
    company_id, customer_id, amount, idempotency_key, created_by, cash_session_id, payment_method_id
  )
  VALUES (v_company, v_invoice.customer_id, p_amount, p_idempotency_key, auth.uid(), p_cash_session_id, p_payment_method_id)
  RETURNING id INTO v_payment_id;

  INSERT INTO public.customer_payment_allocations (payment_id, sales_invoice_id, amount)
  VALUES (v_payment_id, p_sales_invoice_id, p_amount);

  UPDATE public.sales_invoices SET amount_paid = amount_paid + p_amount WHERE id = p_sales_invoice_id;

  INSERT INTO public.journal_entries (
    company_id, status, description, source_document_type, source_document_id,
    idempotency_key, created_by, confirmed_at
  ) VALUES (
    v_company, 'confirmed', 'Cobro cliente',
    'customer_payment', v_payment_id, 'je-pay-' || p_idempotency_key, auth.uid(), now()
  ) RETURNING id INTO v_journal_id;

  INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
    (v_journal_id, v_company, v_acct_cash, 1, p_amount, 0, 'Cobro'),
    (v_journal_id, v_company, v_acct_ar, 2, 0, p_amount, 'Cancela CxC');

  PERFORM public.assert_journal_balanced(v_journal_id);
  UPDATE public.customer_payments SET journal_entry_id = v_journal_id WHERE id = v_payment_id;

  IF p_cash_session_id IS NOT NULL THEN
    INSERT INTO public.cash_movements (
      company_id, cash_session_id, movement_kind, amount, payment_method_id,
      source_document_type, source_document_id, reason, created_by
    ) VALUES (
      v_company, p_cash_session_id, 'customer_payment', p_amount, p_payment_method_id,
      'customer_payment', v_payment_id, 'Cobro factura', auth.uid()
    );
    UPDATE public.cash_sessions SET expected_cash = expected_cash + p_amount WHERE id = p_cash_session_id;
  END IF;

  INSERT INTO public.operation_idempotency (company_id, operation, idempotency_key, payload_hash, result_entity_id)
  VALUES (v_company, 'customer_payment', p_idempotency_key, v_hash, v_payment_id);

  RETURN v_payment_id;
END;
$$;

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

  IF p_refund_kind = 'cash' AND v_inv.payment_kind <> 'cash' THEN
    RAISE EXCEPTION 'Reembolso en efectivo solo para ventas al contado';
  END IF;

  IF p_refund_kind = 'cash' AND p_cash_session_id IS NULL THEN
    RAISE EXCEPTION 'Indique sesión de caja para reembolso en efectivo';
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

  INSERT INTO public.journal_entries (
    company_id, status, description, source_document_type, source_document_id,
    idempotency_key, created_by, confirmed_at
  ) VALUES (
    v_company, 'confirmed', 'Devolución ' || v_return_number,
    'sales_return', v_return_id,
    'je-ret-' || p_idempotency_key, auth.uid(), now()
  ) RETURNING id INTO v_journal_id;

  INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
    (v_journal_id, v_company, v_acct_sales, 1, v_return_net, 0, 'Reversa ingreso');

  IF v_return_tax > 0 THEN
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
      (v_journal_id, v_company, v_acct_tax, 2, v_return_tax, 0, 'Reversa impuesto');
  END IF;

  IF p_refund_kind = 'cash' THEN
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
      (v_journal_id, v_company, v_acct_cash, 3, 0, v_refund_total, 'Reembolso efectivo');
  ELSIF v_inv.payment_kind = 'credit' THEN
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
      (v_journal_id, v_company, v_acct_ar, 3, 0, v_refund_total, 'Reduce CxC');
  ELSE
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
      (v_journal_id, v_company, v_acct_credit, 3, 0, v_refund_total, 'Saldo a favor');
    INSERT INTO public.customer_credit_balances (company_id, customer_id, balance, updated_at)
    VALUES (v_company, v_inv.customer_id, v_refund_total, now())
    ON CONFLICT (company_id, customer_id) DO UPDATE
    SET balance = customer_credit_balances.balance + EXCLUDED.balance, updated_at = now();
  END IF;

  INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
    (v_journal_id, v_company, v_acct_inventory, 4, v_cost_rev, 0, 'Reingreso inventario'),
    (v_journal_id, v_company, v_acct_cogs, 5, 0, v_cost_rev, 'Reversa costo');

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

  IF p_refund_kind = 'credit_balance' AND v_inv.customer_id IS NULL THEN
    RAISE EXCEPTION 'Saldo a favor requiere cliente en la factura';
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
      SELECT SUM(sr.total_refund) FROM public.sales_returns sr
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

GRANT EXECUTE ON FUNCTION public.confirm_pos_sale TO authenticated;
GRANT EXECUTE ON FUNCTION public.collect_customer_payment TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_sales_return TO authenticated;

INSERT INTO public.document_series (company_id, branch_id, document_type, prefix, next_number)
SELECT b.company_id, b.id, 'sales_return', 'DEV', 1
FROM public.branches b
WHERE b.is_default = true
ON CONFLICT (company_id, document_type, branch_id, prefix) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_operational_defaults(p_company_id UUID, p_branch_id UUID, p_warehouse_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caja UUID;
  v_banco UUID;
BEGIN
  SELECT id INTO v_caja FROM public.chart_of_accounts WHERE company_id = p_company_id AND code = '1000';
  SELECT id INTO v_banco FROM public.chart_of_accounts WHERE company_id = p_company_id AND code = '1010';

  INSERT INTO public.payment_methods (company_id, code, name, kind, gl_account_id) VALUES
    (p_company_id, 'CASH', 'Efectivo', 'cash', v_caja),
    (p_company_id, 'CARD', 'Tarjeta', 'card', NULL),
    (p_company_id, 'TRANSFER', 'Transferencia', 'transfer', v_banco);

  INSERT INTO public.document_series (company_id, branch_id, document_type, prefix, next_number) VALUES
    (p_company_id, p_branch_id, 'sales_invoice', 'V', 1),
    (p_company_id, p_branch_id, 'quote', 'C', 1),
    (p_company_id, p_branch_id, 'purchase_order', 'OC', 1),
    (p_company_id, p_branch_id, 'goods_receipt', 'REC', 1),
    (p_company_id, p_branch_id, 'sales_return', 'DEV', 1);

  INSERT INTO public.business_policies (company_id) VALUES (p_company_id)
  ON CONFLICT (company_id) DO NOTHING;

  INSERT INTO public.company_contacts (company_id, tax_config_pending) VALUES (p_company_id, true)
  ON CONFLICT (company_id) DO NOTHING;
END;
$$;
