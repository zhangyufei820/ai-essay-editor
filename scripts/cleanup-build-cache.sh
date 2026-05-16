#!/usr/bin/env bash
set -euo pipefail

KEEP_HOURS="${KEEP_HOURS:-24}"

echo "== Docker disk usage before cleanup =="
docker system df

echo
echo "== Pruning BuildKit cache older than ${KEEP_HOURS}h =="
docker buildx prune -a --filter "until=${KEEP_HOURS}h" --force

echo
echo "== Docker disk usage after cleanup =="
docker system df

echo
echo "== Filesystem usage =="
df -h / /data 2>/dev/null || df -h /
