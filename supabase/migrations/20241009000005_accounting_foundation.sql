-- Plan de cuentas y períodos contables (asientos en etapa 2)
CREATE TABLE public.chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type public.account_type NOT NULL,
  parent_id UUID REFERENCES public.chart_of_accounts (id) ON DELETE RESTRICT,
  is_postable BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE INDEX idx_coa_company ON public.chart_of_accounts (company_id);
CREATE INDEX idx_coa_parent ON public.chart_of_accounts (parent_id);

ALTER TABLE public.payment_methods
  ADD CONSTRAINT payment_methods_gl_account_fk
  FOREIGN KEY (gl_account_id) REFERENCES public.chart_of_accounts (id) ON DELETE SET NULL;

ALTER TABLE public.bank_accounts
  ADD CONSTRAINT bank_accounts_gl_account_fk
  FOREIGN KEY (gl_account_id) REFERENCES public.chart_of_accounts (id) ON DELETE SET NULL;

CREATE TABLE public.accounting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status public.accounting_period_status NOT NULL DEFAULT 'open',
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  UNIQUE (company_id, period_start, period_end)
);

CREATE INDEX idx_accounting_periods_company ON public.accounting_periods (company_id);

-- Reservado para etapa 2: asientos confirmados inmutables
CREATE TABLE public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  entry_number BIGINT,
  status public.document_status NOT NULL DEFAULT 'draft',
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  source_document_type TEXT,
  source_document_id UUID,
  idempotency_key TEXT,
  reversed_entry_id UUID REFERENCES public.journal_entries (id),
  created_by UUID REFERENCES auth.users (id),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);

CREATE INDEX idx_journal_entries_company ON public.journal_entries (company_id);
CREATE INDEX idx_journal_entries_source ON public.journal_entries (source_document_type, source_document_id);

CREATE TABLE public.journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts (id) ON DELETE RESTRICT,
  line_number SMALLINT NOT NULL,
  debit money_amount NOT NULL DEFAULT 0,
  credit money_amount NOT NULL DEFAULT 0,
  memo TEXT,
  CHECK (debit >= 0 AND credit >= 0),
  CHECK (NOT (debit > 0 AND credit > 0)),
  UNIQUE (journal_entry_id, line_number)
);

CREATE INDEX idx_journal_lines_entry ON public.journal_lines (journal_entry_id);
CREATE INDEX idx_journal_lines_account ON public.journal_lines (account_id);
