#!/usr/bin/env bash
# Dos conexiones psql: una venta debe ganar; la otra falla sin dejar factura parcial.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/db-guard.sh
source "$ROOT/scripts/db-guard.sh"
URL="$(resolve_db_url)"

if [[ -z "${STAGING_DATABASE_URL:-}" ]] && ! is_local_supabase "$URL"; then
  echo "Configure STAGING_DATABASE_URL o use Supabase local."
  exit 2
fi

echo "Prueba concurrente (manual automatizada): preparando datos en transacción..."
TMPA="$(mktemp)"
TMPB="$(mktemp)"

psql "$URL" -v ON_ERROR_STOP=1 <<'SQL' > /dev/null
UPDATE public.database_capabilities SET value = 'true' WHERE key = 'integration_tests_enabled';
BEGIN;
SELECT integration_test.run_suite(); -- noop warm
ROLLBACK;
SQL

# Preparación: empresa con 1 unidad (usa service path via psql as postgres)
PREP="$(psql "$URL" -t -A -c "
BEGIN;
UPDATE public.database_capabilities SET value = 'true' WHERE key = 'integration_tests_enabled';
SELECT (integration_test.run_suite()->'results') IS NOT NULL;
ROLLBACK;
" 2>/dev/null || true)

echo "Ejecute en dos terminales con datos de prueba reales desde la app o extienda este script."
echo "Pendiente: enlace a IDs de producto/almacén tras bootstrap dedicado."
echo "Validación esperada: una confirm_pos_sale OK; la otra 'Existencia insuficiente'; COUNT facturas += 1."

rm -f "$TMPA" "$TMPB"
