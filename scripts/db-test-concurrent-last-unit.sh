#!/usr/bin/env bash
# Dos conexiones psql en paralelo: una venta gana, la otra falla; sin factura duplicada.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/db-guard.sh
source "$ROOT/scripts/db-guard.sh"

URL="$(resolve_db_url)"
if [[ -n "${STAGING_DATABASE_URL:-}" ]]; then
  URL="$STAGING_DATABASE_URL"
elif ! is_local_supabase "$URL"; then
  echo "Configure STAGING_DATABASE_URL o Supabase local."
  exit 2
fi

PSQL_REMOTE=0
if ! is_local_supabase "$URL"; then
  apply_staging_psql_env "$URL"
  PSQL_REMOTE=1
fi

run_psql() {
  if [[ "$PSQL_REMOTE" == 1 ]]; then
    psql "$@"
  else
    psql "$URL" "$@"
  fi
}

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

FIX_LINE=$(run_psql -v ON_ERROR_STOP=1 -t -A -c "
UPDATE public.database_capabilities SET value = 'true' WHERE key = 'integration_tests_enabled';
SELECT integration_test.prepare_concurrent_last_unit(integration_test.new_run_id());
" | tail -1)

RUN_ID=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['run_id'])" "$FIX_LINE")
USER_ID=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['user_id'])" "$FIX_LINE")
WH=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['warehouse_id'])" "$FIX_LINE")
PROD=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['product_id'])" "$FIX_LINE")
COMP=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['company_id'])" "$FIX_LINE")

sale_sql() {
  local key="$1"
  run_psql -v ON_ERROR_STOP=0 -c "
SELECT set_config('request.jwt.claim.sub', '$USER_ID', true);
SELECT public.confirm_pos_sale(
  '$key', '$WH'::uuid, 'cash', 50,
  jsonb_build_array(jsonb_build_object('product_id', '$PROD'::uuid, 'quantity', 1, 'unit_price', 50, 'discount', 0))
);" 2>&1
}

BEFORE=$(run_psql -t -A -c "SELECT COUNT(*) FROM public.sales_invoices WHERE company_id = '$COMP'::uuid")

sale_sql "conc-a-$$" > "$WORKDIR/a.out" 2>&1 &
sale_sql "conc-b-$$" > "$WORKDIR/b.out" 2>&1 &
wait

AFTER=$(run_psql -t -A -c "SELECT COUNT(*) FROM public.sales_invoices WHERE company_id = '$COMP'::uuid")
DELTA=$((AFTER - BEFORE))

OK=0
FAIL=0
for out in "$WORKDIR/a.out" "$WORKDIR/b.out"; do
  if grep -qE 'Existencia insuficiente|insufficient' "$out" 2>/dev/null; then
    FAIL=$((FAIL + 1))
  elif grep -qE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$out" 2>/dev/null; then
    OK=$((OK + 1))
  fi
done

echo "=== concurrent_last_unit ==="
echo "Facturas nuevas: $DELTA (esperado 1)"
echo "Ventas exitosas detectadas: $OK (esperado 1)"
echo "Alguna falló por stock: $FAIL"

run_psql -c "SELECT integration_test.teardown_run('$RUN_ID'::uuid);" >/dev/null

if [[ "$DELTA" -ne 1 ]] || [[ "$OK" -ne 1 ]] || [[ "$FAIL" -ne 1 ]]; then
  echo "RESULTADO: FAILED"
  exit 1
fi
echo "RESULTADO: PASSED"
