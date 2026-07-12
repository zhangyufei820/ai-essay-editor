#!/usr/bin/env bash
set -euo pipefail

cd /opt/shenxiang-claude-gateway

BASE_URL="${1:-http://127.0.0.1:3130}"
TOKEN=""
AUTH_HEADER_FILE=""

cleanup() {
  if [ -n "${AUTH_HEADER_FILE}" ]; then
    rm -f "${AUTH_HEADER_FILE}"
  fi
}
trap cleanup EXIT HUP INT TERM

if [ ! -t 0 ]; then
  IFS= read -r TOKEN || true
elif [ -t 0 ]; then
  read -r -s -p "New API key (leave blank to skip authenticated checks): " TOKEN || true
  echo
fi

echo "==> health"
curl -fsS --max-time 10 "${BASE_URL}/health" | sed -E 's/sk-[A-Za-z0-9_-]+/[REDACTED]/g; s/(Bearer )[A-Za-z0-9._~+\/=:-]+/\1[REDACTED]/g'
echo

echo "==> models"
curl -fsS --max-time 10 "${BASE_URL}/v1/models" | cut -c 1-2000
echo

if [ -z "${TOKEN}" ]; then
  echo "No user API key provided. Skip authenticated /v1/messages tests."
  exit 0
fi

AUTH_HEADER_FILE="$(mktemp "${TMPDIR:-/tmp}/shenxiang-claude-auth.XXXXXX")"
chmod 600 "${AUTH_HEADER_FILE}"
printf 'Authorization: Bearer %s\n' "${TOKEN}" >"${AUTH_HEADER_FILE}"
unset TOKEN

echo "==> messages non-stream"
curl -fsS --max-time 60 "${BASE_URL}/v1/messages" \
  -H "@${AUTH_HEADER_FILE}" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cc-gpt-haiku",
    "max_tokens": 64,
    "messages": [{"role": "user", "content": "请只回复：Claude Gateway 测试成功"}]
  }' | sed -E 's/sk-[A-Za-z0-9_-]+/[REDACTED]/g; s/(Bearer )[A-Za-z0-9._~+\/=:-]+/\1[REDACTED]/g'
echo

echo "==> messages stream"
curl -fsS --max-time 60 -N "${BASE_URL}/v1/messages" \
  -H "@${AUTH_HEADER_FILE}" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cc-gpt-haiku",
    "max_tokens": 64,
    "stream": true,
    "messages": [{"role": "user", "content": "用一句话说明什么是 Claude Code 兼容网关"}]
  }' | sed -n '1,80p' | sed -E 's/sk-[A-Za-z0-9_-]+/[REDACTED]/g; s/(Bearer )[A-Za-z0-9._~+\/=:-]+/\1[REDACTED]/g'
