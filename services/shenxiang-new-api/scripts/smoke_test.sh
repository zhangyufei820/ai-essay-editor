#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/shenxiang-new-api}"
ADMIN_SYSTEM_TOKEN_USER_ID="1"
TOKEN_PROFILE="${TOKEN_PROFILE:-codex}"
REQUEST_MODE="${REQUEST_MODE:-models}"

usage() {
  cat <<'EOF'
Usage:
  smoke_test.sh [--profile codex|image|claude|video] [--mode models|chat]

System smoke tests must use an admin-owned token only. This script never
accepts a raw API key argument; it resolves a token from MySQL where user_id=1.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --profile)
      TOKEN_PROFILE="${2:-}"
      shift 2
      ;;
    --mode)
      REQUEST_MODE="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: raw API keys or unknown arguments are not accepted: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$TOKEN_PROFILE" in
  codex) TOKEN_NAME="星人 Codex 文本令牌"; MODEL="gpt-5.5" ;;
  image) TOKEN_NAME="星人图像生成令牌"; MODEL="gpt-image-2-4K" ;;
  claude) TOKEN_NAME="星人 Claude 高阶令牌"; MODEL="claude-sonnet-4-6" ;;
  video) TOKEN_NAME="星人视频生成令牌"; MODEL="seedance-2.0-cl-mini" ;;
  *)
    echo "ERROR: unsupported token profile: ${TOKEN_PROFILE}" >&2
    usage >&2
    exit 2
    ;;
esac

case "$REQUEST_MODE" in
  models|chat) ;;
  *)
    echo "ERROR: unsupported mode: ${REQUEST_MODE}" >&2
    usage >&2
    exit 2
    ;;
esac

cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "ERROR: ${APP_DIR}/.env not found" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. "$APP_DIR/.env"
set +a

HOST_BIND_PORT="${HOST_BIND_PORT:-3120}"
LOCAL_BASE="http://127.0.0.1:${HOST_BIND_PORT}"
PUBLIC_BASE="${PUBLIC_API_BASE_URL:-${LOCAL_BASE}}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-shenxiang-new-api-mysql}"

echo "Testing local address: ${LOCAL_BASE}"
curl -fsSI "$LOCAL_BASE" | sed -n '1,20p'

echo "Resolving admin system token: user_id=${ADMIN_SYSTEM_TOKEN_USER_ID}, name=${TOKEN_NAME}"
token_row="$(
  docker exec -i "$MYSQL_CONTAINER" sh -lc 'mysql --default-character-set=utf8mb4 --batch --raw --skip-column-names -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' <<SQL
SET NAMES utf8mb4;
SELECT id, user_id, status, CASE WHEN \`key\` LIKE 'sk-%' THEN \`key\` ELSE CONCAT('sk-', \`key\`) END
FROM tokens
WHERE deleted_at IS NULL
  AND user_id = ${ADMIN_SYSTEM_TOKEN_USER_ID}
  AND name = '${TOKEN_NAME}'
  AND status = 1
ORDER BY id ASC
LIMIT 1;
SQL
)"

if [ -z "$token_row" ]; then
  echo "ERROR: enabled admin system token not found for profile=${TOKEN_PROFILE}" >&2
  exit 1
fi

IFS=$'\t' read -r token_id token_user_id token_status api_key <<EOF
$token_row
EOF

if [ "$token_user_id" != "$ADMIN_SYSTEM_TOKEN_USER_ID" ] || [ "$token_status" != "1" ]; then
  echo "ERROR: resolved token is not an enabled admin token (token_id=${token_id}, user_id=${token_user_id}, status=${token_status})" >&2
  exit 1
fi

echo "Using admin token metadata only: token_id=${token_id}, user_id=${token_user_id}, profile=${TOKEN_PROFILE}"

curl_with_admin_auth() {
  local url="$1"
  shift
  curl -fsS --config - "$@" "$url" <<EOF
header = "Authorization: Bearer ${api_key}"
EOF
}

case "$REQUEST_MODE" in
  models)
    echo "Testing /v1/models"
    curl_with_admin_auth "${PUBLIC_BASE%/}/v1/models" | sed -n '1,80p'
    ;;
  chat)
    if [ "$TOKEN_PROFILE" != "codex" ]; then
      echo "ERROR: --mode chat is only allowed with --profile codex" >&2
      exit 2
    fi
    echo "Testing /v1/chat/completions with admin token"
    curl_with_admin_auth "${PUBLIC_BASE%/}/v1/chat/completions" \
      -H "Content-Type: application/json" \
      -H "User-Agent: shenxiang-admin-smoke/20260704" \
      -d '{
        "model": "'"${MODEL}"'",
        "messages": [
          {"role": "user", "content": "Reply with OK only."}
        ],
        "stream": false,
        "max_tokens": 4
      }' | sed -n '1,120p'
    ;;
esac
