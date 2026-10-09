-- Pruebas de integración del motor comercial/contable (SOLO entorno de prueba).
-- Requiere: migraciones 00001–00019 aplicadas (supabase db reset).
-- Ejecutar como rol con privilegios (postgres local o service_role remoto).

\set ON_ERROR_STOP on

SELECT public.run_commercial_integration_tests() AS integration_result \gx
