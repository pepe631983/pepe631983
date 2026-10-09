#!/usr/bin/env bash
# Falla si el bundle publicado contiene secretos de DB o service role.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/frontend/dist"
STAGING_HOST="${STAGING_SUPABASE_HOST:-dcfqaubuehnkniqcfvyg.supabase.co}"

if [[ ! -d "$DIST" ]]; then
  echo "No existe $DIST — ejecute npm run build -w frontend"
  exit 2
fi

BAD=0
if rg -q 'postgres://|postgresql://' "$DIST" 2>/dev/null; then
  echo "ERROR: bundle contiene URL de conexión PostgreSQL"
  BAD=1
fi
if rg -q 'service_role' "$DIST" 2>/dev/null && ! rg -q 'solo aplica a herramientas CLI' "$DIST" 2>/dev/null; then
  echo "ERROR: bundle menciona service_role fuera de mensaje de ayuda"
  BAD=1
fi
if rg -q 'eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+' "$DIST" 2>/dev/null; then
  if rg -q 'service_role|role.*service' "$DIST" 2>/dev/null; then
    echo "ERROR: posible JWT service role en bundle"
    BAD=1
  fi
fi
if ! rg -q "$STAGING_HOST" "$DIST/assets/"*.js 2>/dev/null; then
  echo "ADVERTENCIA: no se encontró host staging $STAGING_HOST en assets (verifique build con env:frontend-staging)"
fi
if rg -q '\.supabase\.co' "$DIST/assets/"*.js 2>/dev/null; then
  OTHER=$(rg -o 'https://[a-z0-9]+\.supabase\.co' "$DIST/assets/"*.js | sort -u | grep -v "$STAGING_HOST" || true)
  if [[ -n "$OTHER" ]]; then
    echo "ERROR: el bundle referencia otros proyectos Supabase:"
    echo "$OTHER"
    BAD=1
  fi
fi

if [[ "$BAD" -ne 0 ]]; then exit 1; fi
echo "verify-frontend-build-secrets: OK (solo staging esperado)"
