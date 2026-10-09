-- Perfiles y control de acceso basado en roles (permisos por acción)
CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_company ON public.profiles (company_id);

CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Catálogo global de permisos (no por empresa)
CREATE TABLE public.permissions (
  code TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE INDEX idx_roles_company ON public.roles (company_id);

CREATE TABLE public.role_permissions (
  role_id UUID NOT NULL REFERENCES public.roles (id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES public.permissions (code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE public.user_roles (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles (id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES auth.users (id),
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_role ON public.user_roles (role_id);

-- Un usuario pertenece a una empresa vía profile; roles deben ser de la misma empresa
CREATE OR REPLACE FUNCTION public.enforce_user_role_same_company()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_profile_company UUID;
  v_role_company UUID;
BEGIN
  SELECT company_id INTO v_profile_company FROM public.profiles WHERE user_id = NEW.user_id;
  SELECT company_id INTO v_role_company FROM public.roles WHERE id = NEW.role_id;
  IF v_profile_company IS NULL OR v_role_company IS NULL OR v_profile_company <> v_role_company THEN
    RAISE EXCEPTION 'El rol no pertenece a la empresa del usuario';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_roles_company
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_role_same_company();
