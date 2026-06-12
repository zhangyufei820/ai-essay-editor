#!/usr/bin/env bash
set -euo pipefail

cd /opt/shenxiang-claude-gateway

TOKEN="${1:-}"
BASE_URL="${2:-http://127.0.0.1:3130}"

echo "==> health"
curl -fsS --max-time 10 "${BASE_URL}/health" | sed 's/sk-[A-Za-z0-9_-]*/[REDACTED]/g'
echo

echo "==> models"
curl -fsS --max-time 10 "${BASE_URL}/v1/models" | head -c 2000
echo

if [ -z "${TOKEN}" ]; then
  echo "No user API key provided. Skip authenticated /v1/messages tests."
  exit 0
fi

echo "==> messages non-stream"
curl -fsS --max-time 60 "${BASE_URL}/v1/messages" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cc-gpt-haiku",
    "max_tokens": 64,
    "messages": [{"role": "user", "content": "请只回复：Claude Gateway 测试成功"}]
  }' | sed 's/sk-[A-Za-z0-9_-]*/[REDACTED]/g'
echo

echo "==> messages stream"
curl -fsS --max-time 60 -N "${BASE_URL}/v1/messages" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cc-gpt-haiku",
    "max_tokens": 64,
    "stream": true,
    "messages": [{"role": "user", "content": "用一句话说明什么是 Claude Code 兼容网关"}]
  }' | head -80 | sed 's/sk-[A-Za-z0-9_-]*/[REDACTED]/g'
