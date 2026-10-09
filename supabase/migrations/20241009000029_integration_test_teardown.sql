-- teardown_run: no borrar companies (FK RESTRICT); en suites con ROLLBACK los datos se revierten solos.
CREATE OR REPLACE FUNCTION integration_test.teardown_run(p_run_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, integration_test
AS $$
BEGIN
  DELETE FROM integration_test.run_companies WHERE run_id = p_run_id;
  DELETE FROM integration_test.run_users WHERE run_id = p_run_id;
END;
$$;
