-- Usuarios de integración: GoTrue hosted requiere fila en auth.identities (no solo auth.users).

CREATE OR REPLACE FUNCTION integration_test.create_auth_user(p_run_id UUID, p_suffix TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user UUID := gen_random_uuid();
  v_email TEXT := 'it+' || p_suffix || '+' || v_user::text || '@invalid.local';
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email,
    crypt('integration-test', gen_salt('bf', 10)),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"email_verified":true}'::jsonb
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user,
    v_user,
    'email',
    jsonb_build_object(
      'sub', v_user::text,
      'email', v_email,
      'email_verified', true,
      'phone_verified', false
    ),
    now(),
    now(),
    now()
  );

  INSERT INTO integration_test.run_users (run_id, user_id) VALUES (p_run_id, v_user);
  RETURN v_user;
END;
$$;
