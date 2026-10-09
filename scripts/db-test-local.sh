#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/db-guard.sh
source "$ROOT/scripts/db-guard.sh"

export STAGING_DATABASE_URL=""
URL="$(resolve_db_url)"
print_environment_info "$URL"
require_not_production_reset "$URL"

if ! command -v psql >/dev/null 2>&1; then
  echo "Instale el cliente psql (postgresql-client)."
  exit 1
fi

if ! psql "$URL" -c "SELECT 1" >/dev/null 2>&1; then
  echo "No hay conexión a $URL. Inicie Supabase local: npx supabase start"
  echo "Luego aplique migraciones: npm run db:reset:local (solo local) o supabase migration up"
  exit 1
fi

psql "$URL" -v ON_ERROR_STOP=1 <<'SQL'
UPDATE public.database_capabilities
SET value = 'true'
WHERE key = 'integration_tests_enabled';
BEGIN;
SELECT integration_test.run_suite() AS suite_result \gx
ROLLBACK;
SQL

echo "Pruebas locales completadas (ROLLBACK; datos de negocio intactos salvo flag de prueba)."
