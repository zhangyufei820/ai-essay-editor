#!/usr/bin/env bash
set -Eeuo pipefail

# Read-only disk guard. It audits before the root disk reaches the 85% cleanup
# threshold and points operators back to docs/SERVER-CLEANUP-SOP.md.

ROOT_PATH="${ROOT_PATH:-/}"
WARN_USAGE_PERCENT="${WARN_USAGE_PERCENT:-80}"
CRITICAL_USAGE_PERCENT="${CRITICAL_USAGE_PERCENT:-85}"
RUN_AUDIT="${RUN_AUDIT:-1}"
AUDIT_LOG_DIR="${AUDIT_LOG_DIR:-/data}"

usage_percent() {
  df -P "$ROOT_PATH" | awk 'NR==2 { gsub(/%/, "", $5); print $5 }'
}

log() {
  local timestamp
  timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf '[%s] %s\n' "$timestamp" "$*"
}

main() {
  local usage
  usage="$(usage_percent)"

  log "disk_guard root_path=$ROOT_PATH usage=${usage}% warn=${WARN_USAGE_PERCENT}% critical=${CRITICAL_USAGE_PERCENT}%"
  if [[ -e /data ]]; then
    df -h "$ROOT_PATH" /data
  else
    df -h "$ROOT_PATH"
  fi

  if [[ "$usage" -lt "$WARN_USAGE_PERCENT" ]]; then
    log "ok: usage is below warning threshold; no audit needed"
    exit 0
  fi

  log "warning: usage reached ${usage}%; run the conservative audit before cleanup"
  log "sop: docs/SERVER-CLEANUP-SOP.md"

  if [[ "$RUN_AUDIT" == "1" ]]; then
    local audit_log="$AUDIT_LOG_DIR/server-audit-disk-guard-$(date +%F-%H%M).log"
    log "running read-only audit: bash scripts/server-audit.sh | tee $audit_log"
    bash scripts/server-audit.sh | tee "$audit_log"
  fi

  if [[ "$usage" -ge "$CRITICAL_USAGE_PERCENT" ]]; then
    log "critical: usage is at or above ${CRITICAL_USAGE_PERCENT}%; review SOP and only clean BuildKit/log/npm cache boundaries"
    exit 2
  fi

  log "warning complete: usage is below critical threshold"
  exit 1
}

main "$@"
