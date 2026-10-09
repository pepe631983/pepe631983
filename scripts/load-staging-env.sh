#!/usr/bin/env bash
# Carga STAGING_DATABASE_URL sin imprimir valores.
# Orden: variable de entorno (secretos Cursor) → .env.staging local (gitignored, solo dev manual).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -z "${STAGING_DATABASE_URL:-}" && -f "$ROOT/.env.staging" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env.staging"
  set +a
fi

if [[ -n "${STAGING_DATABASE_URL:-}" ]]; then
  export STAGING_DATABASE_URL
  echo "STAGING_DATABASE_URL: configurada (longitud ${#STAGING_DATABASE_URL})"
else
  echo "STAGING_DATABASE_URL: no disponible en este proceso."
  echo "Si acaba de guardar el secreto en Cursor, relance el agente (nuevo run)."
  exit 2
fi
