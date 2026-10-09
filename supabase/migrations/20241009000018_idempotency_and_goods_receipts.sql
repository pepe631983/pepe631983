-- Idempotencia con hash de contenido y recepciones trazables con contabilidad
CREATE TABLE public.operation_idempotency (
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  result_entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, operation, idempotency_key)
);

CREATE TYPE public.goods_receipt_kind AS ENUM (
  'purchase_pending_invoice',
  'opening_balance',
  'adjustment_in',
  'adjustment_out'
);

CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_suppliers_company ON public.suppliers (company_id);

CREATE TABLE public.goods_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses (id) ON DELETE RESTRICT,
  supplier_id UUID REFERENCES public.suppliers (id),
  receipt_kind public.goods_receipt_kind NOT NULL,
  receipt_number TEXT,
  status public.document_status NOT NULL DEFAULT 'draft',
  idempotency_key TEXT NOT NULL,
  reason TEXT,
  journal_entry_id UUID REFERENCES public.journal_entries (id),
  confirmed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);

CREATE INDEX idx_goods_receipts_company ON public.goods_receipts (company_id);

CREATE TABLE public.goods_receipt_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id UUID NOT NULL REFERENCES public.goods_receipts (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  line_number SMALLINT NOT NULL,
  quantity quantity_amount NOT NULL CHECK (quantity > 0),
  unit_cost money_amount NOT NULL CHECK (unit_cost >= 0),
  extended_cost money_amount NOT NULL,
  UNIQUE (goods_receipt_id, line_number)
);

CREATE OR REPLACE FUNCTION public.assert_journal_balanced(p_entry_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_debit money_amount;
  v_credit money_amount;
BEGIN
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
  INTO v_debit, v_credit
  FROM public.journal_lines WHERE journal_entry_id = p_entry_id;
  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'Asiento desbalanceado: débitos % ≠ créditos %', v_debit, v_credit;
  END IF;
END;
$$;

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
    idempotency_key, reason, created_by, confirmed_at
  ) VALUES (
    v_company, p_warehouse_id, p_supplier_id, p_receipt_kind, v_receipt_number, 'confirmed',
    p_idempotency_key, p_reason, auth.uid(), now()
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

DROP FUNCTION IF EXISTS public.receive_inventory(UUID, UUID, quantity_amount, money_amount, TEXT);

GRANT EXECUTE ON FUNCTION public.confirm_goods_receipt TO authenticated;

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_idempotency ENABLE ROW LEVEL SECURITY;

CREATE POLICY suppliers_company ON public.suppliers
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());

CREATE POLICY goods_receipts_select ON public.goods_receipts
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());

CREATE POLICY goods_receipt_lines_select ON public.goods_receipt_lines
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());

CREATE POLICY operation_idempotency_select ON public.operation_idempotency
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());
