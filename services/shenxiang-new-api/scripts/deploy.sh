#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/shenxiang-new-api}"
# shellcheck source=common.sh
. "${APP_DIR}/scripts/common.sh"

cd "$APP_DIR"

./scripts/preflight.sh
load_env
require_local_bind

info "生成 nginx/shenxiang-new-api.conf（仅供人工接入，不自动 reload）"
sed \
  -e "s|\${PUBLIC_API_DOMAIN}|${PUBLIC_API_DOMAIN}|g" \
  -e "s|\${HOST_BIND_PORT}|${HOST_BIND_PORT:-3120}|g" \
  nginx/shenxiang-new-api.conf.template > nginx/shenxiang-new-api.conf

info "拉取镜像"
compose_cmd pull

info "启动 shenxiang-new-api 独立栈"
compose_cmd up -d

info "容器状态"
compose_cmd ps

info "等待 MySQL / Redis / New API 启动"
for service in shenxiang-new-api-mysql shenxiang-new-api-redis shenxiang-new-api; do
  echo "等待 ${service} ..."
  for _ in $(seq 1 60); do
    state="$(docker inspect -f '{{.State.Status}}' "$service" 2>/dev/null || true)"
    health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$service" 2>/dev/null || true)"
    if [ "$state" = "running" ] && { [ "$health" = "healthy" ] || [ "$health" = "none" ]; }; then
      echo "${service}: ${state}/${health}"
      break
    fi
    sleep 2
  done
done

info "本机访问测试"
curl -fsSI "http://127.0.0.1:${HOST_BIND_PORT}" | sed -n '1,20p'

info "检查关键入口守卫"
python3 "${APP_DIR}/scripts/ensure_codex_entry.py" --check-source --sync-db --check-url "http://127.0.0.1:${HOST_BIND_PORT}" --strict

info "检查媒体工坊运行时防漂移守卫"
if ! command -v node >/dev/null 2>&1; then
  die "Node.js 不可用，无法执行媒体工坊运行时防漂移守卫"
fi
node "${APP_DIR}/scripts/check-media-playground-runtime.mjs" \
  --base-url "http://127.0.0.1:${HOST_BIND_PORT}" \
  --mysql-container shenxiang-new-api-mysql

info "下一步"
cat <<EOF
1. 配置 DNS：将 ${PUBLIC_API_DOMAIN} A 记录指向当前服务器公网 IP。
2. 人工审核 nginx/shenxiang-new-api.conf 后，将其接入现有 OpenResty/Nginx。
3. 访问 ${PUBLIC_API_BASE_URL} 初始化 New API 管理员账号。
4. 在 New API 后台添加上游渠道和模型，不要把上游 API Key 写入文件或日志。
EOF
