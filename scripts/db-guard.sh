#!/usr/bin/env bash
# Identifica destino de BD y bloquea operaciones destructivas fuera de Supabase local.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "${STAGING_DATABASE_URL:-}" && -f "$ROOT_DIR/.env.staging" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT_DIR/.env.staging"
  set +a
fi

resolve_db_url() {
  if [[ -n "${STAGING_DATABASE_URL:-}" ]]; then
    echo "$STAGING_DATABASE_URL"
    return
  fi
  if [[ -n "${DATABASE_URL:-}" ]]; then
    echo "$DATABASE_URL"
    return
  fi
  echo "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
}

db_host_port() {
  local url="$1"
  if [[ "$url" =~ @([^:/]+):([0-9]+)/ ]]; then
    echo "${BASH_REMATCH[1]}:${BASH_REMATCH[2]}"
  elif [[ "$url" =~ @([^/]+)/ ]]; then
    echo "${BASH_REMATCH[1]}:5432"
  else
    echo "unknown"
  fi
}

is_local_supabase() {
  local url="$1"
  local hp
  hp="$(db_host_port "$url")"
  [[ "$hp" == "127.0.0.1:54322" || "$hp" == "localhost:54322" ]]
}

print_environment_info() {
  local url="$1"
  local local_flag="no"
  if is_local_supabase "$url"; then
    local_flag="sí (Supabase local)"
  fi
  echo "=== Entorno de base de datos ==="
  echo "Host:puerto detectado: $(db_host_port "$url")"
  echo "¿Local de prueba (127.0.0.1:54322)?: $local_flag"
  if [[ -n "${STAGING_DATABASE_URL:-}" ]]; then
    echo "Origen URL: STAGING_DATABASE_URL"
  elif [[ -n "${DATABASE_URL:-}" ]]; then
    echo "Origen URL: DATABASE_URL"
  else
    echo "Origen URL: predeterminado local"
  fi
  echo ""
  echo "Comandos destructivos:"
  echo "  supabase db reset  → BORRA y recrea la base del proyecto enlazado/local."
  echo "  npm run db:reset:local → solo si host es 127.0.0.1:54322"
  echo ""
  echo "Comando seguro staging/local (sin reset):"
  echo "  npm run db:test:staging  → BEGIN; suite; ROLLBACK (no persiste datos de prueba)"
}

require_not_production_reset() {
  local url="$1"
  if ! is_local_supabase "$url"; then
    echo "ERROR: db reset bloqueado. Host $(db_host_port "$url") no es Supabase local."
    echo "Use npm run db:test:staging en un proyecto Supabase de STAGING dedicado."
    exit 1
  fi
}
