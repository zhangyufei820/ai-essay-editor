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
GROK46_SCRIPT="$SERVICE_DIR/scripts/configure_grok46_model.py"
KIMI_K3_SCRIPT="$SERVICE_DIR/scripts/configure_kimi_k3_channel.py"
GPT6_ASTRA_SCRIPT="$SERVICE_DIR/scripts/configure_gpt6_astra_channel.py"

if [[ "$(git -C "$CHECKOUT" rev-parse HEAD)" != "$RELEASE_COMMIT" ]]; then
  echo "release checkout does not match manifest commit $RELEASE_COMMIT" >&2
  exit 1
fi
if [[ -n "$(git -C "$CHECKOUT" status --porcelain)" ]]; then
  echo "release checkout is dirty: $CHECKOUT" >&2
  exit 1
fi
if [[ ! -f "$SYNC_SCRIPT" ]]; then
  echo "missing release script: $SYNC_SCRIPT" >&2
  exit 1
fi

mkdir -p "$ROOT/logs"

export SYNC_TIMESTAMP
SYNC_TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

set -a
# shellcheck disable=SC1091
. "$ROOT/.env"
set +a

optional_failures=()

# Core token permissions are mandatory; provider-specific reconciliation is best-effort.
run_optional_reconcile() {
  local model="$1"
  local lock_marker="$2"
  local script="$3"
  local exit_code

  if env "${lock_marker}=1" python3 "$script" --reconcile-if-configured; then
    return 0
  else
    exit_code=$?
  fi

  optional_failures+=("${model}:${exit_code}")
  printf 'warning: optional model reconcile failed model=%s exit_code=%s\n' "$model" "$exit_code" >&2
  return 0
}

exec 9>"$LOCK"
flock -n 9
python3 "$SYNC_SCRIPT"
run_optional_reconcile "kimi-k3" "KIMI_K3_CHANNEL_SYNC_LOCK_HELD" "$KIMI_K3_SCRIPT"
run_optional_reconcile "gpt-6-astra" "GPT6_ASTRA_CHANNEL_SYNC_LOCK_HELD" "$GPT6_ASTRA_SCRIPT"
run_optional_reconcile "grok-4.5" "GROK45_MODEL_SYNC_LOCK_HELD" "$GROK45_SCRIPT"
run_optional_reconcile "grok-4.6" "GROK46_MODEL_SYNC_LOCK_HELD" "$GROK46_SCRIPT"

if [[ ${#optional_failures[@]} -gt 0 ]]; then
  printf 'warning: model permission sync completed with optional_failures=%s\n' "$(IFS=,; printf '%s' "${optional_failures[*]}")" >&2
fi
