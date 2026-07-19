#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/shenxiang-new-api"
LOCK="/tmp/shenxiang-new-api-model-sync.lock"
MANIFEST="$ROOT/release-manifest.json"

cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "missing $ROOT/.env" >&2
  exit 1
fi

if [[ ! -f "$MANIFEST" ]]; then
  echo "missing $MANIFEST" >&2
  exit 1
fi

RELEASE_COMMIT="$(jq -er '.repo_commit | select(type == "string" and test("^[0-9a-f]{40}$"))' "$MANIFEST")"
CHECKOUT="$ROOT/release-state/checkouts/$RELEASE_COMMIT"
SERVICE_DIR="$CHECKOUT/services/shenxiang-new-api"
SYNC_SCRIPT="$SERVICE_DIR/scripts/sync_app_model_permissions.py"
GROK45_SCRIPT="$SERVICE_DIR/scripts/configure_grok45_model.py"

if [[ "$(git -C "$CHECKOUT" rev-parse HEAD)" != "$RELEASE_COMMIT" ]]; then
  echo "release checkout does not match manifest commit $RELEASE_COMMIT" >&2
  exit 1
fi
if [[ -n "$(git -C "$CHECKOUT" status --porcelain)" ]]; then
  echo "release checkout is dirty: $CHECKOUT" >&2
  exit 1
fi
for script in "$SYNC_SCRIPT" "$GROK45_SCRIPT"; do
  if [[ ! -f "$script" ]]; then
    echo "missing release script: $script" >&2
    exit 1
  fi
done

mkdir -p "$ROOT/logs"

export SYNC_TIMESTAMP
SYNC_TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

set -a
# shellcheck disable=SC1091
. "$ROOT/.env"
set +a

exec 9>"$LOCK"
flock -n 9
python3 "$SYNC_SCRIPT"
GROK45_MODEL_SYNC_LOCK_HELD=1 python3 "$GROK45_SCRIPT" --reconcile-if-configured
