#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/opt/shenxiang-new-api}"
MEDIA_CACHE_DIR="${PLAYGROUND_MEDIA_CACHE_DIR:-${ROOT_DIR}/data/media-cache}"
KEEP_MINUTES="${PLAYGROUND_MEDIA_KEEP_MINUTES:-1440}"

case "${MEDIA_CACHE_DIR}" in
  "${ROOT_DIR}"/data/media-cache|/data/media-cache)
    ;;
  *)
    echo "Refusing to clean unexpected media cache directory: ${MEDIA_CACHE_DIR}" >&2
    exit 1
    ;;
esac

if [[ ! -d "${MEDIA_CACHE_DIR}" ]]; then
  echo "media cache directory does not exist: ${MEDIA_CACHE_DIR}"
  exit 0
fi

if ! [[ "${KEEP_MINUTES}" =~ ^[0-9]+$ ]] || [[ "${KEEP_MINUTES}" -lt 1 ]]; then
  echo "PLAYGROUND_MEDIA_KEEP_MINUTES must be a positive integer, got: ${KEEP_MINUTES}" >&2
  exit 1
fi

echo "Cleaning media files older than ${KEEP_MINUTES} minutes in ${MEDIA_CACHE_DIR}"
find "${MEDIA_CACHE_DIR}" -maxdepth 1 -type f -mmin "+${KEEP_MINUTES}" \
  \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.webp' -o -name '*.gif' -o -name '*.mp4' -o -name '*.webm' \) \
  -print -delete
