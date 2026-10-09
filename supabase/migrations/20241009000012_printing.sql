-- Impresión: configuración por empresa y registro de trabajos (desacoplado de ventas)
CREATE TYPE public.print_paper_format AS ENUM ('letter', 'a4');
CREATE TYPE public.print_thermal_width AS ENUM ('58mm', '80mm');
CREATE TYPE public.print_channel AS ENUM ('system_dialog', 'pdf_download', 'direct_device');
CREATE TYPE public.print_job_status AS ENUM (
  'requested',
  'sent_to_spooler',
  'completed',
  'failed',
  'unknown'
);

CREATE TABLE public.print_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  profile_key TEXT NOT NULL CHECK (profile_key IN (
    'sales_invoice', 'quote', 'purchase_order', 'report', 'sales_receipt'
  )),
  paper_format public.print_paper_format NOT NULL DEFAULT 'letter',
  use_thermal BOOLEAN NOT NULL DEFAULT false,
  thermal_width public.print_thermal_width,
  margin_top_mm NUMERIC(5, 2) NOT NULL DEFAULT 10 CHECK (margin_top_mm >= 0),
  margin_right_mm NUMERIC(5, 2) NOT NULL DEFAULT 10 CHECK (margin_right_mm >= 0),
  margin_bottom_mm NUMERIC(5, 2) NOT NULL DEFAULT 10 CHECK (margin_bottom_mm >= 0),
  margin_left_mm NUMERIC(5, 2) NOT NULL DEFAULT 10 CHECK (margin_left_mm >= 0),
  default_copies SMALLINT NOT NULL DEFAULT 1 CHECK (default_copies BETWEEN 1 AND 10),
  content_options JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, profile_key),
  CHECK (
    (use_thermal = false AND thermal_width IS NULL)
    OR (use_thermal = true AND thermal_width IS NOT NULL)
  )
);

CREATE INDEX idx_print_profiles_company ON public.print_profiles (company_id);

CREATE TRIGGER trg_print_profiles_updated
  BEFORE UPDATE ON public.print_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  user_id UUID REFERENCES auth.users (id),
  profile_key TEXT NOT NULL,
  channel public.print_channel NOT NULL,
  status public.print_job_status NOT NULL DEFAULT 'requested',
  source_document_type TEXT,
  source_document_id UUID,
  is_reprint BOOLEAN NOT NULL DEFAULT false,
  is_marked_copy BOOLEAN NOT NULL DEFAULT false,
  copies_requested SMALLINT NOT NULL DEFAULT 1,
  client_request_id TEXT NOT NULL,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, client_request_id)
);

CREATE INDEX idx_print_jobs_company_created ON public.print_jobs (company_id, created_at DESC);
CREATE INDEX idx_print_jobs_source ON public.print_jobs (source_document_type, source_document_id);

CREATE TRIGGER trg_print_jobs_updated
  BEFORE UPDATE ON public.print_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.permissions (code, module, description) VALUES
  ('print.configure', 'printing', 'Configurar perfiles de impresión'),
  ('print.execute', 'printing', 'Imprimir, previsualizar y descargar PDF')
ON CONFLICT (code) DO NOTHING;

-- Propietario y gerente: permisos de impresión
INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM public.roles r
CROSS JOIN (VALUES ('print.configure'), ('print.execute')) AS p(code)
WHERE r.code IN ('owner', 'manager')
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_code = p.code
  );

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, 'print.execute'
FROM public.roles r
WHERE r.code IN ('seller', 'cashier')
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_code = 'print.execute'
  );

CREATE OR REPLACE FUNCTION public.seed_print_profiles(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.print_profiles (company_id, profile_key, paper_format, use_thermal, thermal_width, margin_top_mm, margin_left_mm, content_options) VALUES
    (p_company_id, 'sales_invoice', 'letter', false, NULL, 12, 12, '{"showLogo":true,"showTaxId":true,"showCustomer":true}'::jsonb),
    (p_company_id, 'quote', 'letter', false, NULL, 12, 12, '{"showLogo":true,"showTaxId":false,"showCustomer":true}'::jsonb),
    (p_company_id, 'purchase_order', 'a4', false, NULL, 12, 12, '{"showLogo":true,"showTaxId":true}'::jsonb),
    (p_company_id, 'report', 'a4', false, NULL, 10, 10, '{"showLogo":true}'::jsonb),
    (p_company_id, 'sales_receipt', 'letter', true, '80mm', 2, 2, '{"showLogo":true,"showCustomer":true,"footerText":""}'::jsonb)
  ON CONFLICT (company_id, profile_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_print_job(
  p_profile_key TEXT,
  p_channel public.print_channel,
  p_client_request_id TEXT,
  p_source_document_type TEXT DEFAULT NULL,
  p_source_document_id UUID DEFAULT NULL,
  p_is_reprint BOOLEAN DEFAULT false,
  p_is_marked_copy BOOLEAN DEFAULT false,
  p_copies_requested SMALLINT DEFAULT 1,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_job_id UUID;
BEGIN
  PERFORM public.require_permission('print.execute');
  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Sin empresa activa';
  END IF;

  INSERT INTO public.print_jobs (
    company_id, user_id, profile_key, channel, status,
    source_document_type, source_document_id,
    is_reprint, is_marked_copy, copies_requested, client_request_id, metadata
  ) VALUES (
    v_company, auth.uid(), p_profile_key, p_channel, 'requested',
    p_source_document_type, p_source_document_id,
    p_is_reprint, p_is_marked_copy, p_copies_requested, p_client_request_id, COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (company_id, client_request_id) DO UPDATE
    SET updated_at = now()
  RETURNING id INTO v_job_id;

  IF v_job_id IS NULL THEN
    SELECT id INTO v_job_id FROM public.print_jobs
    WHERE company_id = v_company AND client_request_id = p_client_request_id;
  END IF;

  RETURN v_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_print_job_status(
  p_job_id UUID,
  p_status public.print_job_status,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
BEGIN
  PERFORM public.require_permission('print.execute');
  v_company := public.current_company_id();
  UPDATE public.print_jobs
  SET status = p_status,
      error_message = p_error_message,
      updated_at = now()
  WHERE id = p_job_id AND company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trabajo de impresión no encontrado';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_print_job TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_print_job_status TO authenticated;

-- Perfiles para empresas existentes
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.companies LOOP
    PERFORM public.seed_print_profiles(r.id);
  END LOOP;
END $$;

-- Incluir en alta de empresa
CREATE OR REPLACE FUNCTION public.seed_operational_defaults(p_company_id UUID, p_branch_id UUID, p_warehouse_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caja UUID;
  v_banco UUID;
BEGIN
  SELECT id INTO v_caja FROM public.chart_of_accounts WHERE company_id = p_company_id AND code = '1000';
  SELECT id INTO v_banco FROM public.chart_of_accounts WHERE company_id = p_company_id AND code = '1010';

  INSERT INTO public.payment_methods (company_id, code, name, kind, gl_account_id) VALUES
    (p_company_id, 'CASH', 'Efectivo', 'cash', v_caja),
    (p_company_id, 'CARD', 'Tarjeta', 'card', NULL),
    (p_company_id, 'TRANSFER', 'Transferencia', 'transfer', v_banco);

  INSERT INTO public.document_series (company_id, branch_id, document_type, prefix, next_number) VALUES
    (p_company_id, p_branch_id, 'sales_invoice', 'V', 1),
    (p_company_id, p_branch_id, 'quote', 'C', 1),
    (p_company_id, p_branch_id, 'purchase_order', 'OC', 1),
    (p_company_id, p_branch_id, 'goods_receipt', 'REC', 1);

  INSERT INTO public.business_policies (company_id) VALUES (p_company_id)
  ON CONFLICT (company_id) DO NOTHING;

  INSERT INTO public.company_contacts (company_id, tax_config_pending) VALUES (p_company_id, true)
  ON CONFLICT (company_id) DO NOTHING;

  PERFORM public.seed_print_profiles(p_company_id);
END;
$$;

ALTER TABLE public.print_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY print_profiles_select ON public.print_profiles
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY print_profiles_update ON public.print_profiles
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_permission('print.configure'))
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY print_jobs_select ON public.print_jobs
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.has_permission('print.execute'));
