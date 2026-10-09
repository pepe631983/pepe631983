-- PL/pgSQL inicializa variables de dominio a NULL; el CHECK NOT NULL del dominio rompe funciones al entrar.
ALTER DOMAIN public.money_amount DROP CONSTRAINT IF EXISTS money_amount_check;

CREATE OR REPLACE FUNCTION integration_test.bootstrap_company(
  p_run_id UUID,
  p_user UUID,
  p_name TEXT,
  p_role_code TEXT DEFAULT 'owner'
)
RETURNS TABLE(company_id UUID, branch_id UUID, warehouse_id UUID, role_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_branch UUID;
  v_wh UUID;
  v_role UUID;
BEGIN
  INSERT INTO public.companies (commercial_name, country_code, timezone, primary_currency_code, is_demo)
  VALUES (p_name, 'TC', 'America/Grand_Turk', 'USD', true)
  RETURNING id INTO v_company;

  INSERT INTO integration_test.run_companies (run_id, company_id) VALUES (p_run_id, v_company);

  INSERT INTO public.branches (company_id, code, name, is_default)
  VALUES (v_company, 'MAIN', 'Test', true) RETURNING id INTO v_branch;

  INSERT INTO public.warehouses (company_id, branch_id, code, name, is_default)
  VALUES (v_company, v_branch, 'WH1', 'Test WH', true) RETURNING id INTO v_wh;

  INSERT INTO public.profiles (user_id, company_id, full_name, is_active)
  VALUES (p_user, v_company, 'Integration', true);

  PERFORM public.seed_chart_of_accounts(v_company);
  PERFORM public.seed_default_roles(v_company);
  PERFORM public.seed_operational_defaults(v_company, v_branch, v_wh);
  PERFORM public.seed_print_profiles(v_company);

  SELECT r.id INTO v_role
  FROM public.roles r
  WHERE r.company_id = v_company AND r.code = p_role_code;

  INSERT INTO public.user_roles (user_id, role_id) VALUES (p_user, v_role);

  company_id := v_company;
  branch_id := v_branch;
  warehouse_id := v_wh;
  role_id := v_role;
  RETURN NEXT;
END;
$$;
