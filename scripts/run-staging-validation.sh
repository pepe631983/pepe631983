#!/usr/bin/env bash
# Pipeline completo staging: verificar → migraciones → pruebas → concurrencia → desactivar tests.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/load-staging-env.sh
source "$ROOT/scripts/load-staging-env.sh"
# shellcheck source=scripts/db-guard.sh
source "$ROOT/scripts/db-guard.sh"

URL="$STAGING_DATABASE_URL"
print_environment_info "$URL"

HOST="$(python3 -c "from urllib.parse import urlparse; import os; u=urlparse(os.environ['STAGING_DATABASE_URL']); print(u.hostname or 'unknown')")"
echo "Host Supabase: $HOST"
if [[ "$HOST" != *supabase* ]]; then
  echo "ADVERTENCIA: el host no parece Supabase. Confirme que es el proyecto de PRUEBAS."
fi

echo "=== Migraciones (db push, no reset) ==="
echo "Impacto: crea/altera tablas y funciones; no borra la base completa."
if [[ "${STAGING_ALLOW_PUSH:-}" != "1" ]]; then
  echo "Omitiendo push automático. Para aplicar: STAGING_ALLOW_PUSH=1 npm run db:staging:validate"
else
  npx supabase db push --db-url "$URL"
fi

echo "=== Habilitar pruebas (staging) ==="
psql "$URL" -v ON_ERROR_STOP=1 -c "
UPDATE public.database_capabilities SET value = 'true' WHERE key = 'integration_tests_enabled';
"

RESULT_FILE="$ROOT/docs/PRUEBAS-STAGING-ULTIMA-EJECUCION.md"
{
  echo "# Última ejecución staging"
  echo ""
  echo "Fecha UTC: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "Host: $HOST"
  echo ""
} > "$RESULT_FILE"

echo "=== Suite integración (ROLLBACK) ==="
if psql "$URL" -v ON_ERROR_STOP=1 -c "BEGIN; SELECT integration_test.run_suite() AS r; ROLLBACK;" >> "$RESULT_FILE" 2>&1; then
  echo "- suite: PASSED" >> "$RESULT_FILE"
else
  echo "- suite: FAILED (ver log arriba)" >> "$RESULT_FILE"
  exit 1
fi

echo "=== Concurrencia última unidad ==="
if bash "$ROOT/scripts/db-test-concurrent-last-unit.sh" >> "$RESULT_FILE" 2>&1; then
  echo "- concurrent: PASSED" >> "$RESULT_FILE"
else
  echo "- concurrent: FAILED" >> "$RESULT_FILE"
  exit 1
fi

echo "=== Desactivar pruebas ==="
bash "$ROOT/scripts/db-integration-off.sh"

echo "Validación staging completada. Ver $RESULT_FILE"
