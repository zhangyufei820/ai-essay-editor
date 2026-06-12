#!/usr/bin/env bash
set -euo pipefail

cd /opt/shenxiang-claude-gateway

./scripts/preflight.sh

echo "==> docker compose build"
docker compose build shenxiang-claude-gateway

echo "==> docker compose up -d"
docker compose up -d shenxiang-claude-gateway

echo "==> compose ps"
docker compose ps

echo "==> waiting for health"
for i in $(seq 1 30); do
  if curl -fsS --max-time 5 "http://127.0.0.1:${CLAUDE_GATEWAY_PORT:-3130}/health" >/dev/null; then
    echo "OK: health endpoint is reachable"
    exit 0
  fi
  sleep 2
done

echo "ERROR: gateway did not become healthy"
docker compose logs --tail=100 shenxiang-claude-gateway
exit 1
