#!/bin/bash
# ============================================
# 🚀 蓝绿部署脚本 - 沈翔智学
# ============================================
# 实现零停机部署，通过蓝绿切换实现无缝更新
# 
# 使用方法:
#   ./scripts/deploy-blue-green.sh [新镜像标签]
#
# 示例:
#   ./scripts/deploy-blue-green.sh v1.2.3
#   ./scripts/deploy-blue-green.sh latest
#
# 前提条件:
#   - Docker 已安装并运行
#   - 当前目录为项目根目录
#   - 已配置 docker-compose.yml

set -e  # 出错立即退出

# ============================================
# 配置区域
# ============================================

# 项目名称
PROJECT_NAME="ai-essay-editor"

# 蓝绿容器配置
BLUE_PORT=3001
GREEN_PORT=3002

# 健康检查配置
HEALTH_CHECK_URL="http://localhost:"
HEALTH_CHECK_PATH="/api/health"
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_INTERVAL=2

# 日志文件
LOG_FILE="/tmp/deploy-blue-green.log"

# ============================================
# 颜色输出
# ============================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[✓]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[!]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[✗]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

# ============================================
# 检查当前运行状态
# ============================================

check_current_status() {
    log "检查当前部署状态..."
    
    # 检查蓝容器状态
    if docker ps --format "{{.Names}}" | grep -q "${PROJECT_NAME}-blue"; then
        CURRENT_COLOR="blue"
        CURRENT_PORT=$BLUE_PORT
        NEW_COLOR="green"
        NEW_PORT=$GREEN_PORT
        success "当前运行: 蓝容器 (端口: $BLUE_PORT)"
    elif docker ps --format "{{.Names}}" | grep -q "${PROJECT_NAME}-green"; then
        CURRENT_COLOR="green"
        CURRENT_PORT=$GREEN_PORT
        NEW_COLOR="blue"
        NEW_PORT=$BLUE_PORT
        success "当前运行: 绿容器 (端口: $GREEN_PORT)"
    else
        CURRENT_COLOR="none"
        NEW_COLOR="blue"
        NEW_PORT=$BLUE_PORT
        warning "未检测到运行中的容器，将启动蓝色容器"
    fi
}

# ============================================
# 构建新镜像
# ============================================

build_new_image() {
    local TAG=$1
    log "开始构建新镜像: ${PROJECT_NAME}:${TAG}..."
    
    # 构建镜像
    docker build -t "${PROJECT_NAME}:${TAG}" . || error "镜像构建失败"
    
    # 同时打上 latest 标签
    docker tag "${PROJECT_NAME}:${TAG}" "${PROJECT_NAME}:latest"
    
    success "新镜像构建完成: ${PROJECT_NAME}:${TAG}"
}

# ============================================
# 启动新容器
# ============================================

start_new_container() {
    local TAG=$1
    local NEW_CONTAINER="${PROJECT_NAME}-${NEW_COLOR}"
    
    log "启动新容器: ${NEW_CONTAINER} (端口: ${NEW_PORT})..."
    
    # 停止同颜色的旧容器（如果存在）
    if docker ps -a --format "{{.Names}}" | grep -q "${NEW_CONTAINER}"; then
        warning "发现旧的 ${NEW_COLOR} 容器，正在停止..."
        docker stop "${NEW_CONTAINER}" 2>/dev/null || true
        docker rm "${NEW_CONTAINER}" 2>/dev/null || true
    fi
    
    # 启动新容器
    docker run -d \
        --name "${NEW_CONTAINER}" \
        --restart unless-stopped \
        -p "${NEW_PORT}:3000" \
        -e NODE_ENV=production \
        -e PORT=3000 \
        --env-file .env.production \
        --health-cmd="curl -f http://localhost:3000/api/health || exit 1" \
        --health-interval=10s \
        --health-timeout=5s \
        --health-retries=3 \
        "${PROJECT_NAME}:${TAG}" || error "新容器启动失败"
    
    success "新容器已启动: ${NEW_CONTAINER}"
}

# ============================================
# 健康检查
# ============================================

health_check() {
    local CONTAINER=$1
    local PORT=$2
    
    log "开始健康检查: ${CONTAINER} (端口: ${PORT})..."
    
    for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
        # 检查容器是否在运行
        if ! docker ps --format "{{.Names}}" | grep -q "${CONTAINER}"; then
            warning "容器 ${CONTAINER} 已停止，等待重启..."
            sleep $HEALTH_CHECK_INTERVAL
            continue
        fi
        
        # 检查 HTTP 健康端点
        if curl -f -s -m 5 "${HEALTH_CHECK_URL}${PORT}${HEALTH_CHECK_PATH}" > /dev/null 2>&1; then
            success "健康检查通过 (尝试 ${i}/${HEALTH_CHECK_RETRIES})"
            return 0
        fi
        
        log "健康检查中... (${i}/${HEALTH_CHECK_RETRIES})"
        sleep $HEALTH_CHECK_INTERVAL
    done
    
    error "健康检查失败: ${CONTAINER} 未通过健康检查"
}

# ============================================
# 切换流量
# ============================================

switch_traffic() {
    local PORT=$1
    
    log "准备切换流量到端口 ${PORT}..."
    
    # 这里根据实际部署方式切换流量
    # 方式1: 如果使用 Nginx 反向代理
    if [ -f "/etc/nginx/conf.d/${PROJECT_NAME}.conf" ]; then
        log "检测到 Nginx 配置，正在更新代理端口..."
        sed -i "s/proxy_pass http:\/\/localhost:[0-9]*/proxy_pass http:\/\/localhost:${PORT}/" "/etc/nginx/conf.d/${PROJECT_NAME}.conf"
        nginx -s reload
        success "Nginx 已更新代理到端口 ${PORT}"
    
    # 方式2: 如果使用 Docker 端口映射（需要重启容器）
    else
        warning "未检测到 Nginx 配置"
        log "请手动配置反向代理或负载均衡器指向端口 ${PORT}"
    fi
}

# ============================================
# 停止旧容器
# ============================================

stop_old_container() {
    local COLOR=$1
    
    if [ "$COLOR" = "none" ]; then
        return
    fi
    
    local OLD_CONTAINER="${PROJECT_NAME}-${COLOR}"
    
    log "停止旧容器: ${OLD_CONTAINER}..."
    
    if docker ps --format "{{.Names}}" | grep -q "${OLD_CONTAINER}"; then
        docker stop "${OLD_CONTAINER}"
        docker rm "${OLD_CONTAINER}"
        success "旧容器已停止并移除: ${OLD_CONTAINER}"
    else
        warning "旧容器 ${OLD_CONTAINER} 不存在或已停止"
    fi
}

# ============================================
# 清理旧镜像
# ============================================

cleanup_old_images() {
    log "清理旧镜像..."
    
    # 保留最近 3 个镜像
    docker images "${PROJECT_NAME}" --format "{{.Tag}}" | grep -v "latest" | tail -n +4 | while read TAG; do
        log "删除旧镜像: ${PROJECT_NAME}:${TAG}"
        docker rmi "${PROJECT_NAME}:${TAG}" 2>/dev/null || true
    done
    
    # 清理悬空镜像
    docker image prune -f > /dev/null 2>&1 || true
    
    success "旧镜像清理完成"
}

# ============================================
# 回滚函数
# ============================================

rollback() {
    error "部署失败，正在回滚..."
    
    # 停止失败的新容器
    docker stop "${PROJECT_NAME}-${NEW_COLOR}" 2>/dev/null || true
    docker rm "${PROJECT_NAME}-${NEW_COLOR}" 2>/dev/null || true
    
    # 确保旧容器仍在运行
    if [ "$CURRENT_COLOR" != "none" ]; then
        docker start "${PROJECT_NAME}-${CURRENT_COLOR}" 2>/dev/null || true
        switch_traffic $CURRENT_PORT
    fi
    
    error "回滚完成，系统已恢复到部署前状态"
}

# ============================================
# 主函数
# ============================================

main() {
    local TAG=${1:-"latest"}
    
    log "=========================================="
    log "🚀 开始蓝绿部署: ${PROJECT_NAME} (${TAG})"
    log "=========================================="
    
    # 检查当前状态
    check_current_status
    
    # 构建新镜像
    build_new_image "$TAG"
    
    # 启动新容器
    start_new_container "$TAG"
    
    # 健康检查（失败时自动回滚）
    trap rollback ERR
    health_check "${PROJECT_NAME}-${NEW_COLOR}" "$NEW_PORT"
    
    # 切换流量
    switch_traffic "$NEW_PORT"
    
    # 等待流量切换完成
    log "等待流量切换完成..."
    sleep 5
    
    # 停止旧容器
    stop_old_container "$CURRENT_COLOR"
    
    # 清理旧镜像
    cleanup_old_images
    
    # 取消错误陷阱
    trap - ERR
    
    log "=========================================="
    success "🎉 部署完成！"
    log "  - 新版本: ${PROJECT_NAME}:${TAG}"
    log "  - 运行端口: ${NEW_PORT}"
    log "  - 运行颜色: ${NEW_COLOR}"
    log "=========================================="
}

# ============================================
# 执行
# ============================================

# 检查参数
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "用法: $0 [镜像标签]"
    echo ""
    echo "示例:"
    echo "  $0 v1.2.3    # 部署指定版本"
    echo "  $0 latest    # 部署最新版本"
    echo ""
    echo "环境变量:"
    echo "  BLUE_PORT=3001     # 蓝容器端口"
    echo "  GREEN_PORT=3002    # 绿容器端口"
    exit 0
fi

# 执行主函数
main "$1"