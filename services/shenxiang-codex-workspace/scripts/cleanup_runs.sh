#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/shenxiang-codex-workspace}"
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "missing .env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

HOST_BIND_PORT="${HOST_BIND_PORT:-3140}"
if [ -z "${ADMIN_API_KEY:-}" ] || [ "$ADMIN_API_KEY" = "change-me" ]; then
  echo "ADMIN_API_KEY is not configured" >&2
  exit 1
fi

curl -fsS \
  -X POST \
  -H "Authorization: Bearer ${ADMIN_API_KEY}" \
  "http://127.0.0.1:${HOST_BIND_PORT}/admin/cleanup"
echo
