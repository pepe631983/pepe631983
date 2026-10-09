-- TCI Auto Zone — valores por defecto regionales (Turks and Caicos, USD)
ALTER TABLE public.companies
  ALTER COLUMN country_code SET DEFAULT 'TC',
  ALTER COLUMN timezone SET DEFAULT 'America/Grand_Turk',
  ALTER COLUMN primary_currency_code SET DEFAULT 'USD';

ALTER TABLE public.company_contacts
  ALTER COLUMN tax_id_label SET DEFAULT 'Tax ID / ID fiscal';

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS preferred_locale TEXT NOT NULL DEFAULT 'es'
  CHECK (preferred_locale IN ('es', 'en'));

COMMENT ON COLUMN public.companies.preferred_locale IS 'Idioma preferido para documentos y reportes de la empresa';

CREATE OR REPLACE FUNCTION public.create_company_with_owner(
  p_commercial_name TEXT,
  p_full_name TEXT,
  p_country_code CHAR(2) DEFAULT 'TC',
  p_timezone TEXT DEFAULT 'America/Grand_Turk',
  p_currency_code CHAR(3) DEFAULT 'USD',
  p_is_demo BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_branch_id UUID;
  v_warehouse_id UUID;
  v_owner_role UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debe iniciar sesión para registrar la empresa';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Este usuario ya pertenece a una empresa';
  END IF;

  INSERT INTO public.companies (
    commercial_name, country_code, timezone, primary_currency_code, is_demo, preferred_locale
  ) VALUES (
    p_commercial_name, p_country_code, p_timezone, p_currency_code, p_is_demo, 'es'
  ) RETURNING id INTO v_company_id;

  INSERT INTO public.branches (company_id, code, name, is_default)
  VALUES (v_company_id, 'MAIN', 'Sucursal principal', true)
  RETURNING id INTO v_branch_id;

  INSERT INTO public.warehouses (company_id, branch_id, code, name, is_default)
  VALUES (v_company_id, v_branch_id, 'WH1', 'Almacén principal', true)
  RETURNING id INTO v_warehouse_id;

  INSERT INTO public.profiles (user_id, company_id, full_name)
  VALUES (auth.uid(), v_company_id, p_full_name);

  PERFORM public.seed_chart_of_accounts(v_company_id);
  PERFORM public.seed_default_roles(v_company_id);
  PERFORM public.seed_operational_defaults(v_company_id, v_branch_id, v_warehouse_id);

  SELECT id INTO v_owner_role FROM public.roles WHERE company_id = v_company_id AND code = 'owner';
  INSERT INTO public.user_roles (user_id, role_id, assigned_by) VALUES (auth.uid(), v_owner_role, auth.uid());

  INSERT INTO public.accounting_periods (company_id, name, period_start, period_end)
  VALUES (
    v_company_id,
    to_char(CURRENT_DATE, 'YYYY-MM'),
    date_trunc('month', CURRENT_DATE)::date,
    (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date
  );

  PERFORM public.log_audit('company.created', 'company', v_company_id, 'Alta inicial de empresa');

  RETURN v_company_id;
END;
$$;
