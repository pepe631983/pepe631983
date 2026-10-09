-- Auditoría de operaciones sensibles e idempotencia
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  user_id UUID REFERENCES auth.users (id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity public.audit_severity NOT NULL DEFAULT 'info',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_company_created ON public.audit_log (company_id, created_at DESC);
CREATE INDEX idx_audit_log_entity ON public.audit_log (entity_type, entity_id);

CREATE TABLE public.idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  operation TEXT NOT NULL,
  request_hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  response_snapshot JSONB,
  created_by UUID REFERENCES auth.users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (company_id, key)
);

CREATE INDEX idx_idempotency_company ON public.idempotency_keys (company_id);
