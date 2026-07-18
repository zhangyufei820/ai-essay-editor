#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/shenxiang-new-api}"
BASE_URL="${BASE_URL:-http://127.0.0.1:3120}"

if [ -f "${APP_DIR}/release-manifest.json" ]; then
  "${APP_DIR}/scripts/check-new-api-release-state.sh"
fi

python3 "${APP_DIR}/scripts/ensure_codex_entry.py" \
  --app-root "${APP_DIR}" \
  --check-source \
  --sync-db \
  --check-url "${BASE_URL}" \
  --strict
