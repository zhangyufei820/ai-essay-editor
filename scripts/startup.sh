#!/bin/bash
#
# AI Essay Editor 启动脚本
# 自动处理 nginx/OpenResty 端口冲突问题
#

set -e

PROJECT_DIR="/data/ai-essay-editor"
LOG_FILE="/tmp/ai-essay-editor.log"

echo "========================================" | tee -a $LOG_FILE
echo "AI Essay Editor 启动脚本 $(date)" | tee -a $LOG_FILE
echo "========================================" | tee -a $LOG_FILE

# 1. 杀掉占用 3000 端口的旧进程
echo "[1/5] 清理 3000 端口..." | tee -a $LOG_FILE
fuser -k 3000/tcp 2>/dev/null || true
sleep 1

# 2. 确保 OpenResty 配置目录存在 shenxiang.conf
echo "[2/5] 检查 OpenResty 配置..." | tee -a $LOG_FILE
OPENRESTY_CONF_DIR="/usr/local/openresty/nginx/conf/conf.d"
NGINX_CONF="/etc/nginx/sites-enabled/shenxiang.conf"

if [ -f "$NGINX_CONF" ] && [ ! -f "$OPENRESTY_CONF_DIR/shenxiang.conf" ]; then
    echo "  复制 shenxiang.conf 到 OpenResty 配置目录..." | tee -a $LOG_FILE
    mkdir -p "$OPENRESTY_CONF_DIR"
    cp "$NGINX_CONF" "$OPENRESTY_CONF_DIR/"
fi

# 3. 杀掉抢占 443 端口的 nginx 进程（保留 OpenResty）
echo "[3/5] 检查 nginx 进程冲突..." | tee -a $LOG_FILE
NGINX_PIDS=$(ss -tlnp | grep ":443" | grep -oP 'pid=\K[0-9]+' | sort -u)
OPENRESTY_PIDS=$(ps aux | grep "openresty" | grep "master" | grep -oP '^\S+\s+\K[0-9]+')

for pid in $NGINX_PIDS; do
    # 如果这个 PID 不在 OpenResty master pid 列表里，杀掉它
    if [[ ! " $OPENRESTY_PIDS " =~ " $pid " ]]; then
        echo "  杀掉抢占端口的 nginx 进程: $pid" | tee -a $LOG_FILE
        kill $pid 2>/dev/null || true
    fi
done

# 如果还有 nginx master 进程在跑，杀掉它们
ps aux | grep "nginx: master process nginx" | grep -v grep | awk '{print $2' | xargs -r kill 2>/dev/null || true

sleep 1

# 4. 确保 OpenResty 已启动
echo "[4/5] 检查 OpenResty 状态..." | tee -a $LOG_FILE
if ! pgrep -f "openresty.*master" > /dev/null; then
    echo "  启动 OpenResty..." | tee -a $LOG_FILE
    /usr/local/openresty/bin/openresty -g "daemon off;" &
    sleep 2
fi

# 验证 443 端口被 OpenResty 监听
if ss -tlnp | grep ":443" | grep -q "openresty"; then
    echo "  ✓ 443 端口已被 OpenResty 监听" | tee -a $LOG_FILE
else
    echo "  ✗ 警告: 443 端口可能未被正确监听" | tee -a $LOG_FILE
fi

# 5. 启动 Next.js
echo "[5/5] 启动 Next.js..." | tee -a $LOG_FILE
cd $PROJECT_DIR

# 使用 nohup 后台运行
nohup node .next/standalone/server.js > $LOG_FILE 2>&1 &
NEXT_PID=$!

sleep 2

if ps -p $NEXT_PID > /dev/null 2>&1; then
    echo "  ✓ Next.js 已启动 (PID: $NEXT_PID)" | tee -a $LOG_FILE
else
    echo "  ✗ Next.js 启动失败，请检查日志: $LOG_FILE" | tee -a $LOG_FILE
    exit 1
fi

# 验证
sleep 1
if ss -tlnp | grep -q ":3000.*next-server"; then
    echo "  ✓ 3000 端口已被 Next.js 监听" | tee -a $LOG_FILE
else
    echo "  ✗ 警告: 3000 端口可能未被正确监听" | tee -a $LOG_FILE
fi

echo "" | tee -a $LOG_FILE
echo "========================================" | tee -a $LOG_FILE
echo "启动完成!" | tee -a $LOG_FILE
echo "访问 https://www.shenxiang.school" | tee -a $LOG_FILE
echo "日志文件: $LOG_FILE" | tee -a $LOG_FILE
echo "========================================" | tee -a $LOG_FILE
