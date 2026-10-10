CREATE OR REPLACE FUNCTION public.convert_quote_to_sale(
  p_quote_id UUID,
  p_idempotency_key TEXT,
  p_payment_kind TEXT DEFAULT 'cash',
  p_amount_paid money_amount DEFAULT NULL,
  p_cash_session_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := public.current_company_id();
  v_q RECORD;
  v_line RECORD;
  v_avail quantity_amount;
  v_lines JSONB := '[]'::jsonb;
  v_inv UUID;
  v_paid money_amount;
BEGIN
  PERFORM public.require_permission('sales.quote.convert');
  PERFORM public.require_open_accounting_period(CURRENT_DATE);
  SELECT * INTO v_q FROM public.sales_quotes
  WHERE id = p_quote_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;
  IF v_q.status = 'converted' OR v_q.converted_invoice_id IS NOT NULL THEN
    IF v_q.convert_idempotency_key IS NOT NULL AND v_q.convert_idempotency_key = p_idempotency_key THEN
      RETURN v_q.converted_invoice_id;
    END IF;
    RAISE EXCEPTION 'Cotización ya convertida';
  END IF;
  IF v_q.status <> 'accepted' THEN
    RAISE EXCEPTION 'La cotización debe estar aceptada (estado %)', v_q.status;
  END IF;
  IF v_q.valid_until IS NOT NULL AND v_q.valid_until < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cotización vencida';
  END IF;

  FOR v_line IN SELECT * FROM public.sales_quote_lines WHERE sales_quote_id = p_quote_id ORDER BY line_number
  LOOP
    SELECT ib.quantity INTO v_avail
    FROM public.inventory_balances ib
    WHERE ib.warehouse_id = v_q.warehouse_id AND ib.product_id = v_line.product_id;
    IF COALESCE(v_avail, 0) < v_line.quantity THEN
      RAISE EXCEPTION 'Stock insuficiente para % (disp. %, req. %)', v_line.description, COALESCE(v_avail, 0), v_line.quantity;
    END IF;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_line.product_id, 'quantity', v_line.quantity,
      'unit_price', v_line.unit_price, 'discount', v_line.discount
    );
  END LOOP;

  v_paid := COALESCE(p_amount_paid, CASE WHEN p_payment_kind = 'cash' THEN v_q.total ELSE NULL END);

  v_inv := public.confirm_pos_sale(
    p_idempotency_key, v_q.warehouse_id, p_payment_kind, v_paid, v_lines,
    p_cash_session_id, v_q.tax_rate_id, NULL
  );

  UPDATE public.sales_quotes
  SET status = 'converted', converted_invoice_id = v_inv, confirmed_by = auth.uid(),
      convert_idempotency_key = p_idempotency_key
  WHERE id = p_quote_id;

  PERFORM public.log_audit('sales.quote.converted', 'sales_quote', p_quote_id, v_inv::text);
  RETURN v_inv;
END;
$$;
