#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/shenxiang-codex-workspace}"
cd "$APP_DIR"

echo "[preflight] cwd=$(pwd)"
echo "[preflight] user=$(id -un)"
echo "[preflight] uname=$(uname -a)"

if ! command -v docker >/dev/null 2>&1; then
  echo "[preflight] ERROR: docker not found" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[preflight] ERROR: docker compose not available" >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "[preflight] ERROR: .env missing. Copy .env.example to .env first." >&2
  exit 1
fi

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

HOST_BIND_IP="$(read_env_value HOST_BIND_IP 127.0.0.1)"
HOST_BIND_PORT="$(read_env_value HOST_BIND_PORT 3140)"

if [ "$HOST_BIND_IP" != "127.0.0.1" ]; then
  echo "[preflight] ERROR: HOST_BIND_IP must be 127.0.0.1, got $HOST_BIND_IP" >&2
  exit 1
fi

if ss -tulpen | grep -q ":${HOST_BIND_PORT} "; then
  if ! ss -tulpen | grep ":${HOST_BIND_PORT} " | grep -q "127.0.0.1:${HOST_BIND_PORT}"; then
    echo "[preflight] ERROR: port ${HOST_BIND_PORT} is occupied or not bound to 127.0.0.1" >&2
    ss -tulpen | grep ":${HOST_BIND_PORT} " || true
    exit 1
  fi
  if ! docker ps --format '{{.Names}} {{.Ports}}' | grep -q "shenxiang-codex-workspace .*127.0.0.1:${HOST_BIND_PORT}->"; then
    echo "[preflight] ERROR: 127.0.0.1:${HOST_BIND_PORT} is already used by another service" >&2
    ss -tulpen | grep ":${HOST_BIND_PORT} " || true
    exit 1
  fi
fi

echo "[preflight] disk:"
df -h /
echo "[preflight] memory:"
free -h
echo "[preflight] important ports:"
ss -tulpen | grep -E ':(80|443|3120|3130|3140|3306|6379|18081) ' || true
echo "[preflight] OK: Codex workspace will bind only ${HOST_BIND_IP}:${HOST_BIND_PORT}"
