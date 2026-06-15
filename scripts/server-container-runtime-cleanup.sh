#!/usr/bin/env bash
set -Eeuo pipefail

# Safe production cleanup for Docker/BuildKit/containerd-backed cache.
# This script never deletes Docker volumes, running containers, networks, or
# files under /var/lib/containerd directly. All cleanup goes through Docker's
# supported prune commands.

LOCK_FILE="${LOCK_FILE:-/var/lock/shenxiang-container-runtime-cleanup.lock}"
LOG_DIR="${LOG_DIR:-/var/log/shenxiang-cleanup}"
ROOT_PATH="${ROOT_PATH:-/}"
MIN_USAGE_PERCENT="${MIN_USAGE_PERCENT:-70}"
BUILD_CACHE_UNTIL="${BUILD_CACHE_UNTIL:-48h}"
UNUSED_IMAGE_UNTIL="${UNUSED_IMAGE_UNTIL:-168h}"
JOURNAL_VACUUM_TIME="${JOURNAL_VACUUM_TIME:-7d}"
APP_HEALTH_URL="${APP_HEALTH_URL:-http://127.0.0.1:3000/api/health}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://shenxiang.school/api/health}"
DRY_RUN="${DRY_RUN:-0}"
FORCE="${FORCE:-0}"

mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_FILE:-$LOG_DIR/container-runtime-cleanup-$(date +%F).log}"

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*" | tee -a "$LOG_FILE"
}

section() {
  log "== $* =="
}

usage_percent() {
  df -P "$ROOT_PATH" | awk 'NR==2 { gsub(/%/, "", $5); print $5 }'
}

run_logged() {
  log "+ $*"
  if [[ "$DRY_RUN" == "1" ]]; then
    return 0
  fi
  "$@" 2>&1 | tee -a "$LOG_FILE"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "missing command: $1"
    exit 127
  fi
}

health_check() {
  local label="$1"
  local url="$2"

  if curl -fsS --max-time 15 "$url" >/tmp/shenxiang-cleanup-health.json; then
    log "health ok: $label $url"
    return 0
  fi

  log "health failed: $label $url"
  return 1
}

snapshot() {
  section "$1"
  df -h "$ROOT_PATH" 2>&1 | tee -a "$LOG_FILE" || true
  docker system df 2>&1 | tee -a "$LOG_FILE" || true
  du -sh /var/lib/containerd /var/lib/containerd/io.containerd.snapshotter.v1.overlayfs /var/lib/containerd/io.containerd.content.v1.content 2>&1 | tee -a "$LOG_FILE" || true
}

cleanup_build_cache() {
  section "build cache cleanup"
  if docker buildx version >/dev/null 2>&1; then
    run_logged docker buildx prune -af --filter "until=$BUILD_CACHE_UNTIL"
  else
    run_logged docker builder prune -af --filter "until=$BUILD_CACHE_UNTIL"
  fi
}

cleanup_dangling_images() {
  section "dangling image cleanup"
  run_logged docker image prune -f
}

cleanup_old_unused_images() {
  section "old unused image cleanup"
  run_logged docker image prune -af --filter "until=$UNUSED_IMAGE_UNTIL"
}

cleanup_journal() {
  section "journal cleanup"
  if command -v journalctl >/dev/null 2>&1; then
    run_logged journalctl --vacuum-time="$JOURNAL_VACUUM_TIME"
  else
    log "skip journal cleanup: journalctl not found"
  fi
}

main() {
  require_command awk
  require_command curl
  require_command df
  require_command docker
  require_command flock

  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    log "another cleanup is already running; exit"
    exit 0
  fi

  section "start"
  log "dry_run=$DRY_RUN force=$FORCE root_path=$ROOT_PATH min_usage_percent=$MIN_USAGE_PERCENT build_cache_until=$BUILD_CACHE_UNTIL unused_image_until=$UNUSED_IMAGE_UNTIL"

  local before_usage
  before_usage="$(usage_percent)"
  snapshot "before"

  if [[ "$FORCE" != "1" && "$before_usage" -lt "$MIN_USAGE_PERCENT" ]]; then
    log "skip cleanup: usage ${before_usage}% is below threshold ${MIN_USAGE_PERCENT}%"
    exit 0
  fi

  health_check "local" "$APP_HEALTH_URL"
  health_check "public" "$PUBLIC_HEALTH_URL"

  cleanup_build_cache
  cleanup_dangling_images

  local mid_usage
  mid_usage="$(usage_percent)"
  if [[ "$FORCE" == "1" || "$mid_usage" -ge "$MIN_USAGE_PERCENT" ]]; then
    cleanup_old_unused_images
  else
    log "skip old unused image cleanup: usage ${mid_usage}% is below threshold ${MIN_USAGE_PERCENT}%"
  fi

  cleanup_journal

  snapshot "after"
  health_check "local" "$APP_HEALTH_URL"
  health_check "public" "$PUBLIC_HEALTH_URL"

  local after_usage
  after_usage="$(usage_percent)"
  log "complete: usage ${before_usage}% -> ${after_usage}%"
}

main "$@"
