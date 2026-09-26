#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/shenxiang-new-api"
MANIFEST="$ROOT/release-manifest.json"

if [[ ! -f "$ROOT/.env" ]]; then
  echo "missing $ROOT/.env" >&2
  exit 1
fi
if [[ ! -f "$MANIFEST" ]]; then
  echo "missing $MANIFEST" >&2
  exit 1
fi

RELEASE_COMMIT="$(jq -er '.repo_commit | select(type == "string" and test("^[0-9a-f]{40}$"))' "$MANIFEST")"
CHECKOUT="$ROOT/release-state/checkouts/$RELEASE_COMMIT"
MONITOR="$CHECKOUT/services/shenxiang-new-api/scripts/provider_monitor.py"

if [[ "$(git -C "$CHECKOUT" rev-parse HEAD)" != "$RELEASE_COMMIT" ]]; then
  echo "release checkout does not match manifest commit $RELEASE_COMMIT" >&2
  exit 1
fi
if [[ -n "$(git -C "$CHECKOUT" status --porcelain)" ]]; then
  echo "release checkout is dirty: $CHECKOUT" >&2
  exit 1
fi
if [[ ! -f "$MONITOR" ]]; then
  echo "missing release provider monitor" >&2
  exit 1
fi

mkdir -p "$ROOT/logs" "$ROOT/data"

run_with_timeout() {
  local timeout_seconds="$1"
  shift
  exec timeout --signal=TERM --kill-after=15s "${timeout_seconds}s" python3 "$MONITOR" "$@"
}

case "${1:-}" in
  --fast)
    shift
    if ! python3 "$MONITOR" --help 2>&1 | grep -q -- "--family"; then
      exit 0
    fi
    run_with_timeout "${PROVIDER_MONITOR_FAST_TIMEOUT_SECONDS:-420}" --family discount_text --family plus_text "$@"
    ;;
  --full)
    shift
    run_with_timeout "${PROVIDER_MONITOR_FULL_TIMEOUT_SECONDS:-1200}" "$@"
    ;;
  *)
    run_with_timeout "${PROVIDER_MONITOR_TIMEOUT_SECONDS:-1200}" "$@"
    ;;
esac
