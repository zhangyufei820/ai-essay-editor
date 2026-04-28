#!/usr/bin/env bash
set -euo pipefail

WINDOW_MINUTES="${WINDOW_MINUTES:-5}"
TARGET_CONTAINER="${TARGET_CONTAINER:-docker-api-1}"
TARGET_ENDPOINT="${TARGET_ENDPOINT:-http://172.20.0.11:8001/api/image/unified}"

SINCE_ARG="${WINDOW_MINUTES}m"
NOW_LOCAL="$(date '+%Y-%m-%d %H:%M:%S %z')"

LOG_TEXT="$(docker logs --since "${SINCE_ARG}" "${TARGET_CONTAINER}" 2>&1 || true)"

PATTERN_504="POST ${TARGET_ENDPOINT} \"HTTP/1.1 504 Gateway Timeout\""
PATTERN_200="POST ${TARGET_ENDPOINT} \"HTTP/1.1 200 OK\""

COUNT_504="$(printf '%s\n' "${LOG_TEXT}" | grep -c "${PATTERN_504}" || true)"
COUNT_200="$(printf '%s\n' "${LOG_TEXT}" | grep -c "${PATTERN_200}" || true)"

TOTAL=$((COUNT_504 + COUNT_200))
RATIO_504="0.00"

if [ "${TOTAL}" -gt 0 ]; then
  RATIO_504="$(awk -v c504="${COUNT_504}" -v total="${TOTAL}" 'BEGIN { printf "%.2f", (c504/total)*100 }')"
fi

LAST_504_UTC="$(printf '%s\n' "${LOG_TEXT}" | grep "${PATTERN_504}" | tail -n 1 | awk '{print $1" "$2}' | sed 's/\.[0-9]*$//' || true)"
if [ -z "${LAST_504_UTC}" ]; then
  LAST_504_UTC="-"
fi

LAST_200_UTC="$(printf '%s\n' "${LOG_TEXT}" | grep "${PATTERN_200}" | tail -n 1 | awk '{print $1" "$2}' | sed 's/\.[0-9]*$//' || true)"
if [ -z "${LAST_200_UTC}" ]; then
  LAST_200_UTC="-"
fi

printf '%s window=%sm 200=%s 504=%s total=%s 504_ratio=%s%% last_504_utc=%s last_200_utc=%s\n' \
  "${NOW_LOCAL}" "${WINDOW_MINUTES}" "${COUNT_200}" "${COUNT_504}" "${TOTAL}" "${RATIO_504}" "${LAST_504_UTC}" "${LAST_200_UTC}"
