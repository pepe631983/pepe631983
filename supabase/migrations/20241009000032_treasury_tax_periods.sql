-- Caja, impuestos en documentos, períodos contables y utilidades de tesorería

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_movement_kind_check;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_movement_kind_check
  CHECK (movement_kind IN ('receipt', 'sale', 'adjustment', 'transfer', 'return'));

ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES public.cash_sessions (id),
  ADD COLUMN IF NOT EXISTS applied_tax_rate_id UUID REFERENCES public.tax_rates (id),
  ADD COLUMN IF NOT EXISTS applied_tax_rate_percent NUMERIC(9, 4);

ALTER TABLE public.sales_invoice_lines
  ADD COLUMN IF NOT EXISTS quantity_returned quantity_amount NOT NULL DEFAULT 0;

ALTER TABLE public.customer_payments
  ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES public.payment_methods (id),
  ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES public.cash_sessions (id);

ALTER TABLE public.cash_sessions
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users (id),
  ADD COLUMN IF NOT EXISTS close_journal_entry_id UUID REFERENCES public.journal_entries (id),
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_sessions_open_branch
  ON public.cash_sessions (company_id, branch_id)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  cash_session_id UUID NOT NULL REFERENCES public.cash_sessions (id) ON DELETE RESTRICT,
  movement_kind TEXT NOT NULL CHECK (movement_kind IN (
    'sale', 'customer_payment', 'refund', 'deposit', 'withdrawal', 'adjustment'
  )),
  amount money_amount NOT NULL CHECK (amount > 0),
  payment_method_id UUID REFERENCES public.payment_methods (id),
  reference TEXT,
  reason TEXT,
  source_document_type TEXT,
  source_document_id UUID,
  created_by UUID REFERENCES auth.users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_movements_session ON public.cash_movements (cash_session_id, created_at);

CREATE TABLE IF NOT EXISTS public.customer_credit_balances (
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  balance money_amount NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, customer_id)
);

CREATE OR REPLACE FUNCTION public.ensure_company_tax_payable_account(p_company_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.chart_of_accounts
  WHERE company_id = p_company_id AND code = '2150';
  IF v_id IS NULL THEN
    INSERT INTO public.chart_of_accounts (company_id, code, name, account_type, is_postable, is_system)
    VALUES (p_company_id, '2150', 'Impuestos por pagar ventas', 'liability', true, true)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_open_accounting_period(p_on_date DATE DEFAULT CURRENT_DATE)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_closed BOOLEAN;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RETURN;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.accounting_periods ap
    WHERE ap.company_id = v_company
      AND ap.status = 'closed'
      AND p_on_date BETWEEN ap.period_start AND ap.period_end
  ) INTO v_closed;
  IF v_closed THEN
    RAISE EXCEPTION 'Período contable cerrado para la fecha %', p_on_date;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_cash_session(
  p_branch_id UUID,
  p_opening_float money_amount DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_session UUID;
BEGIN
  PERFORM public.require_permission('cash.session.open');
  PERFORM public.require_open_accounting_period(CURRENT_DATE);
  v_company := public.current_company_id();
  IF EXISTS (
    SELECT 1 FROM public.cash_sessions cs
    WHERE cs.company_id = v_company AND cs.branch_id = p_branch_id AND cs.status = 'open'
  ) THEN
    RAISE EXCEPTION 'Ya hay una sesión de caja abierta en esta sucursal';
  END IF;
  INSERT INTO public.cash_sessions (
    company_id, branch_id, opened_by, opening_float, expected_cash, status
  ) VALUES (
    v_company, p_branch_id, auth.uid(), COALESCE(p_opening_float, 0), 0, 'open'
  ) RETURNING id INTO v_session;
  IF COALESCE(p_opening_float, 0) > 0 THEN
    INSERT INTO public.cash_movements (
      company_id, cash_session_id, movement_kind, amount, reason, created_by
    ) VALUES (
      v_company, v_session, 'deposit', p_opening_float, 'Fondo inicial de caja', auth.uid()
    );
    UPDATE public.cash_sessions SET expected_cash = expected_cash + p_opening_float WHERE id = v_session;
  END IF;
  PERFORM public.log_audit('cash.session.opened', 'cash_session', v_session, NULL);
  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_open_cash_session(p_branch_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cs.id
  FROM public.cash_sessions cs
  WHERE cs.company_id = public.current_company_id()
    AND cs.branch_id = p_branch_id
    AND cs.status = 'open'
  ORDER BY cs.opened_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.register_cash_movement(
  p_cash_session_id UUID,
  p_kind TEXT,
  p_amount money_amount,
  p_reason TEXT,
  p_payment_method_id UUID DEFAULT NULL,
  p_reference TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_sess RECORD;
  v_id UUID;
BEGIN
  PERFORM public.require_open_accounting_period(CURRENT_DATE);
  v_company := public.current_company_id();
  SELECT * INTO v_sess FROM public.cash_sessions
  WHERE id = p_cash_session_id AND company_id = v_company AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión de caja no válida o cerrada';
  END IF;
  IF p_kind IN ('withdrawal', 'adjustment') THEN
    PERFORM public.require_permission('expense.register');
  ELSE
    PERFORM public.require_permission('cash.session.open');
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Monto inválido';
  END IF;
  IF p_kind NOT IN ('deposit', 'withdrawal', 'adjustment') THEN
    RAISE EXCEPTION 'Tipo de movimiento no permitido aquí';
  END IF;
  INSERT INTO public.cash_movements (
    company_id, cash_session_id, movement_kind, amount, payment_method_id, reference, reason, created_by
  ) VALUES (
    v_company, p_cash_session_id, p_kind, p_amount, p_payment_method_id, p_reference, p_reason, auth.uid()
  ) RETURNING id INTO v_id;
  IF p_kind = 'deposit' THEN
    UPDATE public.cash_sessions SET expected_cash = expected_cash + p_amount WHERE id = p_cash_session_id;
  ELSE
    UPDATE public.cash_sessions SET expected_cash = expected_cash - p_amount WHERE id = p_cash_session_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._cash_session_expected(p_session_id UUID)
RETURNS money_amount
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT SUM(cm.amount) FROM public.cash_movements cm
      WHERE cm.cash_session_id = cs.id AND cm.movement_kind IN ('sale', 'customer_payment', 'deposit', 'adjustment')), 0)
    - COALESCE((SELECT SUM(cm.amount) FROM public.cash_movements cm
      WHERE cm.cash_session_id = cs.id AND cm.movement_kind IN ('refund', 'withdrawal')), 0)
  FROM public.cash_sessions cs
  WHERE cs.id = p_session_id;
$$;

CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_cash_session_id UUID,
  p_counted_cash money_amount,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_sess RECORD;
  v_expected money_amount;
  v_diff money_amount;
  v_journal_id UUID;
  v_acct_cash UUID;
  v_acct_variance UUID;
BEGIN
  PERFORM public.require_permission('cash.session.close');
  PERFORM public.require_open_accounting_period(CURRENT_DATE);
  v_company := public.current_company_id();
  SELECT * INTO v_sess FROM public.cash_sessions
  WHERE id = p_cash_session_id AND company_id = v_company AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión de caja no encontrada o ya cerrada';
  END IF;
  v_expected := public._cash_session_expected(p_cash_session_id);
  v_diff := p_counted_cash - v_expected;
  SELECT id INTO v_acct_cash FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1000';
  SELECT id INTO v_acct_variance FROM public.chart_of_accounts WHERE company_id = v_company AND code = '6200';

  IF v_diff <> 0 THEN
    INSERT INTO public.journal_entries (
      company_id, status, description, source_document_type, source_document_id,
      idempotency_key, created_by, confirmed_at
    ) VALUES (
      v_company, 'confirmed', 'Diferencia cierre de caja',
      'cash_session', p_cash_session_id,
      'je-cash-close-' || p_cash_session_id::text, auth.uid(), now()
    ) RETURNING id INTO v_journal_id;
    IF v_diff > 0 THEN
      INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
        (v_journal_id, v_company, v_acct_cash, 1, v_diff, 0, 'Sobrante caja'),
        (v_journal_id, v_company, v_acct_variance, 2, 0, v_diff, 'Ajuste cierre caja');
    ELSE
      INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
        (v_journal_id, v_company, v_acct_variance, 1, abs(v_diff), 0, 'Faltante caja'),
        (v_journal_id, v_company, v_acct_cash, 2, 0, abs(v_diff), 'Ajuste cierre caja');
    END IF;
    PERFORM public.assert_journal_balanced(v_journal_id);
  END IF;

  UPDATE public.cash_sessions
  SET status = 'closed',
      closed_at = now(),
      closed_by = auth.uid(),
      expected_cash = v_expected,
      counted_cash = p_counted_cash,
      difference = v_diff,
      close_journal_entry_id = v_journal_id,
      notes = p_notes
  WHERE id = p_cash_session_id;

  PERFORM public.log_audit('cash.session.closed', 'cash_session', p_cash_session_id, p_notes);
  RETURN jsonb_build_object(
    'expected_cash', v_expected,
    'counted_cash', p_counted_cash,
    'difference', v_diff,
    'journal_entry_id', v_journal_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.close_accounting_period(p_period_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
BEGIN
  PERFORM public.require_permission('accounting.period.close');
  v_company := public.current_company_id();
  UPDATE public.accounting_periods
  SET status = 'closed', closed_at = now(), closed_by = auth.uid()
  WHERE id = p_period_id AND company_id = v_company AND status = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Período no encontrado o ya cerrado';
  END IF;
  PERFORM public.log_audit('accounting.period.closed', 'accounting_period', p_period_id, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_journal_entry(
  p_entry_id UUID,
  p_reason TEXT,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_src RECORD;
  v_rev_id UUID;
  v_ln RECORD;
  v_n SMALLINT := 0;
  v_existing UUID;
BEGIN
  PERFORM public.require_permission('document.reverse');
  PERFORM public.require_open_accounting_period(CURRENT_DATE);
  v_company := public.current_company_id();

  SELECT result_entity_id INTO v_existing FROM public.operation_idempotency
  WHERE company_id = v_company AND operation = 'journal_reversal' AND idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_src FROM public.journal_entries
  WHERE id = p_entry_id AND company_id = v_company AND status = 'confirmed' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asiento no encontrado';
  END IF;
  IF v_src.reversed_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'Asiento ya es reversión';
  END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.reversed_entry_id = p_entry_id) THEN
    RAISE EXCEPTION 'Asiento ya fue revertido';
  END IF;

  INSERT INTO public.journal_entries (
    company_id, status, description, source_document_type, source_document_id,
    idempotency_key, reversed_entry_id, created_by, confirmed_at, entry_date
  ) VALUES (
    v_company, 'confirmed', 'Reversión: ' || v_src.description,
    v_src.source_document_type, v_src.source_document_id,
    p_idempotency_key, p_entry_id, auth.uid(), now(), v_src.entry_date
  ) RETURNING id INTO v_rev_id;

  FOR v_ln IN
    SELECT * FROM public.journal_lines WHERE journal_entry_id = p_entry_id ORDER BY line_number
  LOOP
    v_n := v_n + 1;
    INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo)
    VALUES (v_rev_id, v_company, v_ln.account_id, v_n, v_ln.credit, v_ln.debit, 'Reversión: ' || COALESCE(v_ln.memo, ''));
  END LOOP;

  PERFORM public.assert_journal_balanced(v_rev_id);
  INSERT INTO public.operation_idempotency (company_id, operation, idempotency_key, payload_hash, result_entity_id)
  VALUES (v_company, 'journal_reversal', p_idempotency_key, md5(p_entry_id::text || p_reason), v_rev_id);
  PERFORM public.log_audit('accounting.journal.reversed', 'journal_entry', v_rev_id, p_reason);
  RETURN v_rev_id;
END;
$$;

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_credit_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY cash_movements_select ON public.cash_movements
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());

CREATE POLICY customer_credit_select ON public.customer_credit_balances
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());

GRANT EXECUTE ON FUNCTION public.open_cash_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_open_cash_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_cash_movement TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_accounting_period TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_journal_entry TO authenticated;
