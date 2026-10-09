-- Una sola firma canónica (5 args con defaults); evita ambigüedad en llamadas de 3 args.
DROP FUNCTION IF EXISTS public.post_supplier_invoice_for_receipt(uuid, text, text);

CREATE OR REPLACE FUNCTION integration_test.assert_eq(p_label TEXT, p_expected UUID, p_actual UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_expected IS DISTINCT FROM p_actual THEN
    RAISE EXCEPTION 'ASSERT %: esperado %, obtenido %', p_label, p_expected, p_actual;
  END IF;
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

  v_inv_gl := public.account_balance_for_code_as_of(v_company, '1200', p_as_of);
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
    'company_id', v_company,
    'as_of', p_as_of,
    'metrics', jsonb_build_object(
      'inventory_units', v_inv_qty,
      'inventory_book_value', v_inv_book,
      'inventory_gl', v_inv_gl,
      'cash_gl', v_cash_gl,
      'accounts_receivable_gl', v_ar_gl,
      'accounts_payable_gl', v_ap_gl,
      'net_sales_gl', v_sales_gl,
      'cogs_gl', v_cogs_gl,
      'gross_profit_gl', v_gross,
      'ar_operational_open', v_ar_ops,
      'journal_debit_total', v_debit,
      'journal_credit_total', v_credit
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
