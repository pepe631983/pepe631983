#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/db-guard.sh
source "$ROOT/scripts/db-guard.sh"
URL="${STAGING_DATABASE_URL:-$(resolve_db_url)}"
if [[ -z "${STAGING_DATABASE_URL:-}" ]] && ! is_local_supabase "$URL"; then
  echo "Configure STAGING_DATABASE_URL."
  exit 2
fi
if is_local_supabase "$URL"; then
  psql "$URL" -v ON_ERROR_STOP=1 -c "SELECT public.disable_integration_tests();"
  psql "$URL" -v ON_ERROR_STOP=1 -c "SELECT integration_test.assert_tests_disabled();"
else
  psql_staging "$URL" -v ON_ERROR_STOP=1 -c "SELECT public.disable_integration_tests();"
  psql_staging "$URL" -v ON_ERROR_STOP=1 -c "SELECT integration_test.assert_tests_disabled();"
fi
echo "integration_tests_enabled=false verificado."
