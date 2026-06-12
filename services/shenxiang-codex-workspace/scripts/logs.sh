#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/shenxiang-codex-workspace}"
cd "$APP_DIR"
docker compose logs -f --tail=200 shenxiang-codex-workspace shenxiang-codex-worker-fast shenxiang-codex-worker-heavy
