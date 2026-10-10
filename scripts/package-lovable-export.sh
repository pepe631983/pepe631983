#!/usr/bin/env bash
# Empaqueta fuentes para Lovable (sin secretos ni artefactos generados).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
STAMP="$(date -u +%Y%m%d)"
OUT_DIR="${LOVABLE_EXPORT_DIR:-/opt/cursor/artifacts}"
BUNDLE_NAME="tci-auto-zone-lovable-${STAMP}-${VERSION}"
STAGING="${TMPDIR:-/tmp}/${BUNDLE_NAME}"
ZIP_PATH="${OUT_DIR}/${BUNDLE_NAME}.zip"
INNER="tci-auto-zone-lovable"

rm -rf "$STAGING"
mkdir -p "$STAGING/$INNER" "$OUT_DIR"

cd "$ROOT"
tar -cf - \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='frontend/node_modules' \
  --exclude='frontend/dist' \
  --exclude='frontend/test-results' \
  --exclude='frontend/playwright-report' \
  --exclude='frontend/.env.local' \
  --exclude='frontend/.env' \
  --exclude='frontend/.env.staging' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='.env.staging' \
  --exclude='.staging-ui-test.credentials' \
  --exclude='.firebase' \
  --exclude='desktop/release' \
  --exclude='supabase/.temp' \
  --exclude='docs/ui-e2e-screenshots' \
  --exclude='docs/export-snapshot-*.json' \
  --exclude='docs/ui-e2e-staging-report.json' \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  . | tar -xf - -C "$STAGING/$INNER"

{
  echo "bundle=${BUNDLE_NAME}.zip"
  echo "git_head=${VERSION}"
  echo "branch=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  echo "migrations=$(ls -1 "$STAGING/$INNER/supabase/migrations/"*.sql 2>/dev/null | wc -l)"
  echo "includes_readme_lovable=yes"
} > "$STAGING/$INNER/LOVABLE-MANIFEST.txt"

(
  cd "$STAGING"
  zip -rq "$ZIP_PATH" "$INNER"
)

echo "ZIP creado: $ZIP_PATH"
echo "Tamaño: $(du -h "$ZIP_PATH" | awk '{print $1}')"

FAIL=0
if unzip -l "$ZIP_PATH" | rg -q 'node_modules/|\.env\.local'; then
  echo "FALLO: ZIP lista node_modules o .env.local"
  FAIL=1
fi

# Buscar secretos en archivos de texto del bundle (no binarios)
TMP_SCAN="${STAGING}/scan"
mkdir -p "$TMP_SCAN"
unzip -q "$ZIP_PATH" -d "$TMP_SCAN"

ENV_FILES=$(find "$TMP_SCAN" -type f \( -name '.env' -o -name '.env.*' -o -name '*.credentials' \) 2>/dev/null || true)
for f in $ENV_FILES; do
  if [[ -f "$f" ]] && rg -q '=.\+' "$f" 2>/dev/null; then
    echo "FALLO: variable con valor en $(basename "$f")"
    FAIL=1
  fi
done

# JWT Supabase típico (no ejemplos en comentarios con [PASSWORD])
if rg -q 'eyJhbGciOi[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' "$TMP_SCAN" \
  --glob '!*.md' --glob '!scripts/*' --glob '!package-lock.json' 2>/dev/null; then
  echo "FALLO: posible JWT embebido en código"
  FAIL=1
fi

if rg -q 'postgresql://postgres\.[a-z0-9]+:[^[\s\]]+@' "$TMP_SCAN" \
  --glob '!*.md' --glob '!scripts/*' 2>/dev/null; then
  echo "FALLO: URL postgres con contraseña real"
  FAIL=1
fi

if [[ "$FAIL" -ne 0 ]]; then
  rm -f "$ZIP_PATH"
  rm -rf "$STAGING" "$TMP_SCAN"
  exit 1
fi

echo "Verificación OK: sin credenciales obvias, sin node_modules ni .env.local."

rm -rf "$STAGING" "$TMP_SCAN"
