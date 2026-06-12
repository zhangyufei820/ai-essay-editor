#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/shenxiang-codex-workspace}"
cd "$APP_DIR"

./scripts/preflight.sh

docker compose build shenxiang-codex-workspace shenxiang-codex-worker-fast
docker compose up -d
docker compose ps

HOST_BIND_PORT="$(grep -E '^HOST_BIND_PORT=' .env | tail -1 | cut -d= -f2-)"
HOST_BIND_PORT="${HOST_BIND_PORT:-3140}"

echo "[deploy] waiting for health..."
for _ in $(seq 1 40); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${HOST_BIND_PORT}/health" >/dev/null; then
    echo "[deploy] health OK"
    curl -sS --max-time 3 "http://127.0.0.1:${HOST_BIND_PORT}/health"
    echo
    exit 0
  fi
  sleep 2
done

echo "[deploy] ERROR: health check failed" >&2
docker compose logs --tail=120 shenxiang-codex-workspace
exit 1
