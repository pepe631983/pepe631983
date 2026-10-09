-- Toma atómica de trabajos de impresión y refuerzo RLS
ALTER TABLE public.print_jobs
  ADD COLUMN IF NOT EXISTS processing_device TEXT,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.claim_print_job(
  p_job_id UUID,
  p_device_fingerprint TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_claimed UUID;
BEGIN
  PERFORM public.require_permission('print.execute');
  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Sin empresa activa';
  END IF;

  UPDATE public.print_jobs
  SET status = 'sending',
      processing_device = p_device_fingerprint,
      processing_started_at = now(),
      attempt_count = attempt_count + 1,
      updated_at = now()
  WHERE id = p_job_id
    AND company_id = v_company
    AND status = 'pending'
    AND processing_device IS NULL
  RETURNING id INTO v_claimed;

  IF v_claimed IS NULL THEN
    RAISE EXCEPTION 'Trabajo no disponible (otro dispositivo lo procesa o ya no está pendiente)';
  END IF;

  RETURN v_claimed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_print_job TO authenticated;

-- Sin INSERT directo en print_jobs desde clientes (solo funciones SECURITY DEFINER)
CREATE POLICY print_jobs_no_direct_insert ON public.print_jobs
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY print_device_bindings_insert ON public.print_device_bindings
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('print.configure'));

CREATE POLICY print_device_bindings_update ON public.print_device_bindings
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_permission('print.configure'))
  WITH CHECK (company_id = public.current_company_id());
