#!/usr/bin/env bash
set -euo pipefail

cd /opt/shenxiang-claude-gateway
docker compose restart shenxiang-claude-gateway
