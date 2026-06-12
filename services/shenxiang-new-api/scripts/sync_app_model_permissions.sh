#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/shenxiang-new-api"
LOCK="/tmp/shenxiang-new-api-model-sync.lock"

cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "missing $ROOT/.env" >&2
  exit 1
fi

mkdir -p "$ROOT/logs"

export SYNC_TIMESTAMP
SYNC_TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

set -a
# shellcheck disable=SC1091
. "$ROOT/.env"
set +a

flock -n "$LOCK" python3 "$ROOT/scripts/sync_app_model_permissions.py"
