#!/usr/bin/env bash
# Verifica conexión y soporte de transacciones sin mostrar credenciales.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/db-guard.sh
source "$ROOT/scripts/db-guard.sh"

# shellcheck source=scripts/load-staging-env.sh
source "$ROOT/scripts/load-staging-env.sh"

URL="$STAGING_DATABASE_URL"
print_environment_info "$URL"

if is_local_supabase "$URL"; then
  echo "Esta URL parece local; para staging remoto use el pooler/host *.supabase.com"
fi

# Extraer ref aproximado del host para confirmación humana (sin password)
HOST="$(db_host_port "$URL" | cut -d: -f1)"
echo "Host de conexión: $HOST"
if [[ "$HOST" == *supabase* ]]; then
  echo "OK: host Supabase detectado. Confirme en Dashboard que es el proyecto STAGING."
else
  echo "Revise manualmente que este host corresponde a staging."
fi

psql_staging "$URL" -v ON_ERROR_STOP=1 -c "SELECT current_database() AS db, version() IS NOT NULL AS ok;" -c "BEGIN; SELECT 1; ROLLBACK;" >/dev/null
echo "Conexión OK. Transacciones BEGIN/ROLLBACK soportadas."

MIG=$(psql_staging "$URL" -t -A -c "SELECT COUNT(*) FROM supabase_migrations.schema_migrations" 2>/dev/null || echo "0")
if [[ "$MIG" == "0" ]]; then
  echo "Aviso: no se leyó supabase_migrations; aplique migraciones (Paso 2) antes de pruebas."
else
  echo "Migraciones registradas: $MIG"
fi
