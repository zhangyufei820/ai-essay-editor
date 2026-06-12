#!/usr/bin/env bash
set -euo pipefail

cd /opt/shenxiang-claude-gateway

echo "==> shenxiang-claude-gateway preflight"
echo "user: $(id -un)"
echo "cwd: $(pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose is not available"
  exit 1
fi

if [ ! -f .env ]; then
  echo "ERROR: .env missing. Run: cp .env.example .env"
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

PORT="${CLAUDE_GATEWAY_PORT:-3130}"
HOST="${CLAUDE_GATEWAY_HOST:-0.0.0.0}"

echo "gateway internal host: ${HOST}"
echo "gateway host binding: 127.0.0.1:${PORT}"
echo "new api endpoint: ${NEW_API_BASE_URL:-http://shenxiang-new-api:3000/v1}"

if [ "${PORT}" = "3120" ] || [ "${PORT}" = "3000" ] || [ "${PORT}" = "3100" ]; then
  echo "ERROR: CLAUDE_GATEWAY_PORT cannot use existing business ports"
  exit 1
fi

if ss -tulpen | grep -qE "127\\.0\\.0\\.1:${PORT}\\b|0\\.0\\.0\\.0:${PORT}\\b|\\[::\\]:${PORT}\\b"; then
  echo "ERROR: port ${PORT} is already listening. Choose another local port."
  ss -tulpen | grep -E ":${PORT}\\b" || true
  exit 1
fi

if ! docker network inspect shenxiang-new-api-net >/dev/null 2>&1; then
  echo "ERROR: docker network shenxiang-new-api-net not found"
  exit 1
fi

if ! docker ps --format '{{.Names}} {{.Status}} {{.Ports}}' | grep -q '^shenxiang-new-api .*healthy'; then
  echo "ERROR: shenxiang-new-api is not healthy"
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'shenxiang-new-api|NAMES' || true
  exit 1
fi

echo "OK: preflight passed. This deployment will only bind 127.0.0.1:${PORT} on the host."
