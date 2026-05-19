#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://voice-api.shenxiang.school}"
API_KEY="${VOICE_GATEWAY_API_KEY:-}"

if [ -z "$API_KEY" ]; then
  echo "VOICE_GATEWAY_API_KEY is required" >&2
  exit 1
fi

echo "Checking health..."
curl -fsS "$BASE_URL/healthz" | jq .

echo "Checking OpenAPI..."
curl -fsS "$BASE_URL/openapi.json" >/tmp/voice-openapi.json
jq -e '.paths["/v1/tts"].post.operationId == "createTTS"' /tmp/voice-openapi.json >/dev/null

echo "Creating sync TTS..."
RESP="$(curl -fsS -X POST "$BASE_URL/v1/tts" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"你好，这是一段沈翔智学 AI 老师语音讲评测试。","voice_id":"teacher_female_01","sync":true}')"
echo "$RESP" | jq .

AUDIO_URL="$(echo "$RESP" | jq -r '.audio_url')"
if [ -z "$AUDIO_URL" ] || [ "$AUDIO_URL" = "null" ]; then
  echo "Missing audio_url" >&2
  exit 1
fi

echo "Checking audio URL..."
curl -fsSI "$AUDIO_URL"

echo "Smoke test passed."

