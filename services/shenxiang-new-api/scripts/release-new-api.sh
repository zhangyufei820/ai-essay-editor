#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/shenxiang-new-api}"
LOCK_FILE="${NEW_API_RELEASE_LOCK_FILE:-/var/lock/shenxiang-new-api-release.lock}"
CORE="${APP_DIR}/scripts/release_new_api.py"

if [ ! -f "$CORE" ]; then
  printf 'New API release core is missing: %s\n' "$CORE" >&2
  exit 1
fi

exec flock -n -E 75 "$LOCK_FILE" python3 "$CORE" "$@"
