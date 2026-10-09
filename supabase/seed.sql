-- Solo aplica tras `supabase db reset` en entorno LOCAL.
-- Habilita la suite de integración (nunca active en producción).
UPDATE public.database_capabilities
SET value = 'true'
WHERE key = 'integration_tests_enabled';
