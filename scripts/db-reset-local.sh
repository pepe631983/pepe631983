#!/usr/bin/env bash
# SOLO Supabase local (127.0.0.1:54322). Borra todos los datos locales.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/db-guard.sh
source "$ROOT/scripts/db-guard.sh"

URL="$(resolve_db_url)"
print_environment_info "$URL"
require_not_production_reset "$URL"

echo "ATENCIÓN: supabase db reset destruye la base LOCAL completa."
npx supabase db reset

psql "$URL" -c "UPDATE public.database_capabilities SET value = 'true' WHERE key = 'integration_tests_enabled';"

echo "Reset local completado. Flag integration_tests_enabled=true para pruebas."
