#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "PAWA — desplegar traductor DeepL (Cloudflare Worker)"
echo "Necesitas: cuenta Cloudflare + clave DeepL (…:fx)"
echo ""

if ! command -v npx >/dev/null; then
  echo "Instala Node.js primero."
  exit 1
fi

npm install --legacy-peer-deps

echo ""
echo "Inicia sesión en Cloudflare (se abre el navegador):"
npx wrangler login

echo ""
echo "Pega tu clave DeepL (no se mostrará en pantalla):"
read -rs DEEPL_KEY
echo ""

printf '%s' "$DEEPL_KEY" | npx wrangler secret put DEEPL_AUTH_KEY

echo ""
echo "Desplegando worker…"
npx wrangler deploy

echo ""
echo "Listo. Copia la URL https://…workers.dev de arriba"
echo "y pégala en PAWA → Calidad de traducción → Nube (DeepL)."
