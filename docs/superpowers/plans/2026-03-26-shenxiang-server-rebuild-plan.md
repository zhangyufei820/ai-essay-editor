# 沈翔智学服务器重建项目计划书

**创建日期**: 2026-03-26
**状态**: 待审核
**版本**: v1.6
**预计工期**: 2-3 天

---

## 紧急概述

后端服务器数据全丢，需要从服务器格式化开始重建整个基础设施。

---

## ⚠️ 重要决策：Supabase 全云服务

**决策**: Supabase 保持全云服务，不在本地部署 PostgreSQL

### 架构说明

```
┌─────────────────────────────────────────────────────┐
│  Supabase 云端 (全部)                                │
│  ├── Auth (用户认证)                                 │
│  ├── Database (积分/交易/对话数据)                   │
│  └── Storage (保留，用完容量需付费)                  │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│  香港服务器 (简化部署)                                │
│  ├── Nginx (反向代理 + SSL)                         │
│  ├── Next.js (前端应用)                             │
│  ├── Dify (AI 服务)                                 │
│  ├── Redis (缓存)                                   │
│  └── MinIO (文件存储，替代 Supabase Storage)         │
└─────────────────────────────────────────────────────┘
```

### 原因
1. **数据在云端安全**: Supabase 有完善的数据备份和灾备
2. **无需数据迁移**: 服务器崩了但云端数据没丢
3. **工期缩短**: 减少 1.5 天部署和迁移时间
4. **Auth + Database 都在云端**: 免费额度够用

### Supabase 免费版限制

| 指标 | 免费版额度 | 说明 |
|------|-----------|------|
| 月活用户 (MAU) | 50,000 | 1-2 年无压力 |
| 数据库存储 | 500 MB | 超出 $0.125/GB/月 |
| 文件存储 | 1 GB | 超出 $0.021/GB/月 |

### 本地部署服务

| 服务 | 用途 | 端口 |
|------|------|------|
| Nginx | 反向代理 + SSL终结 | 443 |
| Next.js | 前端应用 | 3000 |
| Dify | AI 对话服务 | 8080 |
| Redis | 缓存加速 | 6379 |
| MinIO | 文件存储 | 9000/9001 |

---

## 阶段一：服务器初始化 (Day 1)

### 1.1 服务器系统准备

| 步骤 | 命令/操作 | 预计时间 |
|------|-----------|----------|
| 1. 格式化服务器重装 Ubuntu 24.04 LTS | 控制台操作 | 10分钟 |
| 2. 更新系统 | `apt update && apt upgrade -y` | 5分钟 |
| 3. 安装基础工具 | `apt install -y curl wget git vim htop net-tools` | 3分钟 |
| 4. 配置 SSH 密钥登录 | `~/.ssh/authorized_keys` | 5分钟 |
| 5. 设置防火墙 | `ufw allow 22 && ufw allow 80 && ufw allow 443` | 2分钟 |
| 6. 配置 DNS (api.shenxiang.school → 服务器IP) | DNS控制台 | 5分钟 |

### 1.2 磁盘分区 (可选，如需数据盘)

```bash
# 查看磁盘
lsblk

# 假设 /dev/vdb 是数据盘
mkfs.ext4 -F /dev/vdb
mkdir -p /data
mount /dev/vdb /data

# 添加到 fstab 永久挂载
echo '/dev/vdb /data ext4 defaults 0 0' >> /etc/fstab
```

---

## 阶段二：1Panel 面板安装 (Day 1)

### 2.1 安装 1Panel

```bash
# 命令行安装 (Ubuntu 24.04)
curl -sSL https://resource.fit2cloud.com/1panel/package/quick_start.sh -o quick_start.sh && bash quick_start.sh
```

### 2.2 1Panel 初始配置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 端口 | 20241 | 更改默认端口 |
| 用户名 | admin | 建议使用复杂密码 |
| 密码 | [复杂密码] | 记录到密码管理器 |
| 网站目录 | /www/sites | 推荐目录 |

### 2.3 放通端口 (1Panel 控制台)

| 端口 | 协议 | 用途 |
|------|------|------|
| 80 | TCP | HTTP |
| 443 | TCP | HTTPS |
| 20241 | TCP | 1Panel 管理面板 |
| 22 | TCP | SSH |

---

## 阶段三：Docker 环境 (Day 1)

### 3.1 安装 Docker

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh

# 启动 Docker
systemctl start docker
systemctl enable docker

# 安装 Docker Compose (独立)
curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# 验证安装
docker --version
docker-compose --version
```

### 3.2 Docker 配置 (镜像加速 + 日志 + 存储驱动)

```bash
# 创建 Docker 配置目录
mkdir -p /etc/docker

# 编辑 daemon.json (合并镜像加速、日志轮转、存储驱动)
cat > /etc/docker/daemon.json << 'EOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  },
  "storage-driver": "overlay2"
}
EOF

# 重启 Docker
systemctl daemon-reload
systemctl restart docker
```

### 3.3 创建 Docker 网络

**⚠️ 关键：必须创建桥接网络实现容器间内网通信**

```bash
# 创建桥接网络
docker network create shenxiang-net --driver bridge

# 验证
docker network ls | grep shenxiang-net
```

---

## 阶段四：SSL 证书申请 (Day 1)

### 4.1 使用 Let's Encrypt 免费证书

```bash
# 安装 Certbot
apt install -y certbot python3-certbot-nginx

# 申请证书 (Nginx 插件)
certbot --nginx -d api.shenxiang.school --agree-tos --email 82096066@qq.com --non-interactive

# 自动续期测试
certbot renew --dry-run
```

### 4.2 证书存放位置

```bash
# 证书路径 (用于 Nginx 配置)
FULLCHAIN=/etc/letsencrypt/live/api.shenxiang.school/fullchain.pem
PRIVKEY=/etc/letsencrypt/live/api.shenxiang.school/privkey.pem
```

---

## 阶段五：Redis 部署 (Day 2)

### 5.1 Docker 方式部署 Redis

```bash
# 创建配置目录
mkdir -p /data/redis

# 创建 redis.conf
cat > /data/redis/redis.conf << 'EOF'
# 绑定本地接口，仅内网访问
bind 127.0.0.1
requirepass [Redis密码]
appendonly yes
appendfsync everysec
maxmemory 256mb
maxmemory-policy allkeys-lru
EOF

# 启动 Redis (加入网络)
docker run -d \
  --name shenxiang-redis \
  --restart unless-stopped \
  -v /data/redis/redis.conf:/usr/local/etc/redis/redis.conf \
  -v /data/redis/data:/data \
  --network shenxiang-net \
  -p 127.0.0.1:6379:6379 \
  redis:7-alpine \
  redis-server /usr/local/etc/redis/redis.conf
```

### 5.2 验证 Redis

```bash
# 测试连接
docker exec -it shenxiang-redis redis-cli -a [Redis密码] ping
```

---

## 阶段六：Dify 部署 (Day 2-3)

### 6.1 拉取 Dify

```bash
# 创建目录
mkdir -p /data/dify
cd /data/dify

# 克隆 Dify 仓库
git clone https://github.com/langgenius/dify.git .
git checkout 0.3.36  # 使用稳定版本 (Dify 0.3.x 系列)
```

### 6.2 Dify Docker Compose 配置

**⚠️ 关键：使用 Supabase PostgreSQL 作为 Dify 数据库**

```bash
# 创建 .env 文件
cat > /data/dify/docker/.env << 'EOF'
# 密钥
SECRET_KEY=[Dify密钥,至少32字符]

# 管理账户
INIT_ADMIN_EMAIL=admin@shenxiang.school
INIT_ADMIN_PASSWORD=[Dify管理员密码]

# Supabase PostgreSQL (云端)
DB_HOST=[YOUR_PROJECT_REF].supabase.co
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=[Supabase数据库密码]
DB_DATABASE=postgres

# Redis (使用容器网络名称)
REDIS_HOST=shenxiang-redis
REDIS_PORT=6379
REDIS_PASSWORD=[Redis密码]

# API 配置
MODE=api
PORT=8080
EOF
```

### 6.3 修改 docker-compose.yaml

编辑 `/data/dify/docker/docker-compose.yaml`，只保留 api 服务：

```yaml
services:
  api:
    image: dify/dify-api:0.3.36
    container_name: shenxiang-dify
    environment:
      - SECRET_KEY=${SECRET_KEY}
      - INIT_ADMIN_EMAIL=${INIT_ADMIN_EMAIL}
      - INIT_ADMIN_PASSWORD=${INIT_ADMIN_PASSWORD}
      - DB_HOST=${DB_HOST}
      - DB_PORT=${DB_PORT}
      - DB_USERNAME=${DB_USERNAME}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_DATABASE=${DB_DATABASE}
      - REDIS_HOST=${REDIS_HOST}
      - REDIS_PORT=${REDIS_PORT}
      - REDIS_PASSWORD=${REDIS_PASSWORD}
    networks:
      - shenxiang-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:8080/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  shenxiang-net:
    external: true
```

### 6.4 启动 Dify

```bash
cd /data/dify/docker

# 拉取镜像
docker-compose pull

# 启动服务 (只启动 api)
docker-compose up -d api

# 查看日志
docker-compose logs -f api
```

### 6.5 验证 Dify

```bash
# 健康检查
curl http://localhost:8080/health

# 查看状态
curl http://localhost:8080/operations/status
```

---

## 阶段七：MinIO 对象存储部署 (Day 3)

**⚠️ MinIO 用于文件存储，替代 Supabase Storage（解决 4.5MB 限制）**

### 7.1 MinIO 部署

```bash
# 创建目录
mkdir -p /data/minio/data

# 启动 MinIO (加入网络)
docker run -d \
  --name shenxiang-minio \
  --restart unless-stopped \
  -e MINIO_ROOT_USER=shenxiang \
  -e MINIO_ROOT_PASSWORD=[复杂密码，至少8位] \
  -e MINIO_DEFAULT_BUCKET=shenxiang-uploads \
  -e MINIO_PUBLIC_CDN_URL=http://localhost:9000 \
  -v /data/minio/data:/data \
  --network shenxiang-net \
  -p 127.0.0.1:9000:9000 \
  -p 127.0.0.1:9001:9001 \
  minio/minio:RELEASE.2024-01-16T16-59-58Z \
  server /data --console-address ":9001"
```

### 7.2 创建存储桶和策略

```bash
# 安装 mc 客户端
docker exec -i shenxiang-minio apt-get update && apt-get install -y mc

# 配置 mc 连接到本机 MinIO
docker exec -i shenxiang-minio mc alias set myminio http://localhost:9000 shenxiang [密码]

# 创建存储桶
docker exec -i shenxiang-minio mc mb myminio/shenxiang-uploads

# 设置存储桶为公开读取（用于提供文件访问URL）
docker exec -i shenxiang-minio mc anonymous set download myminio/shenxiang-uploads

# 设置存储桶策略 - 允许带签名的上传请求
docker exec -i shenxiang-minio mc anonymous set upload myminio/shenxiang-uploads
```

### 7.3 验证 MinIO

```bash
# 测试健康检查
curl http://localhost:9000/minio/health/live

# 查看存储桶
docker exec -it shenxiang-minio mc ls myminio/

# 访问 Console (浏览器打开)
# http://服务器IP:9001
```

---

## 阶段八：Next.js 部署 (Day 3-4)

### 8.1 前置准备

```bash
# 创建目录
mkdir -p /data/nextjs

# 克隆代码
cd /data/nextjs
git clone [你的仓库地址] .
git checkout main
```

### 8.2 创建 .env 文件

```bash
cat > /data/nextjs/.env << 'EOF'
# Supabase (全云服务)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# MinIO 对象存储 (S3兼容)
MINIO_ENDPOINT=shenxiang-minio:9000
MINIO_ACCESS_KEY=shenxiang
MINIO_SECRET_KEY=[密码]
MINIO_BUCKET=shenxiang-uploads
NEXT_PUBLIC_MINIO_URL=http://shenxiang-minio:9000

# Dify (使用容器网络名称)
DIFY_INTERNAL_URL=http://shenxiang-dify:8080/v1
DIFY_BASE_URL=https://api.dify.ai/v1

# API Base
NEXT_PUBLIC_API_BASE_URL=https://api.shenxiang.school
EOF
```

### 8.3 创建 health 端点

**⚠️ 关键：必须添加 /health 端点用于健康检查**

```typescript
// app/api/health/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() })
}
```

### 8.4 构建 Docker 镜像

```bash
cd /data/nextjs

# 构建镜像
docker build -t shenxiang-nextjs:latest .

# 或者使用 docker-compose
docker-compose build
docker-compose up -d
```

### 8.5 创建 Next.js docker-compose.yml

```yaml
# docker-compose.yml
version: '3.8'

services:
  nextjs:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: shenxiang-nextjs
    environment:
      - NODE_ENV=production
      - DIFY_INTERNAL_URL=http://shenxiang-dify:8080/v1
      - NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - MINIO_ENDPOINT=${MINIO_ENDPOINT}
      - MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}
      - MINIO_SECRET_KEY=${MINIO_SECRET_KEY}
      - MINIO_BUCKET=${MINIO_BUCKET}
      - NEXT_PUBLIC_MINIO_URL=${MINIO_URL}
    networks:
      - shenxiang-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  shenxiang-net:
    external: true
```

### 8.6 验证 Next.js

```bash
# 测试健康检查
curl http://localhost:3000/health

# 查看日志
docker-compose logs -f nextjs
```

### 8.7 配置自动部署 (Webhook)

**目标**: VS Code 改代码 → git push → 服务器自动拉取、构建、重启

#### 8.7.1 创建部署脚本

```bash
# 创建目录
mkdir -p /data/nextjs/webhook

# 创建自动部署脚本
cat > /data/nextjs/webhook/deploy.sh << 'EOF'
#!/bin/bash

PROJECT_DIR="/data/nextjs"
CONTAINER_NAME="shenxiang-nextjs"

echo "========== $(date) =========="
echo "[INFO] Starting auto-deployment..."

# 1. 停止旧容器
docker stop $CONTAINER_NAME 2>/dev/null
docker rm $CONTAINER_NAME 2>/dev/null

# 2. 拉取最新代码
cd $PROJECT_DIR
git fetch origin main
git reset --hard origin/main

# 3. 重新构建 Docker 镜像
docker build -t shenxiang-nextjs:latest .

# 4. 重新启动容器
docker run -d \
  --name $CONTAINER_NAME \
  --restart unless-stopped \
  --network shenxiang-net \
  -p 127.0.0.1:3000:3000 \
  -v $(pwd)/.env:/app/.env:ro \
  shenxiang-nextjs:latest

# 5. 验证
sleep 3
if docker ps | grep -q $CONTAINER_NAME; then
  echo "[OK] Deployment successful!"
else
  echo "[FAIL] Deployment failed!"
  docker logs $CONTAINER_NAME
fi
EOF

chmod +x /data/nextjs/webhook/deploy.sh
```

#### 8.7.2 创建 Webhook 接收服务

**⚠️ 重要: 必须设置 GITHUB_WEBHOOK_SECRET 环境变量，否则服务无法启动!**

```bash
# 创建 webhook 服务
cat > /data/nextjs/webhook/server.js << 'EOF'
const http = require('http');
const { exec } = require('child_process');
const crypto = require('crypto');

const SECRET = process.env.GITHUB_WEBHOOK_SECRET;
if (!SECRET) {
  console.error('[FAIL] GITHUB_WEBHOOK_SECRET environment variable not set');
  process.exit(1);
}
const PORT = 3001;

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      // 验证 GitHub 签名
      const signature = req.headers['x-hub-signature-256'] || '';
      const hmac = crypto.createHmac('sha256', SECRET);
      hmac.update(body);
      const digest = 'sha256=' + hmac.digest('hex');

      if (signature !== digest) {
        console.log('[FAIL] Signature verification failed');
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      console.log('[OK] Webhook received, starting deployment...');
      exec('/data/nextjs/webhook/deploy.sh', (err, stdout, stderr) => {
        if (err) {
          console.error('[FAIL] Deployment failed:', err);
          res.writeHead(500);
          res.end('Deploy failed');
          return;
        }
        console.log(stdout);
        res.writeHead(200);
        res.end('OK');
      });
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log('[OK] Webhook service started on port ' + PORT);
});
EOF
```

#### 8.7.3 启动 Webhook 服务

**⚠️ 重要:**
1. **必须安装 Node.js 18+ 版本**，不要使用默认 apt 源的旧版本!
2. **必须设置 GITHUB_WEBHOOK_SECRET 环境变量** (强密码，不能使用默认值!)

```bash
# 安装 Node.js 18.x (必须使用 NodeSource 仓库)
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# 验证 Node 版本
node --version  # 应显示 v18.x.x

# 创建 webhook systemd 服务
cat > /etc/systemd/system/webhook.service << 'EOF'
[Unit]
Description=GitHub Webhook Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node /data/nextjs/webhook/server.js
Restart=always
RestartSec=5
Environment=GITHUB_WEBHOOK_SECRET=YOUR_ACTUAL_SECRET_HERE

[Install]
WantedBy=multi-user.target
EOF

# 替换为你生成的强密码 (必须修改!)
sed -i 's/YOUR_ACTUAL_SECRET_HERE/你的强密码/' /etc/systemd/system/webhook.service

# 启用并启动服务
systemctl daemon-reload
systemctl enable webhook
systemctl start webhook

# 验证状态
systemctl status webhook
```

**⚠️ 警告: `YOUR_ACTUAL_SECRET_HERE` 必须替换为强密码，否则服务无法保护你的部署安全!**

#### 8.7.4 GitHub 配置 Webhook

1. 打开 GitHub 仓库 → **Settings** → **Webhooks**
2. 点击 **Add webhook**
3. 填写：

| 设置 | 值 |
|------|-----|
| Payload URL | `http://服务器IP:3001/webhook` |
| Content type | `application/json` |
| Secret | `your-password`（和上面设置的一致，**必须修改!**） |
| 触发事件 | **Just the push event** |

4. 点击 **Add webhook**

#### 8.7.5 测试

```bash
# 本地 VS Code 改代码后 push
git add .
git commit -m "测试自动部署"
git push

# 查看服务器日志
docker logs -f shenxiang-nextjs
# 或查看 webhook 日志
cat /var/log/webhook.log
```

#### 8.7.6 架构流程

```
VS Code 改代码
    │
    ▼ git push
GitHub 仓库
    │
    ▼ Webhook
服务器: node server.js (端口 3001)
    │
    ▼ 执行
/data/nextjs/webhook/deploy.sh
    │
    ├── git pull (拉取新代码)
    ├── docker build (构建镜像)
    └── docker-compose up -d (重启容器)
    │
    ▼
用户刷新网页 → 看到新版本
```

---

## 阶段九：Nginx 配置 (Day 4)

### 9.1 创建 Nginx 配置

**⚠️ 关键：proxy_pass 必须使用容器网络名称**

```bash
# 创建配置目录
mkdir -p /etc/nginx/sites-available
mkdir -p /etc/nginx/sites-enabled

# 创建站点配置
cat > /etc/nginx/sites-available/api.shenxiang.school << 'EOF'
server {
    listen 80;
    server_name api.shenxiang.school;

    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.shenxiang.school;

    # SSL 配置
    ssl_certificate /etc/letsencrypt/live/api.shenxiang.school/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.shenxiang.school/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # SSE 流式传输关键配置
    proxy_buffering off;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
    proxy_cache off;
    keepalive_timeout 650s;

    # CORS 配置
    set $allowed_origin "https://shenxiang.school";
    add_header 'Access-Control-Allow-Origin' '$allowed_origin' always;
    add_header 'Access-Control-Allow-Credentials' 'true' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'DNT,X-User-Id,X-Model,Content-Type,Authorization,Accept,Origin,User-Agent,Cache-Control,Keep-Alive' always;

    # OPTIONS 预检请求
    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' '$allowed_origin';
        add_header 'Access-Control-Allow-Credentials' 'true';
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
        add_header 'Access-Control-Allow-Headers' 'DNT,X-User-Id,X-Model,Content-Type,Authorization,Accept,Origin,User-Agent,Cache-Control,Keep-Alive';
        add_header 'Access-Control-Max-Age' 86400;
        return 204;
    }

    # 代理到 Next.js (使用容器网络名称)
    location / {
        proxy_pass http://shenxiang-nextjs:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE 必须
        proxy_set_header Connection '';
    }

    # 文件上传大小限制
    client_max_body_size 100M;
}
EOF

# 启用站点
ln -s /etc/nginx/sites-available/api.shenxiang.school /etc/nginx/sites-enabled/

# 测试配置
nginx -t

# 重载 Nginx
systemctl reload nginx
```

### 9.2 更新 /etc/hosts (可选，用于本地测试)

```bash
# 添加容器网络主机名 (仅用于本地测试)
echo "127.0.0.1 shenxiang-nextjs shenxiang-dify shenxiang-redis shenxiang-minio" >> /etc/hosts
```

### 9.3 Nginx 服务化 (systemd)

```bash
# 创建 systemd 服务文件
cat > /etc/systemd/system/nginx.service << 'EOF'
[Unit]
Description=Nginx HTTP Server
After=network.target

[Service]
Type=forking
ExecStart=/usr/sbin/nginx
ExecReload=/usr/sbin/nginx -s reload
ExecStop=/usr/sbin/nginx -s quit
PrivateTmp=true
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

# 启用并启动
systemctl daemon-reload
systemctl enable nginx
systemctl start nginx
```

---

## 阶段十：整体验证 (Day 4-5)

### 10.1 服务健康检查

| 服务 | 检查命令 | 预期结果 |
|------|----------|----------|
| Nginx | `curl -I https://api.shenxiang.school` | 200 OK |
| Next.js | `curl http://localhost:3000/health` | {"status":"ok"} |
| Redis | `docker exec shenxiang-redis redis-cli ping` | PONG |
| Dify | `curl http://localhost:8080/health` | {"status":"ok"} |
| MinIO | `curl http://localhost:9000/minio/health/live` | `{"status":"ok"}` |

### 10.2 功能测试

| 功能 | 测试方法 | 预期结果 |
|------|----------|----------|
| 用户登录 | 前端登录页面 | 登录成功 |
| 积分查询 | 调用 /api/user/credits | 返回正确余额 |
| 聊天对话 | 发送简单问题 | SSE 流式响应 |
| 文件上传 | 上传 10MB 文件 | 上传成功 |
| 作文批改 | 提交作文批改 | 完整响应返回 |

### 10.3 Docker 网络验证

```bash
# 检查网络
docker network inspect shenxiang-net

# 验证容器间通信
docker exec shenxiang-nextjs ping -c 1 shenxiang-dify
docker exec shenxiang-dify ping -c 1 shenxiang-redis
```

---

## 阶段十一：监控与备份 (Day 5)

### 11.1 监控配置

```bash
# 安装 Glances
pip3 install glances
glances &

# 或者使用 1Panel 自带监控
```

### 11.2 备份说明

**注意**: Supabase 云数据库由 Supabase 自动备份，本地只需备份 MinIO 文件和配置文件。

```bash
# 创建备份目录
mkdir -p /data/backup

# 创建备份脚本
cat > /data/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/data/backup

# 备份 MinIO 数据
tar -czf $BACKUP_DIR/minio_$DATE.tar.gz /data/minio/data

# 备份 Nginx 配置
tar -czf $BACKUP_DIR/nginx_$DATE.tar.gz /etc/nginx/sites-available

# 备份 Next.js 应用 (包括 webhook)
tar -czf $BACKUP_DIR/nextjs_$DATE.tar.gz /data/nextjs

# 备份 Dify 配置
tar -czf $BACKUP_DIR/dify_$DATE.tar.gz /data/dify/docker/.env

# 保留最近 30 天
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
EOF

chmod +x /data/backup.sh

# 添加到 crontab (每天凌晨 3 点)
echo "0 3 * * * /data/backup.sh >> /var/log/backup.log 2>&1" >> /var/spool/cron/crontabs/root
```

### 11.3 日志轮转

日志配置已在阶段 3.2 的 `daemon.json` 中统一配置，包含日志轮转 (max-size: 100m, max-file: 3) 和存储驱动 (overlay2)。

如需单独调整日志设置，编辑 `/etc/docker/daemon.json` 后执行:

```bash
systemctl restart docker
```

---

## 快速命令参考卡

### 日常运维命令

```bash
# ========== Docker ==========
docker ps                                    # 查看运行中的容器
docker network ls                            # 查看网络
docker logs -f [容器名]                       # 查看日志
docker restart [容器名]                       # 重启容器
docker exec -it [容器名] psql -U shenxiang   # 进入 PostgreSQL

# ========== 服务状态 ==========
systemctl status nginx                        # Nginx 状态
docker inspect shenxiang-nextjs | grep Status # 容器健康状态

# ========== 网络诊断 ==========
docker network inspect shenxiang-net          # 检查网络配置
docker exec shenxiang-nextjs netstat -tlnp     # 检查端口监听
```

### 紧急回滚

```bash
# 停止所有服务
cd /data/nextjs && docker-compose down
cd /data/dify/docker && docker-compose down
docker stop shenxiang-redis shenxiang-minio

# 删除所有数据 (慎用!)
# rm -rf /data/redis /data/dify /data/nextjs /data/minio

# 从备份恢复 (MinIO 文件)
# tar -xzf /data/backup/minio_20260326_030000.tar.gz -C /
```

### 启动顺序

```bash
# 1. 创建网络
docker network create shenxiang-net --driver bridge

# 2. 启动基础设施
docker start shenxiang-redis shenxiang-minio

# 3. 启动应用
cd /data/dify/docker && docker-compose up -d api
cd /data/nextjs && docker-compose up -d

# 4. 重启 Nginx
systemctl restart nginx
```

---

## 里程碑

| 里程碑 | 完成时间 | 验收标准 |
|--------|----------|----------|
| M1: 服务器就绪 | Day 1 | SSH 登录成功，1Panel 可用 |
| M2: Redis 就绪 | Day 2 | Redis 运行正常，网络互通 |
| M3: Dify 就绪 | Day 2-3 | Dify API 可调用，网络互通 |
| M4: MinIO 就绪 | Day 3 | MinIO Console 可访问，存储桶创建成功 |
| M5: 前端就绪 | Day 3-4 | Next.js 构建并运行，/health 返回 ok |
| M5b: 自动部署 | Day 3-4 | Webhook 配置完成，git push 自动部署 |
| M6: 流量接入 | Day 4 | Nginx 代理完成，域名解析生效 |
| M7: 上线验收 | Day 4-5 | 所有功能测试通过 |

---

## 联系方式

| 角色 | 负责内容 | 联系方式 |
|------|----------|----------|
| Gemini | 服务器运维, Docker, Nginx, Dify | 后端 |
| Claude Code | 前端改造, Next.js, API适配 | 前端 |

---

## 附录：架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      Supabase 云端                           │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │    Auth     │  │   Database   │  │     Storage      │  │
│  │  (用户认证) │  │ (积分/交易)  │  │   (文件存储)     │  │
│  └─────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     香港服务器 (4C16G)                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                     Nginx (443)                      │   │
│  │              (宿主机 systemd 管理)                    │   │
│  └──────────────────────────┬────────────────────────────┘   │
│                             │                               │
│  ┌─────────────────────────┼─────────────────────────────┐  │
│  │                         ▼                             │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │  │
│  │  │ Next.js  │  │   Dify   │  │      MinIO       │   │  │
│  │  │  :3000   │  │  :8080   │  │  :9000 / :9001   │   │  │
│  │  └────┬─────┘  └────┬─────┘  └──────────────────┘   │  │
│  │       │             │                                │  │
│  │       │    ┌────────┴────────┐                       │  │
│  │       │    ▼                 ▼                       │  │
│  │       │  ┌─────────┐  ┌────────────┐                │  │
│  │       │  │  Redis  │  │  (Supabase │                │  │
│  │       │  │  :6379  │  │   云数据库) │                │  │
│  │       │  └─────────┘  └────────────┘                │  │
│  └───────┼──────────────────────────────────────────────┘  │
│          │                                                  │
└──────────┼──────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│                   shenxiang-net (bridge)                    │
│  • shenxiang-nextjs                                         │
│  • shenxiang-dify                                           │
│  • shenxiang-redis                                          │
│  • shenxiang-minio                                          │
└─────────────────────────────────────────────────────────────┘
```

---

**文档版本**: v1.7
**创建日期**: 2026-03-26
**更新日期**: 2026-03-28 (v1.7: 修复 CRITICAL 安全问题 - webhook secret 强制校验、systemd 守护、docker exec -i、备份 webhook)
**状态**: 待审核
