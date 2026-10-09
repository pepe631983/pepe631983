-- Integridad sucursal / almacén
CREATE OR REPLACE FUNCTION public.enforce_warehouse_same_company_as_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_branch_company UUID;
BEGIN
  SELECT company_id INTO v_branch_company FROM public.branches WHERE id = NEW.branch_id;
  IF v_branch_company IS NULL OR v_branch_company <> NEW.company_id THEN
    RAISE EXCEPTION 'El almacén debe pertenecer a la misma empresa que la sucursal';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_warehouse_branch_company
  BEFORE INSERT OR UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_warehouse_same_company_as_branch();
