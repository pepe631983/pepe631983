-- Cobros a clientes (sin duplicar ingresos) y factura proveedor contra GRNI
CREATE TABLE public.customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES public.customers (id),
  payment_number TEXT,
  amount money_amount NOT NULL CHECK (amount > 0),
  idempotency_key TEXT NOT NULL,
  journal_entry_id UUID REFERENCES public.journal_entries (id),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users (id),
  UNIQUE (company_id, idempotency_key)
);

CREATE TABLE public.customer_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.customer_payments (id) ON DELETE CASCADE,
  sales_invoice_id UUID NOT NULL REFERENCES public.sales_invoices (id) ON DELETE RESTRICT,
  amount money_amount NOT NULL CHECK (amount > 0),
  UNIQUE (payment_id, sales_invoice_id)
);

CREATE TABLE public.supplier_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  supplier_id UUID NOT NULL REFERENCES public.suppliers (id),
  invoice_number TEXT NOT NULL,
  goods_receipt_id UUID REFERENCES public.goods_receipts (id),
  total money_amount NOT NULL,
  idempotency_key TEXT NOT NULL,
  journal_entry_id UUID REFERENCES public.journal_entries (id),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);

CREATE OR REPLACE FUNCTION public.collect_customer_payment(
  p_sales_invoice_id UUID,
  p_amount money_amount,
  p_idempotency_key TEXT
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
  v_company := public.current_company_id();
  v_hash := md5(p_sales_invoice_id::text || '|' || p_amount::text);

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

  SELECT id INTO v_acct_cash FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1000';
  SELECT id INTO v_acct_ar FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1100';

  INSERT INTO public.customer_payments (company_id, customer_id, amount, idempotency_key, created_by)
  VALUES (v_company, v_invoice.customer_id, p_amount, p_idempotency_key, auth.uid())
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

  INSERT INTO public.operation_idempotency (company_id, operation, idempotency_key, payload_hash, result_entity_id)
  VALUES (v_company, 'customer_payment', p_idempotency_key, v_hash, v_payment_id);

  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_supplier_invoice_for_receipt(
  p_goods_receipt_id UUID,
  p_supplier_invoice_number TEXT,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_receipt RECORD;
  v_total money_amount;
  v_invoice_id UUID;
  v_journal_id UUID;
  v_acct_grni UUID;
  v_acct_ap UUID;
BEGIN
  PERFORM public.require_permission('purchase.post');
  v_company := public.current_company_id();

  SELECT * INTO v_receipt FROM public.goods_receipts
  WHERE id = p_goods_receipt_id AND company_id = v_company AND status = 'confirmed' FOR UPDATE;

  IF NOT FOUND OR v_receipt.receipt_kind <> 'purchase_pending_invoice' THEN
    RAISE EXCEPTION 'Recepción de compra pendiente no válida';
  END IF;

  IF EXISTS (SELECT 1 FROM public.supplier_invoices WHERE goods_receipt_id = p_goods_receipt_id) THEN
    RAISE EXCEPTION 'La recepción ya fue facturada';
  END IF;

  SELECT COALESCE(SUM(extended_cost), 0) INTO v_total FROM public.goods_receipt_lines WHERE goods_receipt_id = p_goods_receipt_id;

  INSERT INTO public.supplier_invoices (
    company_id, supplier_id, invoice_number, goods_receipt_id, total, idempotency_key
  ) VALUES (
    v_company, v_receipt.supplier_id, p_supplier_invoice_number, p_goods_receipt_id, v_total, p_idempotency_key
  ) RETURNING id INTO v_invoice_id;

  SELECT id INTO v_acct_grni FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1210';
  SELECT id INTO v_acct_ap FROM public.chart_of_accounts WHERE company_id = v_company AND code = '2000';

  INSERT INTO public.journal_entries (
    company_id, status, description, source_document_type, source_document_id,
    idempotency_key, created_by, confirmed_at
  ) VALUES (
    v_company, 'confirmed', 'Factura proveedor ' || p_supplier_invoice_number,
    'supplier_invoice', v_invoice_id, 'je-sinv-' || p_idempotency_key, auth.uid(), now()
  ) RETURNING id INTO v_journal_id;

  INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
    (v_journal_id, v_company, v_acct_grni, 1, v_total, 0, 'Cierra GRNI'),
    (v_journal_id, v_company, v_acct_ap, 2, 0, v_total, 'Cuentas por pagar');

  PERFORM public.assert_journal_balanced(v_journal_id);
  UPDATE public.supplier_invoices SET journal_entry_id = v_journal_id WHERE id = v_invoice_id;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.collect_customer_payment TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_supplier_invoice_for_receipt TO authenticated;

ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_payments_select ON public.customer_payments
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());

CREATE POLICY supplier_invoices_select ON public.supplier_invoices
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());
