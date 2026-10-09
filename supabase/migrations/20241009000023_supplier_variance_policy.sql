-- Política de variación factura vs recepción: reparto inventario restante vs unidades vendidas (sin reescribir COGS histórico)

CREATE TYPE public.supplier_invoice_variance_policy AS ENUM (
  'split_sold_and_remaining',
  'expense_all_to_6200'
);

ALTER TABLE public.business_policies
  ADD COLUMN IF NOT EXISTS supplier_invoice_variance_policy public.supplier_invoice_variance_policy
  NOT NULL DEFAULT 'split_sold_and_remaining';

ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS variance_to_inventory money_amount NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variance_to_expense_sold money_amount NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.supplier_invoices.variance_to_inventory IS
  'Porción de variación capitalizada en inventario restante (ajuste avg_unit_cost hacia adelante).';
COMMENT ON COLUMN public.supplier_invoices.variance_to_expense_sold IS
  'Porción de variación en unidades ya vendidas → gasto 6200 (no modifica líneas de venta confirmadas).';

CREATE OR REPLACE FUNCTION public.receipt_sold_qty_since_receipt(p_goods_receipt_id UUID)
RETURNS quantity_amount
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE WHEN im.quantity_delta < 0 THEN -im.quantity_delta ELSE 0 END
  ), 0)
  FROM public.goods_receipts gr
  JOIN public.goods_receipt_lines grl ON grl.goods_receipt_id = gr.id
  JOIN public.inventory_movements im
    ON im.product_id = grl.product_id
   AND im.company_id = gr.company_id
   AND im.movement_kind = 'sale'
   AND im.created_at >= gr.confirmed_at
  WHERE gr.id = p_goods_receipt_id;
$$;

CREATE OR REPLACE FUNCTION public.apply_remaining_inventory_cost_adjustment(
  p_goods_receipt_id UUID,
  p_amount money_amount
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line RECORD;
  v_rem quantity_amount;
  v_share money_amount;
  v_total_rem quantity_amount := 0;
BEGIN
  IF p_amount = 0 THEN
    RETURN;
  END IF;

  FOR v_line IN
    SELECT grl.product_id, grl.quantity AS recv_qty, gr.warehouse_id, gr.company_id
    FROM public.goods_receipt_lines grl
    JOIN public.goods_receipts gr ON gr.id = grl.goods_receipt_id
    WHERE grl.goods_receipt_id = p_goods_receipt_id
  LOOP
    SELECT ib.quantity INTO v_rem
    FROM public.inventory_balances ib
    WHERE ib.warehouse_id = v_line.warehouse_id AND ib.product_id = v_line.product_id;
    v_total_rem := v_total_rem + COALESCE(v_rem, 0);
  END LOOP;

  IF v_total_rem <= 0 THEN
    RETURN;
  END IF;

  FOR v_line IN
    SELECT grl.product_id, gr.warehouse_id, gr.company_id
    FROM public.goods_receipt_lines grl
    JOIN public.goods_receipts gr ON gr.id = grl.goods_receipt_id
    WHERE grl.goods_receipt_id = p_goods_receipt_id
  LOOP
    SELECT ib.quantity INTO v_rem
    FROM public.inventory_balances ib
    WHERE ib.warehouse_id = v_line.warehouse_id AND ib.product_id = v_line.product_id
    FOR UPDATE;
    IF v_rem IS NULL OR v_rem <= 0 THEN
      CONTINUE;
    END IF;
    v_share := p_amount * (v_rem / v_total_rem);
    UPDATE public.inventory_balances
    SET avg_unit_cost = avg_unit_cost + (v_share / v_rem), updated_at = now()
    WHERE warehouse_id = v_line.warehouse_id AND product_id = v_line.product_id;
  END LOOP;
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
