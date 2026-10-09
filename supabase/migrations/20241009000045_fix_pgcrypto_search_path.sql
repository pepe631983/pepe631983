-- digest/gen_random_bytes viven en schema extensions (Supabase pgcrypto)

CREATE OR REPLACE FUNCTION public.issue_quote_public_link(
  p_quote_id UUID,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company UUID := public.current_company_id();
  v_token TEXT := encode(gen_random_bytes(32), 'hex');
  v_hash TEXT := encode(digest(v_token, 'sha256'), 'hex');
BEGIN
  PERFORM public.require_permission('sales.quote.manage');
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_quotes WHERE id = p_quote_id AND company_id = v_company AND status IN ('sent', 'accepted')
  ) THEN
    RAISE EXCEPTION 'Cotización no publicable';
  END IF;
  UPDATE public.sales_quote_public_links SET revoked_at = now()
  WHERE sales_quote_id = p_quote_id AND revoked_at IS NULL;
  INSERT INTO public.sales_quote_public_links (company_id, sales_quote_id, token_hash, expires_at, created_by)
  VALUES (v_company, p_quote_id, v_hash, p_expires_at, auth.uid());
  PERFORM public.log_audit('sales.quote.link_issued', 'sales_quote', p_quote_id, NULL);
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_quote_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT := encode(digest(p_token, 'sha256'), 'hex');
  v_link RECORD;
  v_q RECORD;
  v_lines JSONB;
BEGIN
  SELECT * INTO v_link FROM public.sales_quote_public_links
  WHERE token_hash = v_hash AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enlace no válido o revocado';
  END IF;
  UPDATE public.sales_quote_public_links SET last_viewed_at = now() WHERE id = v_link.id;
  SELECT * INTO v_q FROM public.sales_quotes WHERE id = v_link.sales_quote_id AND status IN ('sent', 'accepted');
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no disponible'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'description', sql.description,
    'quantity', sql.quantity,
    'unit_price', sql.unit_price,
    'discount', sql.discount,
    'line_subtotal', sql.line_subtotal
  ) ORDER BY sql.line_number), '[]'::jsonb) INTO v_lines
  FROM public.sales_quote_lines sql WHERE sql.sales_quote_id = v_q.id;

  RETURN jsonb_build_object(
    'quote_number', v_q.quote_number,
    'status', v_q.status,
    'valid_until', v_q.valid_until,
    'subtotal', v_q.subtotal,
    'tax_total', v_q.tax_total,
    'total', v_q.total,
    'lines', v_lines,
    'customer_accepted_at', v_q.customer_accepted_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_public_quote(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT := encode(digest(p_token, 'sha256'), 'hex');
  v_link RECORD;
BEGIN
  SELECT * INTO v_link FROM public.sales_quote_public_links
  WHERE token_hash = v_hash AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());
  IF NOT FOUND THEN RAISE EXCEPTION 'Enlace no válido'; END IF;
  UPDATE public.sales_quotes
  SET status = 'accepted', customer_accepted_at = now()
  WHERE id = v_link.sales_quote_id AND status = 'sent';
END;
$$;
