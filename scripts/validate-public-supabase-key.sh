#!/usr/bin/env bash
# Valida que VITE_SUPABASE_* permitan auth (anon JWT o sb_publishable_).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/load-staging-env.sh
source "$ROOT/scripts/load-staging-env.sh" 2>/dev/null || true

if [[ ! -f "$ROOT/frontend/.env.local" ]]; then
  bash "$ROOT/scripts/write-frontend-staging-env.sh"
fi

cd "$ROOT/frontend"
node <<'NODE'
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const kind = key.startsWith('sb_publishable_') ? 'publishable' : key.startsWith('eyJ') ? 'anon_jwt' : 'unknown';
console.log('key_kind:', kind);
if (kind === 'unknown') {
  console.error('Clave no reconocida; use sb_publishable_... o JWT eyJ...');
  process.exit(2);
}
const sb = createClient(url, key);
sb.auth.getSession().then(({ error }) => {
  if (error) {
    console.error('auth.getSession failed:', error.message);
    process.exit(1);
  }
  console.log('auth.getSession: ok');
  console.log('validate-public-supabase-key: PASSED');
});
NODE
