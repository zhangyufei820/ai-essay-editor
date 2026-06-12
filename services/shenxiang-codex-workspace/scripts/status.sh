#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/shenxiang-codex-workspace}"
cd "$APP_DIR"

docker compose ps
echo
docker compose logs --tail=100 shenxiang-codex-workspace
echo
df -h /
free -h
echo
HOST_BIND_PORT="$(grep -E '^HOST_BIND_PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2-)"
HOST_BIND_PORT="${HOST_BIND_PORT:-3140}"
curl -i --max-time 5 "http://127.0.0.1:${HOST_BIND_PORT}/health" || true
