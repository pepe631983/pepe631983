-- Supabase: no se puede set_config('role', …) dentro de funciones SECURITY DEFINER.
CREATE OR REPLACE FUNCTION integration_test.set_session_user(p_user UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
END;
$$;
