#!/usr/bin/env bash
# Ejecuta la suite de integración en STAGING (o cualquier BD remota) SIN reset.
# Requiere migraciones 00001–00021 aplicadas y flag integration_tests_enabled=true.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/load-staging-env.sh
source "$ROOT/scripts/load-staging-env.sh"
# shellcheck source=scripts/db-guard.sh
source "$ROOT/scripts/db-guard.sh"

URL="$(resolve_db_url)"

print_environment_info "$URL"

if [[ -z "${STAGING_DATABASE_URL:-}" ]]; then
  if is_local_supabase "$URL"; then
    echo "Use npm run db:test:local para Supabase local (este script es solo para STAGING remoto)."
    exit 2
  fi
  echo ""
  echo "Configure (secretos del entorno, NO en el chat):"
  echo "  STAGING_DATABASE_URL=postgresql://postgres.[ref]:[PASSWORD]@....pooler.supabase.com:6543/postgres"
  echo "Dashboard → proyecto STAGING → Settings → Database → Connection string (URI)."
  echo "Luego: UPDATE database_capabilities SET value='true' WHERE key='integration_tests_enabled';"
  exit 2
fi

echo "Ejecutando suite dentro de transacción con ROLLBACK (no deja datos de prueba)..."
psql "$URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT integration_test.run_suite() AS suite_result \gx
ROLLBACK;
SQL

echo "Suite finalizada (ROLLBACK aplicado)."
