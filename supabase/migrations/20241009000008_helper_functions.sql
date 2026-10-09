-- Funciones de contexto, permisos y alta inicial de empresa
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = auth.uid() AND is_active = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_permission(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND p.is_active = true
      AND rp.permission_code = p_permission
      AND r.company_id = p.company_id
  );
$$;

CREATE OR REPLACE FUNCTION public.require_permission(p_permission TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF NOT public.has_permission(p_permission) THEN
    RAISE EXCEPTION 'Permiso denegado: %', p_permission;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_audit(
  p_action TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_severity public.audit_severity DEFAULT 'info'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_id UUID;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Sin empresa activa para auditoría';
  END IF;
  INSERT INTO public.audit_log (company_id, user_id, action, entity_type, entity_id, reason, metadata, severity)
  VALUES (v_company, auth.uid(), p_action, p_entity_type, p_entity_id, p_reason, COALESCE(p_metadata, '{}'::jsonb), p_severity)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Plantilla de plan de cuentas mínimo (sin impuestos específicos; cuentas de impuesto configurables)
CREATE OR REPLACE FUNCTION public.seed_chart_of_accounts(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.chart_of_accounts (company_id, code, name, account_type, is_postable, is_system) VALUES
    (p_company_id, '1000', 'Caja', 'asset', true, true),
    (p_company_id, '1010', 'Bancos', 'asset', true, true),
    (p_company_id, '1020', 'Cobros con tarjeta pendientes de liquidación', 'asset', true, true),
    (p_company_id, '1100', 'Cuentas por cobrar', 'asset', true, true),
    (p_company_id, '1200', 'Inventario', 'asset', true, true),
    (p_company_id, '1210', 'Mercancía recibida pendiente de facturar', 'asset', true, true),
    (p_company_id, '1300', 'Anticipos a proveedores', 'asset', true, true),
    (p_company_id, '2000', 'Cuentas por pagar', 'liability', true, true),
    (p_company_id, '2100', 'Anticipos de clientes', 'liability', true, true),
    (p_company_id, '2200', 'Impuestos por pagar o recuperar (configurar)', 'liability', true, true),
    (p_company_id, '3000', 'Capital', 'equity', true, true),
    (p_company_id, '4000', 'Ingresos por ventas', 'income', true, true),
    (p_company_id, '4010', 'Devoluciones y descuentos sobre ventas', 'contra_income', true, true),
    (p_company_id, '5000', 'Costo de ventas', 'expense', true, true),
    (p_company_id, '6000', 'Gastos operativos', 'expense', true, true),
    (p_company_id, '6100', 'Comisiones bancarias', 'expense', true, true),
    (p_company_id, '6200', 'Diferencias de inventario', 'expense', true, true),
    (p_company_id, '6300', 'Diferencias de caja', 'expense', true, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_default_roles(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
  v_manager UUID;
  v_seller UUID;
  v_cashier UUID;
  v_inventory UUID;
  v_accountant UUID;
BEGIN
  INSERT INTO public.roles (company_id, code, name, is_system) VALUES
    (p_company_id, 'owner', 'Propietario / Administrador', true) RETURNING id INTO v_owner;
  INSERT INTO public.roles (company_id, code, name, is_system) VALUES
    (p_company_id, 'manager', 'Gerente', true) RETURNING id INTO v_manager;
  INSERT INTO public.roles (company_id, code, name, is_system) VALUES
    (p_company_id, 'seller', 'Vendedor', true) RETURNING id INTO v_seller;
  INSERT INTO public.roles (company_id, code, name, is_system) VALUES
    (p_company_id, 'cashier', 'Cajero', true) RETURNING id INTO v_cashier;
  INSERT INTO public.roles (company_id, code, name, is_system) VALUES
    (p_company_id, 'inventory_clerk', 'Encargado de inventario', true) RETURNING id INTO v_inventory;
  INSERT INTO public.roles (company_id, code, name, is_system) VALUES
    (p_company_id, 'accountant', 'Contador', true) RETURNING id INTO v_accountant;

  INSERT INTO public.role_permissions (role_id, permission_code)
  SELECT v_owner, code FROM public.permissions;

  INSERT INTO public.role_permissions (role_id, permission_code)
  SELECT v_manager, code FROM public.permissions
  WHERE code NOT IN ('accounting.period.close');

  INSERT INTO public.role_permissions (role_id, permission_code) VALUES
    (v_seller, 'sales.pos'),
    (v_seller, 'sales.confirm'),
    (v_seller, 'discount.apply'),
    (v_seller, 'reports.operational'),
    (v_seller, 'company.settings.view');

  INSERT INTO public.role_permissions (role_id, permission_code) VALUES
    (v_cashier, 'sales.pos'),
    (v_cashier, 'payment.collect'),
    (v_cashier, 'cash.session.open'),
    (v_cashier, 'cash.session.close'),
    (v_cashier, 'company.settings.view');

  INSERT INTO public.role_permissions (role_id, permission_code) VALUES
    (v_inventory, 'inventory.adjust'),
    (v_inventory, 'inventory.transfer'),
    (v_inventory, 'purchase.create'),
    (v_inventory, 'purchase.post'),
    (v_inventory, 'cost.view'),
    (v_inventory, 'reports.operational'),
    (v_inventory, 'company.settings.view');

  INSERT INTO public.role_permissions (role_id, permission_code) VALUES
    (v_accountant, 'cost.view'),
    (v_accountant, 'reports.financial'),
    (v_accountant, 'reports.operational'),
    (v_accountant, 'accounting.journal.view'),
    (v_accountant, 'accounting.period.close'),
    (v_accountant, 'document.reverse'),
    (v_accountant, 'company.settings.view');
END;
$$;

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
END;
$$;

-- Crear empresa, sucursal, almacén, perfil del propietario y semillas
CREATE OR REPLACE FUNCTION public.create_company_with_owner(
  p_commercial_name TEXT,
  p_full_name TEXT,
  p_country_code CHAR(2) DEFAULT 'MX',
  p_timezone TEXT DEFAULT 'America/Mexico_City',
  p_currency_code CHAR(3) DEFAULT 'MXN',
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
    commercial_name, country_code, timezone, primary_currency_code, is_demo
  ) VALUES (
    p_commercial_name, p_country_code, p_timezone, p_currency_code, p_is_demo
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

GRANT EXECUTE ON FUNCTION public.create_company_with_owner TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit TO authenticated;
