#!/usr/bin/env bash
set -euo pipefail

cd /opt/shenxiang-claude-gateway
docker compose logs -f --tail=200 shenxiang-claude-gateway
