-- Caja y devoluciones (base; escenario completo en siguiente iteración)

CREATE TABLE public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.branches (id) ON DELETE RESTRICT,
  opened_by UUID REFERENCES auth.users (id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  opening_float money_amount NOT NULL DEFAULT 0,
  expected_cash money_amount NOT NULL DEFAULT 0,
  counted_cash money_amount,
  difference money_amount,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
);

CREATE INDEX idx_cash_sessions_company ON public.cash_sessions (company_id, opened_at DESC);

CREATE TABLE public.sales_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  original_invoice_id UUID NOT NULL REFERENCES public.sales_invoices (id) ON DELETE RESTRICT,
  return_number TEXT,
  status public.document_status NOT NULL DEFAULT 'draft',
  total_refund money_amount NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL,
  journal_entry_id UUID REFERENCES public.journal_entries (id),
  confirmed_at TIMESTAMPTZ,
  reason TEXT,
  UNIQUE (company_id, idempotency_key)
);

-- Placeholder: confirmación en migración siguiente (inventario + contra-ingreso + caja/CxC)
COMMENT ON TABLE public.sales_returns IS 'Devoluciones vinculadas a factura original; sin modificar documento origen.';

ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY cash_sessions_select ON public.cash_sessions
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());

CREATE POLICY sales_returns_select ON public.sales_returns
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());
