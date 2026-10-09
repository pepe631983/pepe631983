-- Conciliación caja: comparar magnitudes equivalentes (no arqueo total vs GL histórico)

CREATE OR REPLACE FUNCTION public._cash_session_operational_net(p_session_id UUID)
RETURNS money_amount
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(cm.amount) FILTER (
      WHERE cm.movement_kind IN ('sale', 'customer_payment', 'adjustment')
        OR (cm.movement_kind = 'deposit' AND COALESCE(cm.reason, '') <> 'Fondo inicial de caja')
    ), 0)
    - COALESCE(SUM(cm.amount) FILTER (
      WHERE cm.movement_kind IN ('refund', 'withdrawal')
    ), 0)
  FROM public.cash_movements cm
  WHERE cm.cash_session_id = p_session_id;
$$;

CREATE OR REPLACE FUNCTION public._cash_session_gl_net(p_session_id UUID, p_company_id UUID)
RETURNS money_amount
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  FROM public.journal_lines jl
  JOIN public.chart_of_accounts coa ON coa.id = jl.account_id AND coa.code = '1000'
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'confirmed'
  WHERE jl.company_id = p_company_id
    AND (
      (je.source_document_type = 'sales_invoice' AND EXISTS (
        SELECT 1 FROM public.sales_invoices si
        WHERE si.id = je.source_document_id AND si.cash_session_id = p_session_id
      ))
      OR (je.source_document_type = 'customer_payment' AND EXISTS (
        SELECT 1 FROM public.customer_payments cp
        WHERE cp.id = je.source_document_id AND cp.cash_session_id = p_session_id
      ))
      OR (je.source_document_type = 'sales_return' AND EXISTS (
        SELECT 1 FROM public.cash_movements cm
        WHERE cm.source_document_type = 'sales_return'
          AND cm.source_document_id = je.source_document_id
          AND cm.cash_session_id = p_session_id
          AND cm.movement_kind = 'refund'
      ))
      OR (je.source_document_type = 'cash_session' AND je.source_document_id = p_session_id)
    );
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
  v_open_session UUID;
  v_sess_expected money_amount;
  v_sess_column money_amount;
  v_sess_ops money_amount;
  v_sess_gl money_amount;
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

  SELECT cs.id, cs.expected_cash INTO v_open_session, v_sess_column
  FROM public.cash_sessions cs
  WHERE cs.company_id = v_company AND cs.status = 'open'
  ORDER BY cs.opened_at DESC LIMIT 1;

  IF v_open_session IS NOT NULL THEN
    v_sess_expected := public._cash_session_expected(v_open_session);
    v_sess_ops := public._cash_session_operational_net(v_open_session);
    v_sess_gl := public._cash_session_gl_net(v_open_session, v_company);
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

  IF v_open_session IS NOT NULL THEN
    v_diffs := v_diffs || jsonb_build_object(
      'key', 'cash_session_internal',
      'label', 'Caja: movimientos vs expected_cash en sesión',
      'expected', v_sess_expected,
      'actual', v_sess_column,
      'delta', v_sess_expected - v_sess_column
    ) || jsonb_build_object(
      'key', 'cash_session_ops_vs_gl',
      'label', 'Caja: neto operativo sesión vs cuenta 1000 (solo docs de sesión)',
      'expected', v_sess_ops,
      'actual', v_sess_gl,
      'delta', v_sess_ops - v_sess_gl
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
      'open_cash_session_expected', v_sess_expected,
      'open_cash_session_operational_net', v_sess_ops,
      'open_cash_session_gl_net', v_sess_gl
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
