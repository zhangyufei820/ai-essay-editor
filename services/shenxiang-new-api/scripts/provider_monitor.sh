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

case "${1:-}" in
  --fast)
    shift
    if ! python3 "$MONITOR" --help 2>&1 | grep -q -- "--family"; then
      exit 0
    fi
    exec python3 "$MONITOR" --family discount_text --family plus_text "$@"
    ;;
  --full)
    shift
    exec python3 "$MONITOR" "$@"
    ;;
  *)
    exec python3 "$MONITOR" "$@"
    ;;
esac
