#!/usr/bin/env bash
set -euo pipefail

cd /opt/shenxiang-claude-gateway

docker compose ps
docker compose logs --tail=80 shenxiang-claude-gateway
ss -tulpen | grep -E ':3130|:3120' || true
curl -fsS --max-time 10 http://127.0.0.1:3130/health | sed 's/sk-[A-Za-z0-9_-]*/[REDACTED]/g' || true
