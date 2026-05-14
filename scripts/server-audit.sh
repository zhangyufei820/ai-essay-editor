#!/usr/bin/env bash
set -euo pipefail

# Read-only production audit helper. Do not add destructive cleanup commands here.

APP_HEALTH_URL="${APP_HEALTH_URL:-http://127.0.0.1:3000/api/health}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://shenxiang.school/api/health}"
NEXT_CONTAINER="${NEXT_CONTAINER:-shenxiang-nextjs}"

section() {
  printf '\n== %s ==\n' "$1"
}

run_optional() {
  local label="$1"
  shift
  section "$label"
  if command -v "$1" >/dev/null 2>&1; then
    "$@" || true
  else
    printf 'skip: %s not found\n' "$1"
  fi
}

section "host"
hostname || true
date -Is || true
uname -a || true

section "disk"
df -h / /data 2>/dev/null || df -h /

run_optional "docker system df" docker system df

section "containers"
if command -v docker >/dev/null 2>&1; then
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
else
  printf 'skip: docker not found\n'
fi

section "images"
if command -v docker >/dev/null 2>&1; then
  docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}' || true
  printf '\nDangling images:\n'
  docker images -f dangling=true --format '{{.ID}} {{.Repository}}:{{.Tag}} {{.Size}}' || true
fi

section "buildkit cache"
if command -v docker >/dev/null 2>&1; then
  docker builder du 2>/dev/null | sed -n '1,120p' || true
fi

section "listening ports"
if command -v ss >/dev/null 2>&1; then
  ss -lntp || true
elif command -v netstat >/dev/null 2>&1; then
  netstat -lntp || true
else
  printf 'skip: ss/netstat not found\n'
fi

section "health"
if command -v curl >/dev/null 2>&1; then
  curl -fsS -o /tmp/shenxiang-health-local.json -w "local %{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s\n" "$APP_HEALTH_URL" || true
  cat /tmp/shenxiang-health-local.json 2>/dev/null || true
  printf '\n'
  curl -fsS -o /tmp/shenxiang-health-public.json -w "public %{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s\n" "$PUBLIC_HEALTH_URL" || true
  cat /tmp/shenxiang-health-public.json 2>/dev/null || true
  printf '\n'
else
  printf 'skip: curl not found\n'
fi

section "nextjs recent warnings"
if command -v docker >/dev/null 2>&1; then
  docker logs --tail 300 "$NEXT_CONTAINER" 2>&1 | grep -Ei 'error|fail|timeout|refused|oom|exception|unhandled' || true
fi

section "audit complete"
printf 'This script is read-only. Review docs/SERVER-CLEANUP-SOP.md before any cleanup.\n'
