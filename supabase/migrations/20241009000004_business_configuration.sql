-- Configuración comercial y operativa (impuestos configurables, sin inventar requisitos fiscales)
CREATE TABLE public.company_contacts (
  company_id UUID PRIMARY KEY REFERENCES public.companies (id) ON DELETE CASCADE,
  public_email CITEXT,
  public_phone TEXT,
  website TEXT,
  tax_id_label TEXT DEFAULT 'RFC / ID fiscal',
  tax_id_value TEXT,
  tax_config_pending BOOLEAN NOT NULL DEFAULT true,
  notes TEXT
);

CREATE TABLE public.tax_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  rate_percent NUMERIC(9, 4) NOT NULL CHECK (rate_percent >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default_sales BOOLEAN NOT NULL DEFAULT false,
  is_recoverable_purchase BOOLEAN NOT NULL DEFAULT true,
  legal_format_pending BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE INDEX idx_tax_rates_company ON public.tax_rates (company_id);

CREATE TABLE public.document_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches (id) ON DELETE RESTRICT,
  document_type TEXT NOT NULL,
  prefix TEXT NOT NULL DEFAULT '',
  next_number BIGINT NOT NULL DEFAULT 1 CHECK (next_number >= 1),
  padding SMALLINT NOT NULL DEFAULT 6 CHECK (padding BETWEEN 1 AND 12),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, document_type, branch_id, prefix)
);

CREATE INDEX idx_document_series_company ON public.document_series (company_id);

CREATE TABLE public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('cash', 'card', 'transfer', 'check', 'other')),
  requires_reference BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  gl_account_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE INDEX idx_payment_methods_company ON public.payment_methods (company_id);

CREATE TABLE public.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bank_name TEXT,
  account_number_masked TEXT,
  currency_code CHAR(3) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  gl_account_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bank_accounts_company ON public.bank_accounts (company_id);

CREATE TABLE public.business_policies (
  company_id UUID PRIMARY KEY REFERENCES public.companies (id) ON DELETE CASCADE,
  max_discount_percent NUMERIC(9, 4) NOT NULL DEFAULT 0,
  allow_sell_below_cost BOOLEAN NOT NULL DEFAULT false,
  default_credit_days INTEGER NOT NULL DEFAULT 0 CHECK (default_credit_days >= 0),
  return_window_days INTEGER NOT NULL DEFAULT 30 CHECK (return_window_days >= 0),
  warranty_requires_approval BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_business_policies_updated
  BEFORE UPDATE ON public.business_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
