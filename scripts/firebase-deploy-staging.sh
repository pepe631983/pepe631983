#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm run env:frontend-staging
npm run build -w frontend
npm run verify:frontend-staging-bundle
if [[ -n "${FIREBASE_TOKEN:-}" ]]; then
  npx -y firebase-tools@latest deploy --only hosting --project tci-auto-zone --token "$FIREBASE_TOKEN"
else
  npx -y firebase-tools@latest deploy --only hosting --project tci-auto-zone
fi
