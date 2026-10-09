-- Requisitos cliente TCI — fase 1 (cotizaciones, inventario consulta, clientes, exportación base)
-- No sustituye POS/caja existentes; extiende el modelo.

INSERT INTO public.permissions (code, module, description) VALUES
  ('sales.quote.manage', 'sales', 'Crear y publicar cotizaciones'),
  ('sales.quote.convert', 'sales', 'Convertir cotización aceptada en venta'),
  ('data.export', 'admin', 'Exportar datos de la empresa (CSV/JSON)'),
  ('inventory.consult', 'inventory', 'Consultar existencias sin ver costos')
ON CONFLICT (code) DO NOTHING;

-- Catálogo extendido
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS oem_reference TEXT,
  ADD COLUMN IF NOT EXISTS barcode TEXT;

CREATE TABLE IF NOT EXISTS public.product_vehicle_fitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year_from SMALLINT,
  year_to SMALLINT,
  engine_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fitments_product ON public.product_vehicle_fitments (product_id);
CREATE INDEX IF NOT EXISTS idx_fitments_search ON public.product_vehicle_fitments (company_id, make, model);

-- Clientes extendidos
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS email CITEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS credit_limit money_amount,
  ADD COLUMN IF NOT EXISTS credit_days INTEGER CHECK (credit_days IS NULL OR credit_days >= 0),
  ADD COLUMN IF NOT EXISTS store_credit_balance money_amount NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email CITEXT,
  phone TEXT,
  role_label TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  make TEXT,
  model TEXT,
  year SMALLINT,
  vin TEXT,
  plate TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cotizaciones
CREATE TABLE IF NOT EXISTS public.sales_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.branches (id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses (id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES public.customers (id),
  quote_number TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'converted', 'expired', 'cancelled')),
  valid_until DATE,
  subtotal money_amount NOT NULL DEFAULT 0,
  discount_total money_amount NOT NULL DEFAULT 0,
  tax_total money_amount NOT NULL DEFAULT 0,
  total money_amount NOT NULL DEFAULT 0,
  tax_rate_id UUID REFERENCES public.tax_rates (id),
  customer_accepted_at TIMESTAMPTZ,
  converted_invoice_id UUID REFERENCES public.sales_invoices (id),
  idempotency_key TEXT NOT NULL,
  created_by UUID REFERENCES auth.users (id),
  confirmed_by UUID REFERENCES auth.users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.sales_quote_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_quote_id UUID NOT NULL REFERENCES public.sales_quotes (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  line_number SMALLINT NOT NULL,
  description TEXT NOT NULL,
  quantity quantity_amount NOT NULL CHECK (quantity > 0),
  unit_price money_amount NOT NULL,
  discount money_amount NOT NULL DEFAULT 0,
  line_subtotal money_amount NOT NULL,
  UNIQUE (sales_quote_id, line_number)
);

CREATE TABLE IF NOT EXISTS public.sales_quote_public_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  sales_quote_id UUID NOT NULL REFERENCES public.sales_quotes (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_viewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_quotes_company ON public.sales_quotes (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_links_quote ON public.sales_quote_public_links (sales_quote_id);

-- Reserva blanda: cantidades en cotizaciones sent/accepted (no convierte stock físico)
CREATE OR REPLACE FUNCTION public._quote_reserved_qty(p_warehouse_id UUID, p_product_id UUID)
RETURNS quantity_amount
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(SUM(sql.quantity), 0)::quantity_amount
  FROM public.sales_quote_lines sql
  JOIN public.sales_quotes sq ON sq.id = sql.sales_quote_id
  WHERE sq.warehouse_id = p_warehouse_id
    AND sql.product_id = p_product_id
    AND sq.status IN ('sent', 'accepted');
$$;

CREATE OR REPLACE FUNCTION public.search_inventory_availability(
  p_query TEXT,
  p_warehouse_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := public.current_company_id();
  v_wh UUID := p_warehouse_id;
  v_rows JSONB := '[]'::jsonb;
  v_show_cost BOOLEAN := public.has_permission('cost.view');
BEGIN
  PERFORM public.require_permission('inventory.consult');
  IF v_wh IS NULL THEN
    SELECT id INTO v_wh FROM public.warehouses WHERE company_id = v_company AND is_default = true LIMIT 1;
  END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      p.id AS product_id,
      p.internal_code,
      p.name,
      p.oem_reference,
      ib.warehouse_id,
      w.name AS warehouse_name,
      ib.quantity AS on_hand,
      public._quote_reserved_qty(ib.warehouse_id, p.id) AS reserved,
      GREATEST(ib.quantity - public._quote_reserved_qty(ib.warehouse_id, p.id), 0)::quantity_amount AS available,
      CASE WHEN v_show_cost THEN ib.avg_unit_cost ELSE NULL END AS avg_unit_cost
    FROM public.products p
    JOIN public.inventory_balances ib ON ib.product_id = p.id AND ib.company_id = v_company
    JOIN public.warehouses w ON w.id = ib.warehouse_id
    LEFT JOIN public.product_vehicle_fitments f ON f.product_id = p.id
    WHERE p.company_id = v_company
      AND p.is_active = true
      AND (v_wh IS NULL OR ib.warehouse_id = v_wh)
      AND (
        p_query IS NULL OR btrim(p_query) = '' OR
        p.name ILIKE '%' || p_query || '%' OR
        p.internal_code ILIKE '%' || p_query || '%' OR
        COALESCE(p.oem_reference, '') ILIKE '%' || p_query || '%' OR
        COALESCE(p.barcode, '') ILIKE '%' || p_query || '%' OR
        COALESCE(f.make, '') ILIKE '%' || p_query || '%' OR
        COALESCE(f.model, '') ILIKE '%' || p_query || '%'
      )
    ORDER BY p.name
    LIMIT 100
  ) t;
  RETURN jsonb_build_object('warehouse_id', v_wh, 'items', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.find_customer_duplicates(
  p_name TEXT,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := public.current_company_id();
  v_norm TEXT := lower(btrim(p_name));
BEGIN
  PERFORM public.require_permission('sales.confirm');
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'email', c.email,
      'phone', c.phone,
      'match_reason',
        CASE
          WHEN p_email IS NOT NULL AND c.email IS NOT NULL AND lower(c.email::text) = lower(p_email) THEN 'email'
          WHEN p_phone IS NOT NULL AND c.phone IS NOT NULL AND regexp_replace(c.phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g') THEN 'phone'
          WHEN lower(c.name) = v_norm THEN 'name'
          ELSE 'similar'
        END
    ))
    FROM public.customers c
    WHERE c.company_id = v_company
      AND c.is_active = true
      AND (
        lower(c.name) = v_norm
        OR (p_email IS NOT NULL AND c.email IS NOT NULL AND lower(c.email::text) = lower(p_email))
        OR (p_phone IS NOT NULL AND c.phone IS NOT NULL AND regexp_replace(c.phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g'))
        OR c.name ILIKE '%' || p_name || '%'
      )
    LIMIT 10
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_sales_quote(
  p_idempotency_key TEXT,
  p_customer_id UUID,
  p_lines JSONB,
  p_valid_until DATE DEFAULT NULL,
  p_tax_rate_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := public.current_company_id();
  v_branch UUID;
  v_wh UUID;
  v_quote UUID;
  v_num TEXT;
  v_line JSONB;
  v_ln SMALLINT := 0;
  v_sub money_amount := 0;
  v_disc money_amount := 0;
  v_tax money_amount := 0;
  v_rate NUMERIC := 0;
  v_prod RECORD;
  v_qty quantity_amount;
  v_price money_amount;
  v_line_disc money_amount;
  v_line_sub money_amount;
BEGIN
  PERFORM public.require_permission('sales.quote.manage');
  SELECT id INTO v_branch FROM public.branches WHERE company_id = v_company AND is_default = true LIMIT 1;
  SELECT id INTO v_wh FROM public.warehouses WHERE company_id = v_company AND is_default = true LIMIT 1;
  IF v_branch IS NULL OR v_wh IS NULL THEN
    RAISE EXCEPTION 'Sin sucursal o almacén predeterminado';
  END IF;
  IF p_tax_rate_id IS NOT NULL THEN
    SELECT rate_percent INTO v_rate FROM public.tax_rates WHERE id = p_tax_rate_id AND company_id = v_company;
  END IF;

  INSERT INTO public.sales_quotes (
    company_id, branch_id, warehouse_id, customer_id, status, valid_until,
    tax_rate_id, idempotency_key, created_by, confirmed_by
  ) VALUES (
    v_company, v_branch, v_wh, p_customer_id, 'draft', p_valid_until,
    p_tax_rate_id, p_idempotency_key, auth.uid(), auth.uid()
  ) RETURNING id INTO v_quote;

  v_num := public.next_document_number(v_company, 'quote', v_branch);
  UPDATE public.sales_quotes SET quote_number = v_num WHERE id = v_quote;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_ln := v_ln + 1;
    v_qty := (v_line->>'quantity')::numeric;
    v_price := (v_line->>'unit_price')::numeric;
    v_line_disc := COALESCE((v_line->>'discount')::numeric, 0);
    SELECT * INTO v_prod FROM public.products WHERE id = (v_line->>'product_id')::uuid AND company_id = v_company;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
    v_line_sub := v_qty * v_price - v_line_disc;
    v_sub := v_sub + v_line_sub;
    v_disc := v_disc + v_line_disc;
    INSERT INTO public.sales_quote_lines (
      sales_quote_id, company_id, product_id, line_number, description,
      quantity, unit_price, discount, line_subtotal
    ) VALUES (
      v_quote, v_company, v_prod.id, v_ln, v_prod.name,
      v_qty, v_price, v_line_disc, v_line_sub
    );
  END LOOP;

  IF v_rate > 0 THEN
    v_tax := round((v_sub * v_rate / 100)::numeric, 2);
  END IF;
  UPDATE public.sales_quotes
  SET subtotal = v_sub, discount_total = v_disc, tax_total = v_tax, total = v_sub + v_tax, status = 'sent'
  WHERE id = v_quote;

  PERFORM public.log_audit('sales.quote.created', 'sales_quote', v_quote, v_num);
  RETURN v_quote;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_quote_public_link(
  p_quote_id UUID,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.revoke_quote_public_link(p_quote_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission('sales.quote.manage');
  UPDATE public.sales_quote_public_links SET revoked_at = now()
  WHERE sales_quote_id = p_quote_id AND company_id = public.current_company_id() AND revoked_at IS NULL;
  PERFORM public.log_audit('sales.quote.link_revoked', 'sales_quote', p_quote_id, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_quote_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.convert_quote_to_sale(
  p_quote_id UUID,
  p_idempotency_key TEXT,
  p_payment_kind TEXT DEFAULT 'cash',
  p_amount_paid money_amount DEFAULT NULL,
  p_cash_session_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := public.current_company_id();
  v_q RECORD;
  v_line RECORD;
  v_avail quantity_amount;
  v_lines JSONB := '[]'::jsonb;
  v_inv UUID;
BEGIN
  PERFORM public.require_permission('sales.quote.convert');
  PERFORM public.require_open_accounting_period(CURRENT_DATE);
  SELECT * INTO v_q FROM public.sales_quotes
  WHERE id = p_quote_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;
  IF v_q.status <> 'accepted' THEN
    RAISE EXCEPTION 'La cotización debe estar aceptada por el cliente antes de convertir (estado %)', v_q.status;
  END IF;
  IF v_q.valid_until IS NOT NULL AND v_q.valid_until < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cotización vencida';
  END IF;

  FOR v_line IN SELECT * FROM public.sales_quote_lines WHERE sales_quote_id = p_quote_id ORDER BY line_number
  LOOP
    SELECT ib.quantity INTO v_avail
    FROM public.inventory_balances ib
    WHERE ib.warehouse_id = v_q.warehouse_id AND ib.product_id = v_line.product_id;
    IF COALESCE(v_avail, 0) < v_line.quantity THEN
      RAISE EXCEPTION 'Stock insuficiente para % (disp. %, req. %)', v_line.description, COALESCE(v_avail, 0), v_line.quantity;
    END IF;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_line.product_id,
      'quantity', v_line.quantity,
      'unit_price', v_line.unit_price,
      'discount', v_line.discount
    );
  END LOOP;

  v_inv := public.confirm_pos_sale(
    p_idempotency_key,
    v_q.warehouse_id,
    p_payment_kind,
    p_amount_paid,
    v_lines,
    p_cash_session_id,
    v_q.tax_rate_id,
    NULL
  );

  UPDATE public.sales_quotes
  SET status = 'converted', converted_invoice_id = v_inv, confirmed_by = auth.uid()
  WHERE id = p_quote_id;

  PERFORM public.log_audit('sales.quote.converted', 'sales_quote', p_quote_id, v_inv::text);
  RETURN v_inv;
END;
$$;

CREATE OR REPLACE FUNCTION public.export_company_snapshot()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := public.current_company_id();
BEGIN
  PERFORM public.require_permission('data.export');
  RETURN jsonb_build_object(
    'exported_at', now(),
    'company_id', v_company,
    'schema_version', 'export-v1',
    'products', (SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM public.products p WHERE p.company_id = v_company),
    'customers', (SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb) FROM public.customers c WHERE c.company_id = v_company),
    'suppliers', (SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM public.suppliers s WHERE s.company_id = v_company),
    'inventory_balances', (SELECT COALESCE(jsonb_agg(to_jsonb(ib)), '[]'::jsonb) FROM public.inventory_balances ib WHERE ib.company_id = v_company),
    'sales_invoices', (SELECT COALESCE(jsonb_agg(to_jsonb(si)), '[]'::jsonb) FROM public.sales_invoices si WHERE si.company_id = v_company),
    'sales_quotes', (SELECT COALESCE(jsonb_agg(to_jsonb(sq)), '[]'::jsonb) FROM public.sales_quotes sq WHERE sq.company_id = v_company),
    'journal_entries', (SELECT COALESCE(jsonb_agg(to_jsonb(je)), '[]'::jsonb) FROM public.journal_entries je WHERE je.company_id = v_company)
  );
END;
$$;

-- RLS
ALTER TABLE public.product_vehicle_fitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_quote_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_quote_public_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY fitments_co ON public.product_vehicle_fitments FOR ALL TO authenticated
  USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());
CREATE POLICY cust_contacts_co ON public.customer_contacts FOR ALL TO authenticated
  USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());
CREATE POLICY cust_vehicles_co ON public.customer_vehicles FOR ALL TO authenticated
  USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());
CREATE POLICY quotes_co ON public.sales_quotes FOR ALL TO authenticated
  USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());
CREATE POLICY quote_lines_co ON public.sales_quote_lines FOR ALL TO authenticated
  USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());
CREATE POLICY quote_links_co ON public.sales_quote_public_links FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
CREATE POLICY quote_links_manage ON public.sales_quote_public_links FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.has_permission('sales.quote.manage'))
  WITH CHECK (company_id = public.current_company_id());

GRANT EXECUTE ON FUNCTION public.search_inventory_availability TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_customer_duplicates TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sales_quote TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_quote_public_link TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_quote_public_link TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quote_to_sale TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_company_snapshot TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_quote_by_token TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_public_quote TO anon, authenticated;

-- Permisos nuevos en empresas existentes
INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM public.roles r
CROSS JOIN (
  VALUES
    ('sales.quote.manage'),
    ('sales.quote.convert'),
    ('inventory.consult'),
    ('data.export')
) AS p(code)
WHERE r.code IN ('owner', 'manager')
   OR (r.code = 'seller' AND p.code IN ('sales.quote.manage', 'inventory.consult'))
   OR (r.code = 'inventory_clerk' AND p.code = 'inventory.consult')
ON CONFLICT DO NOTHING;
