#!/usr/bin/env bash
# Ejecuta la suite de integración en STAGING (o cualquier BD remota) SIN reset.
# Requiere migraciones 00001–00021 aplicadas y flag integration_tests_enabled=true.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/db-guard.sh
source "$ROOT/scripts/db-guard.sh"

URL="$(resolve_db_url)"

print_environment_info "$URL"

if is_local_supabase "$URL"; then
  echo "Aviso: use npm run db:test:local para Supabase local (misma suite, ROLLBACK)."
fi

if [[ -z "${STAGING_DATABASE_URL:-}" && ! is_local_supabase "$URL" ]]; then
  echo ""
  echo "Para staging remoto configure (en su máquina o secretos del agente, NO en el chat):"
  echo "  STAGING_DATABASE_URL=postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres"
  echo "Obtenga la URI en: Supabase Dashboard → Project (staging) → Settings → Database → Connection string (URI)."
  echo "Opcional: SUPABASE_PROJECT_REF solo para supabase db push (no ejecuta pruebas)."
  exit 2
fi

echo "Ejecutando suite dentro de transacción con ROLLBACK (no deja datos de prueba)..."
psql "$URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT integration_test.run_suite() AS suite_result \gx
ROLLBACK;
SQL

echo "Suite finalizada (ROLLBACK aplicado)."
