#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/shenxiang-codex-workspace}"
cd "$APP_DIR"

read_env_value() {
  local key="$1"
  local default="$2"
  local value
  value="$(grep -E "^${key}=" .env 2>/dev/null | tail -1 | cut -d= -f2- || true)"
  value="${value%$'\r'}"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  fi
  if [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "${value:-$default}"
}

HOST_BIND_PORT="$(read_env_value HOST_BIND_PORT 3140)"
USER_KEY="${1:-}"

curl -i --max-time 5 "http://127.0.0.1:${HOST_BIND_PORT}/health"

if [ -n "$USER_KEY" ]; then
  echo
  curl -sS --max-time 20 \
    -H "Authorization: Bearer ${USER_KEY}" \
    "http://127.0.0.1:${HOST_BIND_PORT}/api/bootstrap" | python3 -m json.tool
fi
