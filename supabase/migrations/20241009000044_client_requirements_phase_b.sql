-- Etapa B: invitaciones, pagos combinados, ficha cliente, export CSV, cotización reforzada

INSERT INTO public.permissions (code, module, description) VALUES
  ('users.invite', 'security', 'Invitar empleados a la empresa'),
  ('customers.view', 'sales', 'Ver ficha completa de clientes'),
  ('customers.edit', 'sales', 'Editar clientes, contactos y vehículos')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS convert_idempotency_key TEXT,
  ADD UNIQUE (company_id, convert_idempotency_key);

CREATE TABLE IF NOT EXISTS public.company_member_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  email CITEXT NOT NULL,
  role_id UUID NOT NULL REFERENCES public.roles (id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES auth.users (id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_user_id UUID REFERENCES auth.users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_company ON public.company_member_invitations (company_id, email);

CREATE TABLE IF NOT EXISTS public.customer_payment_tenders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  customer_payment_id UUID NOT NULL REFERENCES public.customer_payments (id) ON DELETE CASCADE,
  payment_method_id UUID REFERENCES public.payment_methods (id),
  instrument_kind TEXT NOT NULL CHECK (instrument_kind IN ('cash', 'card', 'transfer', 'check', 'other')),
  amount money_amount NOT NULL CHECK (amount > 0),
  reference TEXT,
  settlement_status TEXT NOT NULL DEFAULT 'cleared' CHECK (settlement_status IN ('pending', 'cleared', 'rejected')),
  check_bank TEXT,
  check_number TEXT,
  check_date DATE,
  check_status TEXT CHECK (check_status IN ('received', 'deposited', 'cleared', 'rejected')),
  transfer_bank_account_id UUID REFERENCES public.bank_accounts (id),
  transfer_reference TEXT,
  card_terminal_reference TEXT,
  card_fee money_amount,
  journal_entry_id UUID REFERENCES public.journal_entries (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_tenders_payment ON public.customer_payment_tenders (customer_payment_id);

-- Cuenta transitoria cheques (por empresa si falta)
CREATE OR REPLACE FUNCTION public.ensure_check_transit_account(p_company UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.chart_of_accounts WHERE company_id = p_company AND code = '1015';
  IF v_id IS NULL THEN
    INSERT INTO public.chart_of_accounts (company_id, code, name, account_type, is_posting, is_active)
    VALUES (p_company, '1015', 'Cheques en tránsito', 'asset', true, true)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
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
  IF v_q.status = 'converted' OR v_q.converted_invoice_id IS NOT NULL THEN
    IF v_q.convert_idempotency_key IS NOT NULL AND v_q.convert_idempotency_key = p_idempotency_key THEN
      RETURN v_q.converted_invoice_id;
    END IF;
    RAISE EXCEPTION 'Cotización ya convertida';
  END IF;
  IF v_q.status <> 'accepted' THEN
    RAISE EXCEPTION 'La cotización debe estar aceptada (estado %)', v_q.status;
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
      'product_id', v_line.product_id, 'quantity', v_line.quantity,
      'unit_price', v_line.unit_price, 'discount', v_line.discount
    );
  END LOOP;

  v_inv := public.confirm_pos_sale(
    p_idempotency_key, v_q.warehouse_id, p_payment_kind, p_amount_paid, v_lines,
    p_cash_session_id, v_q.tax_rate_id, NULL
  );

  UPDATE public.sales_quotes
  SET status = 'converted', converted_invoice_id = v_inv, confirmed_by = auth.uid(),
      convert_idempotency_key = p_idempotency_key
  WHERE id = p_quote_id;

  PERFORM public.log_audit('sales.quote.converted', 'sales_quote', p_quote_id, v_inv::text);
  RETURN v_inv;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_company_member(
  p_email TEXT,
  p_role_code TEXT,
  p_expires_days INTEGER DEFAULT 7
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company UUID := public.current_company_id();
  v_role UUID;
  v_token TEXT := encode(gen_random_bytes(24), 'hex');
  v_hash TEXT := encode(digest(v_token, 'sha256'), 'hex');
BEGIN
  PERFORM public.require_permission('users.invite');
  SELECT id INTO v_role FROM public.roles WHERE company_id = v_company AND code = p_role_code;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Rol no encontrado'; END IF;
  UPDATE public.company_member_invitations SET accepted_at = now()
  WHERE company_id = v_company AND email = lower(p_email) AND accepted_at IS NULL;
  INSERT INTO public.company_member_invitations (company_id, email, role_id, token_hash, invited_by, expires_at)
  VALUES (v_company, lower(p_email), v_role, v_hash, auth.uid(), now() + make_interval(days => p_expires_days));
  PERFORM public.log_audit('users.invite', 'invitation', NULL, lower(p_email));
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_company_invitation(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT := encode(digest(p_token, 'sha256'), 'hex');
  v_inv RECORD;
  v_user UUID := auth.uid();
  v_email TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debe iniciar sesión'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_user;
  SELECT * INTO v_inv FROM public.company_member_invitations
  WHERE token_hash = v_hash AND accepted_at IS NULL AND expires_at > now();
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitación inválida o expirada'; END IF;
  IF lower(v_email) <> lower(v_inv.email::text) THEN
    RAISE EXCEPTION 'El correo de la cuenta no coincide con la invitación';
  END IF;
  INSERT INTO public.profiles (user_id, company_id, full_name, is_active)
  VALUES (v_user, v_inv.company_id, split_part(v_email, '@', 1), true)
  ON CONFLICT (user_id) DO UPDATE SET company_id = EXCLUDED.company_id, is_active = true;
  INSERT INTO public.user_roles (user_id, role_id, assigned_by)
  VALUES (v_user, v_inv.role_id, v_inv.invited_by)
  ON CONFLICT DO NOTHING;
  UPDATE public.company_member_invitations
  SET accepted_at = now(), accepted_user_id = v_user WHERE id = v_inv.id;
  RETURN jsonb_build_object('company_id', v_inv.company_id, 'role_id', v_inv.role_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.collect_customer_payment_combined(
  p_sales_invoice_id UUID,
  p_idempotency_key TEXT,
  p_tenders JSONB,
  p_cash_session_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := public.current_company_id();
  v_invoice RECORD;
  v_payment_id UUID;
  v_total money_amount := 0;
  v_tender JSONB;
  v_kind TEXT;
  v_amt money_amount;
  v_journal_id UUID;
  v_acct_cash UUID;
  v_acct_ar UUID;
  v_acct_check UUID;
  v_acct_card_pending UUID;
  v_line_no SMALLINT := 0;
  v_open money_amount;
BEGIN
  PERFORM public.require_permission('payment.collect');
  PERFORM public.require_open_accounting_period(CURRENT_DATE);
  SELECT * INTO v_invoice FROM public.sales_invoices
  WHERE id = p_sales_invoice_id AND company_id = v_company AND status = 'confirmed' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_invoice.payment_kind <> 'credit' THEN RAISE EXCEPTION 'Solo facturas a crédito'; END IF;

  FOR v_tender IN SELECT * FROM jsonb_array_elements(p_tenders)
  LOOP
    v_total := v_total + (v_tender->>'amount')::numeric;
  END LOOP;
  v_open := v_invoice.total - v_invoice.amount_paid;
  IF v_total <= 0 OR v_total > v_open THEN RAISE EXCEPTION 'Total cobro inválido'; END IF;

  INSERT INTO public.customer_payments (
    company_id, customer_id, amount, idempotency_key, created_by, cash_session_id
  ) VALUES (
    v_company, v_invoice.customer_id, v_total, p_idempotency_key, auth.uid(), p_cash_session_id
  ) RETURNING id INTO v_payment_id;

  INSERT INTO public.customer_payment_allocations (payment_id, sales_invoice_id, amount)
  VALUES (v_payment_id, p_sales_invoice_id, v_total);
  UPDATE public.sales_invoices SET amount_paid = amount_paid + v_total WHERE id = p_sales_invoice_id;

  SELECT id INTO v_acct_cash FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1000';
  SELECT id INTO v_acct_ar FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1100';
  SELECT id INTO v_acct_card_pending FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1020';
  v_acct_check := public.ensure_check_transit_account(v_company);

  INSERT INTO public.journal_entries (
    company_id, status, description, source_document_type, source_document_id,
    idempotency_key, created_by, confirmed_at
  ) VALUES (
    v_company, 'confirmed', 'Cobro combinado', 'customer_payment', v_payment_id,
    'je-pay-' || p_idempotency_key, auth.uid(), now()
  ) RETURNING id INTO v_journal_id;

  v_line_no := 0;
  FOR v_tender IN SELECT * FROM jsonb_array_elements(p_tenders)
  LOOP
    v_kind := v_tender->>'instrument_kind';
    v_amt := (v_tender->>'amount')::numeric;
    INSERT INTO public.customer_payment_tenders (
      company_id, customer_payment_id, payment_method_id, instrument_kind, amount,
      reference, settlement_status, check_bank, check_number, check_date, check_status,
      transfer_bank_account_id, transfer_reference, card_terminal_reference, card_fee, journal_entry_id
    ) VALUES (
      v_company, v_payment_id, (v_tender->>'payment_method_id')::uuid, v_kind, v_amt,
      v_tender->>'reference',
      CASE WHEN v_kind IN ('check', 'transfer', 'card') THEN 'pending' ELSE 'cleared' END,
      v_tender->>'check_bank', v_tender->>'check_number', (v_tender->>'check_date')::date,
      COALESCE(v_tender->>'check_status', 'received'),
      (v_tender->>'transfer_bank_account_id')::uuid,
      v_tender->>'transfer_reference',
      v_tender->>'card_terminal_reference',
      (v_tender->>'card_fee')::numeric,
      v_journal_id
    );
    v_line_no := v_line_no + 1;
    IF v_kind = 'cash' THEN
      INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo)
      VALUES (v_journal_id, v_company, v_acct_cash, v_line_no, v_amt, 0, 'Efectivo cobro');
    ELSIF v_kind = 'check' THEN
      INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo)
      VALUES (v_journal_id, v_company, v_acct_check, v_line_no, v_amt, 0, 'Cheque en tránsito');
    ELSIF v_kind = 'card' THEN
      INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo)
      VALUES (v_journal_id, v_company, v_acct_card_pending, v_line_no, v_amt, 0, 'Tarjeta pendiente liquidación');
    ELSIF v_kind = 'transfer' THEN
      INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo)
      VALUES (v_journal_id, v_company, v_acct_card_pending, v_line_no, v_amt, 0, 'Transferencia pendiente verificación');
    ELSE
      INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo)
      VALUES (v_journal_id, v_company, v_acct_cash, v_line_no, v_amt, 0, 'Otro medio');
    END IF;
  END LOOP;

  v_line_no := v_line_no + 1;
  INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo)
  VALUES (v_journal_id, v_company, v_acct_ar, v_line_no, 0, v_total, 'Cancela CxC');

  PERFORM public.assert_journal_balanced(v_journal_id);
  UPDATE public.customer_payments SET journal_entry_id = v_journal_id WHERE id = v_payment_id;

  IF p_cash_session_id IS NOT NULL THEN
    PERFORM public.register_cash_movement(
      p_cash_session_id,
      'deposit',
      (
        SELECT COALESCE(SUM(amount), 0) FROM public.customer_payment_tenders
        WHERE customer_payment_id = v_payment_id AND instrument_kind = 'cash' AND settlement_status = 'cleared'
      ),
      'Cobro efectivo combinado',
      NULL,
      p_idempotency_key
    );
  END IF;

  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_customer_check_tender(p_tender_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t RECORD;
  v_company UUID := public.current_company_id();
  v_je UUID;
  v_acct_check UUID;
  v_acct_ar UUID;
  v_alloc RECORD;
BEGIN
  PERFORM public.require_permission('payment.collect');
  SELECT * INTO v_t FROM public.customer_payment_tenders
  WHERE id = p_tender_id AND company_id = v_company AND instrument_kind = 'check' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cheque no encontrado'; END IF;
  IF v_t.settlement_status = 'rejected' THEN RETURN; END IF;
  v_acct_check := public.ensure_check_transit_account(v_company);
  SELECT id INTO v_acct_ar FROM public.chart_of_accounts WHERE company_id = v_company AND code = '1100';

  INSERT INTO public.journal_entries (
    company_id, status, description, source_document_type, source_document_id,
    idempotency_key, created_by, confirmed_at
  ) VALUES (
    v_company, 'confirmed', 'Cheque rechazado: ' || COALESCE(p_reason, ''),
    'customer_payment_tender', p_tender_id, 'je-chk-rej-' || p_tender_id::text, auth.uid(), now()
  ) RETURNING id INTO v_je;

  INSERT INTO public.journal_lines (journal_entry_id, company_id, account_id, line_number, debit, credit, memo) VALUES
    (v_je, v_company, v_acct_ar, 1, v_t.amount, 0, 'Reabre CxC'),
    (v_je, v_company, v_acct_check, 2, 0, v_t.amount, 'Elimina cheque en tránsito');
  PERFORM public.assert_journal_balanced(v_je);

  UPDATE public.customer_payment_tenders
  SET settlement_status = 'rejected', check_status = 'rejected', journal_entry_id = v_je
  WHERE id = p_tender_id;

  FOR v_alloc IN
    SELECT cpa.sales_invoice_id, cpa.amount
    FROM public.customer_payment_allocations cpa
    WHERE cpa.payment_id = v_t.customer_payment_id
  LOOP
    UPDATE public.sales_invoices
    SET amount_paid = GREATEST(0, amount_paid - LEAST(v_alloc.amount, v_t.amount))
    WHERE id = v_alloc.sales_invoice_id;
    UPDATE public.customer_payment_allocations
    SET amount = GREATEST(0, amount - LEAST(v_alloc.amount, v_t.amount))
    WHERE payment_id = v_t.customer_payment_id AND sales_invoice_id = v_alloc.sales_invoice_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_customer_360(p_customer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := public.current_company_id();
BEGIN
  PERFORM public.require_permission('customers.view');
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'Cliente no encontrado';
  END IF;
  RETURN jsonb_build_object(
    'customer', (SELECT to_jsonb(c) FROM public.customers c WHERE c.id = p_customer_id),
    'contacts', (SELECT COALESCE(jsonb_agg(to_jsonb(cc)), '[]'::jsonb) FROM public.customer_contacts cc WHERE cc.customer_id = p_customer_id),
    'vehicles', (SELECT COALESCE(jsonb_agg(to_jsonb(cv)), '[]'::jsonb) FROM public.customer_vehicles cv WHERE cv.customer_id = p_customer_id),
    'quotes', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', q.id, 'quote_number', q.quote_number, 'status', q.status, 'total', q.total)), '[]'::jsonb)
      FROM public.sales_quotes q WHERE q.customer_id = p_customer_id
    ),
    'invoices', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', i.id, 'invoice_number', i.invoice_number, 'payment_kind', i.payment_kind,
        'total', i.total, 'amount_paid', i.amount_paid
      ) ORDER BY i.created_at DESC), '[]'::jsonb)
      FROM public.sales_invoices i WHERE i.customer_id = p_customer_id AND i.status = 'confirmed'
    ),
    'payments', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'amount', p.amount, 'confirmed_at', p.confirmed_at)), '[]'::jsonb)
      FROM public.customer_payments p WHERE p.customer_id = p_customer_id
    ),
    'ar_open', (
      SELECT COALESCE(SUM(i.total - i.amount_paid), 0) FROM public.sales_invoices i
      WHERE i.customer_id = p_customer_id AND i.payment_kind = 'credit' AND i.status = 'confirmed'
    ),
    'store_credit', (SELECT store_credit_balance FROM public.customers WHERE id = p_customer_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.export_company_bundle()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := public.current_company_id();
  v_counts JSONB;
BEGIN
  PERFORM public.require_permission('data.export');
  v_counts := jsonb_build_object(
    'products', (SELECT count(*) FROM public.products WHERE company_id = v_company),
    'customers', (SELECT count(*) FROM public.customers WHERE company_id = v_company),
    'sales_invoices', (SELECT count(*) FROM public.sales_invoices WHERE company_id = v_company),
    'journal_entries', (SELECT count(*) FROM public.journal_entries WHERE company_id = v_company)
  );
  RETURN jsonb_build_object(
    'schema_version', 'export-v2',
    'exported_at', now(),
    'company_id', v_company,
    'control_totals', v_counts,
    'json_snapshot', public.export_company_snapshot(),
    'csv', jsonb_build_object(
      'products', (
        SELECT string_agg(
          format('%s,%s,%s,%s', id, internal_code, replace(name, ',', ' '), sale_price), E'\n'
        ) FROM (SELECT id, internal_code, name, sale_price FROM public.products WHERE company_id = v_company LIMIT 5000) s
      ),
      'customers', (
        SELECT string_agg(format('%s,%s,%s,%s', id, replace(name, ',', ' '), COALESCE(email::text, ''), COALESCE(phone, '')), E'\n')
        FROM public.customers WHERE company_id = v_company LIMIT 5000
      )
    ),
    'attachments_note', 'Adjuntos comerciales vía bucket Storage — exporte manual con permiso admin cuando esté configurado el bucket.'
  );
END;
$$;

ALTER TABLE public.company_member_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payment_tenders ENABLE ROW LEVEL SECURITY;

CREATE POLICY invitations_admin ON public.company_member_invitations FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.has_permission('users.invite'))
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY tenders_co ON public.customer_payment_tenders FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM public.roles r
CROSS JOIN (VALUES ('users.invite'), ('customers.view'), ('customers.edit')) AS p(code)
WHERE r.code IN ('owner', 'manager')
ON CONFLICT DO NOTHING;

GRANT EXECUTE ON FUNCTION public.invite_company_member TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_company_invitation TO authenticated;
GRANT EXECUTE ON FUNCTION public.collect_customer_payment_combined TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_customer_check_tender TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_360 TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_company_bundle TO authenticated;
