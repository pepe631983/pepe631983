-- Row Level Security: aislamiento por empresa
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Permisos globales: solo lectura
CREATE POLICY permissions_read ON public.permissions
  FOR SELECT TO authenticated
  USING (true);

-- Empresa propia
CREATE POLICY companies_select_own ON public.companies
  FOR SELECT TO authenticated
  USING (id = public.current_company_id());

CREATE POLICY companies_update_settings ON public.companies
  FOR UPDATE TO authenticated
  USING (id = public.current_company_id() AND public.has_permission('company.settings.edit'))
  WITH CHECK (id = public.current_company_id());

-- Perfiles
CREATE POLICY profiles_select_company ON public.profiles
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Macro para tablas con company_id
CREATE OR REPLACE FUNCTION public.company_isolation_policy(p_table regclass, p_write_permission TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_table TEXT := p_table::text;
BEGIN
  EXECUTE format(
    'CREATE POLICY %I_select ON %s FOR SELECT TO authenticated USING (company_id = public.current_company_id())',
    split_part(v_table, '.', 2) || '_company',
    v_table
  );
  IF p_write_permission IS NOT NULL THEN
    EXECUTE format(
      'CREATE POLICY %I_insert ON %s FOR INSERT TO authenticated WITH CHECK (company_id = public.current_company_id() AND public.has_permission(%L))',
      split_part(v_table, '.', 2) || '_insert',
      v_table,
      p_write_permission
    );
    EXECUTE format(
      'CREATE POLICY %I_update ON %s FOR UPDATE TO authenticated USING (company_id = public.current_company_id() AND public.has_permission(%L)) WITH CHECK (company_id = public.current_company_id())',
      split_part(v_table, '.', 2) || '_update',
      v_table,
      p_write_permission
    );
  END IF;
END;
$$;

SELECT public.company_isolation_policy('public.branches'::regclass, 'company.settings.edit');
SELECT public.company_isolation_policy('public.warehouses'::regclass, 'company.settings.edit');
SELECT public.company_isolation_policy('public.company_contacts'::regclass, 'company.settings.edit');
SELECT public.company_isolation_policy('public.tax_rates'::regclass, 'company.settings.edit');
SELECT public.company_isolation_policy('public.document_series'::regclass, 'company.settings.edit');
SELECT public.company_isolation_policy('public.payment_methods'::regclass, 'company.settings.edit');
SELECT public.company_isolation_policy('public.bank_accounts'::regclass, 'company.settings.edit');
SELECT public.company_isolation_policy('public.business_policies'::regclass, 'company.settings.edit');
SELECT public.company_isolation_policy('public.chart_of_accounts'::regclass, 'company.settings.edit');
SELECT public.company_isolation_policy('public.accounting_periods'::regclass, 'accounting.period.close');
SELECT public.company_isolation_policy('public.audit_log'::regclass, NULL);

-- Roles y asignaciones
CREATE POLICY roles_company_select ON public.roles
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY roles_manage ON public.roles
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.has_permission('users.manage'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_permission('users.manage'));

CREATE POLICY role_permissions_select ON public.role_permissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_id AND r.company_id = public.current_company_id()
    )
  );

CREATE POLICY role_permissions_manage ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.has_permission('users.manage'))
  WITH CHECK (public.has_permission('users.manage'));

CREATE POLICY user_roles_select ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = user_roles.user_id AND p.company_id = public.current_company_id()
    )
  );

CREATE POLICY user_roles_manage ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_permission('users.manage'))
  WITH CHECK (public.has_permission('users.manage'));

-- Contabilidad: lectura con permiso; escritura etapa 2 vía funciones privilegiadas
CREATE POLICY journal_entries_select ON public.journal_entries
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.has_permission('accounting.journal.view'));

CREATE POLICY journal_lines_select ON public.journal_lines
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.has_permission('accounting.journal.view'));

CREATE POLICY idempotency_select ON public.idempotency_keys
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP FUNCTION public.company_isolation_policy(regclass, text);
