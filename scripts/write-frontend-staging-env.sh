#!/usr/bin/env bash
# Genera frontend/.env.local para staging (solo claves públicas en el navegador).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/frontend/.env.local"

if [[ -z "${VITE_SUPABASE_URL:-}" && -n "${STAGING_DATABASE_URL:-}" ]]; then
  VITE_SUPABASE_URL="$(python3 <<'PY'
import os, re
from urllib.parse import urlparse
u = os.environ.get("STAGING_DATABASE_URL", "")
# postgres.[project-ref] en Supabase pooler
m = re.search(r"postgres\.([a-z0-9]+)", u)
if m:
    print(f"https://{m.group(1)}.supabase.co")
else:
    host = urlparse(u).hostname or ""
    if host.endswith(".supabase.co"):
        print(f"https://{host}")
PY
)"
  export VITE_SUPABASE_URL
fi

MISSING=()
[[ -z "${VITE_SUPABASE_URL:-}" ]] && MISSING+=("VITE_SUPABASE_URL")
[[ -z "${VITE_SUPABASE_ANON_KEY:-}" ]] && MISSING+=("VITE_SUPABASE_ANON_KEY")

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "Faltan variables de entorno para el frontend de staging:"
  for v in "${MISSING[@]}"; do echo "  - $v"; done
  echo ""
  echo "VITE_SUPABASE_URL: URL pública del proyecto (ej. https://xxxx.supabase.co)."
  echo "  Puede derivarse de STAGING_DATABASE_URL si el ref es postgres.[ref] en el pooler."
  echo "VITE_SUPABASE_ANON_KEY: clave anon/public del mismo proyecto (Dashboard → Settings → API)."
  echo "  No existe en STAGING_DATABASE_URL; debe configurarse como secreto del entorno o en .env.staging local."
  exit 2
fi

cat > "$OUT" <<EOF
# Generado por scripts/write-frontend-staging-env.sh — no commitear
VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
EOF

echo "Escrito $OUT (VITE_SUPABASE_URL host: $(python3 -c "from urllib.parse import urlparse; print(urlparse('${VITE_SUPABASE_URL}').hostname)"))"
