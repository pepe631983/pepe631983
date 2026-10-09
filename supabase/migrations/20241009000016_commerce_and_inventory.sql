-- Catálogo mínimo, inventario trazable y ventas (POS)
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  internal_code TEXT NOT NULL,
  name TEXT NOT NULL,
  sale_price money_amount NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  track_serial BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, internal_code)
);

CREATE INDEX idx_products_company ON public.products (company_id);

CREATE TABLE public.inventory_balances (
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses (id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  quantity quantity_amount NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  avg_unit_cost money_amount NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (warehouse_id, product_id)
);

CREATE INDEX idx_inventory_balances_company ON public.inventory_balances (company_id);

CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses (id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  movement_kind TEXT NOT NULL CHECK (movement_kind IN ('receipt', 'sale', 'adjustment', 'transfer')),
  quantity_delta quantity_amount NOT NULL,
  unit_cost money_amount NOT NULL,
  extended_cost money_amount NOT NULL,
  source_document_type TEXT,
  source_document_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_movements_product ON public.inventory_movements (product_id, created_at DESC);

CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.sales_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.branches (id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses (id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES public.customers (id),
  invoice_number TEXT,
  status public.document_status NOT NULL DEFAULT 'draft',
  payment_kind TEXT NOT NULL CHECK (payment_kind IN ('cash', 'credit')),
  subtotal money_amount NOT NULL DEFAULT 0,
  discount_total money_amount NOT NULL DEFAULT 0,
  tax_total money_amount NOT NULL DEFAULT 0,
  total money_amount NOT NULL DEFAULT 0,
  amount_paid money_amount NOT NULL DEFAULT 0,
  cost_total money_amount NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL,
  confirmed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);

CREATE INDEX idx_sales_invoices_company ON public.sales_invoices (company_id, created_at DESC);

CREATE TABLE public.sales_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_invoice_id UUID NOT NULL REFERENCES public.sales_invoices (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  line_number SMALLINT NOT NULL,
  description TEXT NOT NULL,
  quantity quantity_amount NOT NULL CHECK (quantity > 0),
  unit_price money_amount NOT NULL,
  discount money_amount NOT NULL DEFAULT 0,
  line_subtotal money_amount NOT NULL,
  unit_cost money_amount NOT NULL,
  line_cost money_amount NOT NULL,
  UNIQUE (sales_invoice_id, line_number)
);

ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_company ON public.products
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());
CREATE POLICY products_manage ON public.products
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.has_permission('price.edit'))
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY inventory_balances_select ON public.inventory_balances
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());

CREATE POLICY inventory_movements_select ON public.inventory_movements
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());

CREATE POLICY customers_select ON public.customers
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());

CREATE POLICY sales_invoices_select ON public.sales_invoices
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());

CREATE POLICY sales_invoice_lines_select ON public.sales_invoice_lines
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());
