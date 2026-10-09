-- Confirmación POS transaccional + reimpresión sin repetir venta
CREATE OR REPLACE FUNCTION public.next_document_number(
  p_company_id UUID,
  p_document_type TEXT,
  p_branch_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_next BIGINT;
  v_padding SMALLINT;
  v_number TEXT;
BEGIN
  UPDATE public.document_series
  SET next_number = next_number + 1
  WHERE company_id = p_company_id
    AND document_type = p_document_type
    AND (branch_id IS NULL OR branch_id = p_branch_id)
    AND is_active = true
  RETURNING prefix, next_number - 1, padding INTO v_prefix, v_next, v_padding;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Serie de documento no configurada: %', p_document_type;
  END IF;

  v_number := v_prefix || lpad(v_next::text, v_padding, '0');
  RETURN v_number;
END;
$$;

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
  v_ln SMALLINT := 0;
BEGIN
  PERFORM public.require_permission('sales.confirm');
  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Sin empresa activa';
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

  PERFORM public.log_audit('sales.invoice.confirmed', 'sales_invoice', v_invoice_id, 'POS confirmado');

  RETURN v_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_reprint_for_document(
  p_source_document_type TEXT,
  p_source_document_id UUID,
  p_profile_key TEXT,
  p_channel public.print_channel,
  p_client_request_id TEXT,
  p_device_fingerprint TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_job UUID;
BEGIN
  PERFORM public.require_permission('print.execute');
  v_company := public.current_company_id();

  IF p_source_document_type = 'sales_invoice' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.sales_invoices si
      WHERE si.id = p_source_document_id AND si.company_id = v_company AND si.status = 'confirmed'
    ) THEN
      RAISE EXCEPTION 'Factura no encontrada o no confirmada';
    END IF;
  END IF;

  INSERT INTO public.print_jobs (
    company_id, user_id, profile_key, channel, status,
    source_document_type, source_document_id,
    is_reprint, is_marked_copy, copies_requested, client_request_id,
    device_fingerprint, metadata
  ) VALUES (
    v_company, auth.uid(), p_profile_key, p_channel, 'pending',
    p_source_document_type, p_source_document_id,
    true, true, 1, p_client_request_id,
    p_device_fingerprint,
    jsonb_build_object('reprint_only', true)
  )
  ON CONFLICT (company_id, client_request_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_job;

  RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_inventory(
  p_warehouse_id UUID,
  p_product_id UUID,
  p_quantity quantity_amount,
  p_unit_cost money_amount,
  p_idempotency_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_old_qty quantity_amount;
  v_old_cost money_amount;
  v_new_avg money_amount;
BEGIN
  PERFORM public.require_permission('purchase.post');
  v_company := public.current_company_id();

  IF p_quantity <= 0 OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Cantidad o costo inválido';
  END IF;

  SELECT quantity, avg_unit_cost INTO v_old_qty, v_old_cost
  FROM public.inventory_balances
  WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.inventory_balances (company_id, warehouse_id, product_id, quantity, avg_unit_cost)
    VALUES (v_company, p_warehouse_id, p_product_id, p_quantity, p_unit_cost);
    v_new_avg := p_unit_cost;
  ELSE
    v_new_avg := ((v_old_qty * v_old_cost) + (p_quantity * p_unit_cost)) / (v_old_qty + p_quantity);
    UPDATE public.inventory_balances
    SET quantity = quantity + p_quantity, avg_unit_cost = v_new_avg, updated_at = now()
    WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id;
  END IF;

  INSERT INTO public.inventory_movements (
    company_id, warehouse_id, product_id, movement_kind, quantity_delta,
    unit_cost, extended_cost, source_document_type, source_document_id
  ) VALUES (
    v_company, p_warehouse_id, p_product_id, 'receipt', p_quantity,
    p_unit_cost, p_quantity * p_unit_cost, 'goods_receipt', gen_random_uuid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_pos_sale TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_reprint_for_document TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_inventory TO authenticated;

CREATE OR REPLACE FUNCTION public.create_product(
  p_internal_code TEXT,
  p_name TEXT,
  p_sale_price money_amount
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_id UUID;
BEGIN
  PERFORM public.require_permission('price.edit');
  v_company := public.current_company_id();
  INSERT INTO public.products (company_id, internal_code, name, sale_price)
  VALUES (v_company, p_internal_code, p_name, p_sale_price)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_product TO authenticated;
