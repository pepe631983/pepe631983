-- Cola persistente, estados ampliados y configuración por dispositivo/función
ALTER TYPE public.print_channel ADD VALUE IF NOT EXISTS 'rawbt_android';
ALTER TYPE public.print_channel ADD VALUE IF NOT EXISTS 'electron_direct';
ALTER TYPE public.print_channel ADD VALUE IF NOT EXISTS 'local_agent';
ALTER TYPE public.print_channel ADD VALUE IF NOT EXISTS 'airprint_via_system';

ALTER TYPE public.print_job_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE public.print_job_status ADD VALUE IF NOT EXISTS 'sending';
ALTER TYPE public.print_job_status ADD VALUE IF NOT EXISTS 'uncertain';
ALTER TYPE public.print_job_status ADD VALUE IF NOT EXISTS 'confirmed_printed';

CREATE TYPE public.print_function AS ENUM ('ticket', 'invoice', 'report');

CREATE TABLE public.print_device_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users (id),
  device_fingerprint TEXT NOT NULL,
  device_label TEXT,
  print_function public.print_function NOT NULL,
  adapter TEXT NOT NULL CHECK (adapter IN (
    'web_system', 'web_pdf', 'electron_direct', 'rawbt_android', 'local_agent', 'airprint_via_system'
  )),
  printer_name TEXT,
  paper_hint TEXT CHECK (paper_hint IN ('58mm', '80mm', 'letter', 'a4')),
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, device_fingerprint, print_function)
);

CREATE INDEX idx_print_device_bindings_company ON public.print_device_bindings (company_id);

CREATE TRIGGER trg_print_device_bindings_updated
  BEFORE UPDATE ON public.print_device_bindings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.print_jobs
  ADD COLUMN IF NOT EXISTS print_function public.print_function,
  ADD COLUMN IF NOT EXISTS device_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS printer_name TEXT,
  ADD COLUMN IF NOT EXISTS paper_hint TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS payload_storage_key TEXT;

-- Normalizar estados legacy
UPDATE public.print_jobs SET status = 'pending' WHERE status = 'requested';
UPDATE public.print_jobs SET status = 'uncertain' WHERE status = 'unknown';

ALTER TABLE public.print_jobs ALTER COLUMN status SET DEFAULT 'pending';

CREATE INDEX idx_print_jobs_queue ON public.print_jobs (company_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.recover_stale_print_jobs(p_stale_minutes INTEGER DEFAULT 5)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM public.require_permission('print.execute');
  UPDATE public.print_jobs
  SET status = 'uncertain',
      error_message = COALESCE(error_message, 'Sesión interrumpida; resultado incierto'),
      updated_at = now()
  WHERE company_id = public.current_company_id()
    AND status = 'sending'
    AND updated_at < now() - (p_stale_minutes || ' minutes')::interval;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_print_job(
  p_profile_key TEXT,
  p_channel public.print_channel,
  p_client_request_id TEXT,
  p_source_document_type TEXT DEFAULT NULL,
  p_source_document_id UUID DEFAULT NULL,
  p_is_reprint BOOLEAN DEFAULT FALSE,
  p_is_marked_copy BOOLEAN DEFAULT FALSE,
  p_copies_requested SMALLINT DEFAULT 1,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_print_function public.print_function DEFAULT NULL,
  p_device_fingerprint TEXT DEFAULT NULL,
  p_printer_name TEXT DEFAULT NULL,
  p_paper_hint TEXT DEFAULT NULL
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
    is_reprint, is_marked_copy, copies_requested, client_request_id, metadata,
    print_function, device_fingerprint, printer_name, paper_hint, attempt_count
  ) VALUES (
    v_company, auth.uid(), p_profile_key, p_channel, 'pending',
    p_source_document_type, p_source_document_id,
    p_is_reprint, p_is_marked_copy, p_copies_requested, p_client_request_id, COALESCE(p_metadata, '{}'::jsonb),
    p_print_function, p_device_fingerprint, p_printer_name, p_paper_hint, 0
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
  p_error_message TEXT DEFAULT NULL,
  p_increment_attempt BOOLEAN DEFAULT FALSE
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
      attempt_count = CASE WHEN p_increment_attempt THEN attempt_count + 1 ELSE attempt_count END,
      updated_at = now()
  WHERE id = p_job_id AND company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trabajo de impresión no encontrado';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recover_stale_print_jobs TO authenticated;

ALTER TABLE public.print_device_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY print_device_bindings_select ON public.print_device_bindings
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY print_device_bindings_upsert ON public.print_device_bindings
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.has_permission('print.configure'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('print.configure'));
