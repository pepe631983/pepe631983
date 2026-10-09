-- Prueba MANUAL: dos sesiones compitiendo por la última unidad.
-- Requiere integration_tests_enabled=true y datos preparados (ver script shell).
-- NO usar en producción.

\set ON_ERROR_STOP on

-- Sesión A y B deben conectarse con el mismo usuario de prueba JWT simulado.
-- Use: scripts/db-test-concurrent-last-unit.sh
