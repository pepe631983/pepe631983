#!/usr/bin/env bash
# Carga STAGING_UI_TEST_* desde secretos del entorno (Cloud Agent) o archivo local gitignored.
set -euo pipefail
if [[ -n "${STAGING_UI_TEST_EMAIL:-}" && -n "${STAGING_UI_TEST_PASSWORD:-}" ]]; then
  return 0 2>/dev/null || exit 0
fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$ROOT/.staging-ui-test.credentials" ]]; then
  # shellcheck disable=SC1090
  set -a && source "$ROOT/.staging-ui-test.credentials" && set +a
fi
if [[ -z "${STAGING_UI_TEST_EMAIL:-}" || -z "${STAGING_UI_TEST_PASSWORD:-}" ]]; then
  echo "Faltan STAGING_UI_TEST_EMAIL y/o STAGING_UI_TEST_PASSWORD (secretos o .staging-ui-test.credentials)" >&2
  exit 2
fi
