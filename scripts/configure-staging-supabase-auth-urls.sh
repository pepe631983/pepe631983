#!/usr/bin/env bash
# Actualiza Site URL y redirect URLs en Supabase Auth (proyecto staging).
# Requiere SUPABASE_ACCESS_TOKEN (Dashboard → Account → Access tokens).
# No imprime secretos.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_REF="${STAGING_SUPABASE_PROJECT_REF:-dcfqaubuehnkniqcfvyg}"
SITE_URL="${1:-https://tci-auto-zone.web.app}"
REDIRECTS="${2:-https://tci-auto-zone.web.app/**,https://tci-auto-zone.firebaseapp.com/**,http://localhost:5173/**,http://127.0.0.1:5173/**,http://127.0.0.1:5175/**}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN no configurado."
  echo "Cree un token en https://supabase.com/dashboard/account/tokens"
  echo "Luego: SUPABASE_ACCESS_TOKEN=... $0 \"$SITE_URL\""
  exit 2
fi

python3 <<PY
import json, os, urllib.request
token = os.environ["SUPABASE_ACCESS_TOKEN"]
ref = os.environ.get("STAGING_SUPABASE_PROJECT_REF", "$PROJECT_REF")
site = "$SITE_URL"
redirects = [u.strip() for u in "$REDIRECTS".split(",") if u.strip()]
body = json.dumps({
  "site_url": site,
  "uri_allow_list": redirects,
}).encode()
req = urllib.request.Request(
  f"https://api.supabase.com/v1/projects/{ref}/config/auth",
  data=body,
  method="PATCH",
  headers={
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
  },
)
with urllib.request.urlopen(req, timeout=60) as resp:
  print("Supabase Auth config updated:", resp.status, "site_url=", site)
PY
