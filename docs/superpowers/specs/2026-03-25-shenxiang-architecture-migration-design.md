# 沈翔智学架构迁移设计文档

**日期**: 2026-03-25
**状态**: 评审通过 (v1.2)
**版本**: v1.2

---

## 1. 背景与目标

### 1.1 问题陈述

当前系统部署在 Vercel + Supabase + Dify 云，存在以下瓶颈：

| 问题 | 影响 |
|------|------|
| Vercel 10秒超时限制 | 20K+ Token 作文批改任务（需2分钟）无法完成 |
| Vercel 4.5MB Payload 限制 | 无法上传大文件 |
| 多跳网络延迟 | 前端 → Vercel → Dify 云 → Supabase，延迟高 |
| Supabase 云服务成本 | 长期成本考虑 |

### 1.2 迁移目标

1. **消除 10 秒超时** — 迁移到自建服务器，支持 600 秒长连接
2. **支持大文件上传** — 100MB Payload
3. **简化网络架构** — 前端 → Nginx → Dify (内网)
4. **数据自主可控** — PostgreSQL 迁回本地

---

## 2. 架构设计

### 2.1 目标架构

```
                         ┌─────────────────────────────────────┐
                         │         香港服务器 (4C16G)            │
                         │                                     │
                         │  ┌─────────────────────────────┐    │
                         │  │         Nginx               │    │
                         │  │  • 端口 80/443 (HTTPS)      │    │
                         │  │  • proxy_read_timeout 600s  │    │
                         │  │  • proxy_buffering off     │    │
                         │  │  • client_max_body_size 100M│   │
                         │  └──────────┬──────────────────┘    │
                         │             │                       │
                         │    ┌────────┴────────┐               │
                         │    ▼                 ▼               │
                         │  ┌──────┐      ┌──────────┐         │
                         │  │Next.js│      │Dify API  │         │
                         │  │:3000  │      │:8080     │         │
                         │  └──────┘      └──────────┘         │
                         │       │              │                │
                         │       │    ┌────────┴────────┐        │
                         │       │    ▼                 ▼      │
                         │       │  ┌─────────┐  ┌──────────┐   │
                         │       │  │PostgreSQL│  │Lighthouse│   │
                         │       │  │:5432     │  │:9000    │   │
                         │       │  └─────────┘  └──────────┘   │
                         └───────┼──────────────────────────────┘
                                 │
                                 ▼
                          公网用户浏览器
                     (api.shenxiang.school)
```

### 2.2 网络通信矩阵

| 源 | 目标 | 协议 | 超时 | 用途 |
|----|------|------|------|------|
| 浏览器 | Nginx | HTTPS | 600s | 全部流量 |
| Nginx | Next.js | HTTP | 60s | 静态+API |
| Nginx | Dify | HTTP | 600s | SSE流式 |
| Next.js | Dify | HTTP | 600s | API调用 |
| Next.js | PostgreSQL | PostgreSQL | 30s | 数据读写 |
| Next.js | Supabase | HTTPS | 30s | Auth验证 |
| 浏览器 | Lighthouse | HTTPS | 60s | 文件上传 |

### 2.3 核心设计原则

1. **Nginx 统一入口** — 所有流量（前端静态资源 + API 代理 + SSE流式）经过 Nginx
2. **Docker 内部网络** — `Next.js → Dify` 使用 Docker 内网 IP，延迟 < 5ms
3. **600s 长连接** — `proxy_read_timeout 600` 支持 20K+ Token 生成
4. **SSE 无缓冲** — `proxy_buffering off` 确保文字逐字跳动

---

## 3. 代理层设计

### 3.1 `/api/dify-chat` 核心逻辑

```
客户端
  │
  │ POST /api/dify-chat { query, model, fileIds, inputs }
  ▼
Nginx (600s timeout, proxy_buffering off)
  │
  │ 全部流量路由到 Next.js
  ▼
Next.js 容器 (:3000)
  │
  ├── 1. 身份验证 (X-User-Id / Session Cookie)
  ├── 2. 积分预检查 (余额 >= 预估最低消费)
  ├── 3. 构造 Dify 请求 (注入正确 API Key)
  │
  │ POST /v1/chat-messages (内网)
  ▼
Dify (内网:8080)
  │
  │ SSE 流式响应
  ▼
Next.js 容器
  │
  ├── 4. 流式转发 (TransformStream)
  ├── 5. 收集完整响应
  ├── 6. 响应验证 (过滤无效结果)
  │
  ├── 7. 积分扣费 (原子操作)
  ├── 8. 写入事务记录
  │
  ▼
客户端 (流式接收)
```

### 3.2 API Key 管理

```typescript
// 环境变量配置
// .env
DIFY_API_KEY=app-xxx          // 标准版
DIFY_TEACHING_PRO_API_KEY=app-xxx
DIFY_API_KEY_GPT5=app-xxx
DIFY_API_KEY_CLAUDE=app-xxx
DIFY_API_KEY_GEMINI=app-xxx
DIFY_BANANA_API_KEY=app-xxx

// 服务端代码使用
const targetApiKey = getApiKeyForModel(model); // 不暴露给前端
```

### 3.3 Dify URL 配置

```typescript
// 优先使用内网地址
const DIFY_BASE_URL = process.env.DIFY_INTERNAL_URL  // http://dify:8080/v1
  || process.env.DIFY_BASE_URL                         // https://api.dify.ai/v1 (回退)
```

---

## 4. 前端改造

### 4.1 环境变量

```bash
# .env.local
NEXT_PUBLIC_API_BASE_URL=https://api.shenxiang.school
```

### 4.2 API 调用改造

```typescript
// 改造前
const res = await fetch("/api/dify-chat", { ... })

// 改造后
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || ""
const res = await fetch(`${API_BASE}/api/dify-chat`, { ... })
```

### 4.3 需要改动的文件

| 文件 | 改动点 |
|------|--------|
| `next.config.mjs` | `remotePatterns` 添加 `api.shenxiang.school` |
| `.env.example` | 新增 `NEXT_PUBLIC_API_BASE_URL` |
| `enhanced-chat-interface.tsx` | 统一 base URL 引用 |
| `banana-chat-interface.tsx` | 统一 base URL 引用 |
| `essay-grader.tsx` | 统一 base URL 引用 |
| `essay-analyzer.tsx` | 统一 base URL 引用 |
| `components/chat/*.tsx` | 逐一检查并修改 |

---

## 5. 认证与会话

### 5.1 决策

| 组件 | 决策 | 理由 |
|------|------|------|
| Supabase Auth | **保留云服务** | Auth 逻辑复杂，迁移风险高 |
| PostgreSQL 数据 | **迁回本地** | 用户数据、积分、事务记录 |

### 5.2 双数据库连接

```typescript
// Supabase - Auth (保持云服务)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// 本地 PostgreSQL - 数据 (新增)
const localDb = createClient(
  process.env.LOCAL_POSTGRES_URL!,
  process.env.LOCAL_POSTGRES_SERVICE_KEY!,
)
```

### 5.3 认证流程

```
1. 浏览器 → Supabase Auth → 获取 session
2. 浏览器 → 你的 API (携带 session cookie)
3. 服务端 → Supabase Auth 验证 session → 获取 user.id
4. 服务端 → 本地 PostgreSQL (使用 user.id 查询积分)
```

---

## 6. 文件上传

### 6.1 流程

```
浏览器 → Lighthouse (带签名URL) → 返回 fileId → 携带 fileId 调用聊天
              ↑
         绕过 Vercel 4.5MB 限制
```

### 6.2 Lighthouse 认证机制

Lighthouse 使用**签名 URL 机制**验证上传者身份：

```typescript
// 服务端生成签名 URL
async function getLighthouseUploadUrl(userId: string, filename: string) {
  const expiry = Math.floor(Date.now() / 1000) + 3600; // 1小时有效期
  const signature = crypto
    .createHmac('sha256', process.env.LIGHTHOUSE_SECRET!)
    .update(`${userId}:${filename}:${expiry}`)
    .digest('hex');

  return {
    uploadUrl: `http://lighthouse:9000/upload?userId=${userId}&expires=${expiry}&sig=${signature}`,
    fileId: `${userId}-${Date.now()}`
  };
}
```

### 6.3 文件与用户关联

上传时 Lighthouse 记录：
- `fileId`: 唯一标识
- `userId`: 上传者
- `filename`: 原始文件名
- `uploadedAt`: 上传时间

调用 `/api/dify-chat` 时，服务端验证 `fileId` 属于当前用户。

### 6.4 Lighthouse 配置

```bash
# .env
NEXT_PUBLIC_LIGHTHOUSE_UPLOAD_URL=http://lighthouse:9000
LIGHTHOUSE_SECRET=xxx
```

---

## 7. Nginx 配置

### 7.1 核心配置

```nginx
server {
    listen 443 ssl http2;
    server_name api.shenxiang.school;

    # SSL 证书
    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    # ========== SSE 流式传输 ==========
    proxy_buffering off;           # 关闭代理缓冲
    proxy_read_timeout 600s;       # 长连接超时 600s
    proxy_send_timeout 600s;
    proxy_cache off;               # 防止缓存

    # ========== CORS ==========
    # 注意：使用 $http_origin 时不能设置 Access-Control-Allow-Credentials: true
    # 如需 credentials，必须使用白名单指定具体域名
    set $allowed_origin "https://shenxiang.school";  # 实际域名
    add_header 'Access-Control-Allow-Origin' '$allowed_origin' always;
    add_header 'Access-Control-Allow-Credentials' 'true' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'DNT,X-User-Id,X-Model,Content-Type,Authorization,Accept,Origin,User-Agent,Cache-Control,Keep-Alive' always;

    # ========== Keepalive 长连接 ==========
    keepalive_timeout 650s;

    # ========== 代理到 Next.js (全部流量，包括 /api/dify-chat) ==========
    location / {
        proxy_pass http://nextjs:3000;
        proxy_http_version 1.1;

        # 🔥 SSE 流式传输关键配置
        proxy_buffering off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        proxy_cache off;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE 必须
        proxy_set_header Connection '';
    }

    # ========== 文件上传 ==========
    client_max_body_size 100M;
}
```

### 7.2 关键参数

| 参数 | 值 | 作用 |
|------|-----|------|
| `proxy_read_timeout` | 600s | 支持 20K+ Token 生成 |
| `proxy_buffering` | off | SSE 流式输出 |
| `client_max_body_size` | 100M | 大文件上传 |

---

## 8. Docker 配置

### 8.1 docker-compose.yml

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      nextjs:
        condition: service_healthy
    networks:
      - shenxiang-net
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 128M

  nextjs:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      - NODE_ENV=production
      - DIFY_INTERNAL_URL=http://dify:8080/v1
      - LOCAL_POSTGRES_URL=${LOCAL_POSTGRES_URL}
      - LOCAL_POSTGRES_SERVICE_KEY=${LOCAL_POSTGRES_SERVICE_KEY}
      - NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
    depends_on:
      postgres:
        condition: service_healthy
      dify:
        condition: service_healthy
    networks:
      - shenxiang-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 1G

  # Dify 使用官方 docker-compose 片段
  # 注意：Dify 完整部署包含 API、Worker、Web、DB、Redis 等多服务
  # 此处使用 dify/api 镜像作为 API 服务
  dify:
    image: dify/dify-api:latest
    environment:
      - SECRET_KEY=${DIFY_SECRET_KEY}
      - INIT_ADMIN_EMAIL=${DIFY_ADMIN_EMAIL}
      - INIT_ADMIN_PASSWORD=${DIFY_ADMIN_PASSWORD}
      - DB_USERNAME=shenxiang
      - DB_PASSWORD=${POSTGRES_PASSWORD}
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_DATABASE=dify
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_PASSWORD=${REDIS_PASSWORD}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - shenxiang-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:8080/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 4G

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_USER=shenxiang
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=shenxiang
    volumes:
      - ./postgres/data:/var/lib/postgresql/data
    networks:
      - shenxiang-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U shenxiang"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 512M

  redis:
    image: redis:7-alpine
    networks:
      - shenxiang-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 256M

  lighthouse:
    image: mythomedia/lighthouse:latest
    environment:
      - PORT=9000
      - NODE_ENV=production
      - LIGHTHOUSE_SECRET=${LIGHTHOUSE_SECRET}
    ports:
      - "9000:9000"  # 仅内网访问
    networks:
      - shenxiang-net
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 256M

networks:
  shenxiang-net:
    driver: bridge
```

### 8.2 资源预算 (4C16G)

| 服务 | CPU | 内存 | 说明 |
|------|-----|------|------|
| Nginx | 0.5 | 128MB | 反向代理 |
| Next.js | 1 | 1GB | 前端应用 |
| Dify API | 2 | 4GB | AI 推理服务 |
| PostgreSQL | 0.5 | 512MB | 数据存储 |
| Redis | 0.5 | 256MB | 缓存/队列 |
| Lighthouse | 0.5 | 256MB | 文件上传 |
| **总计** | **4** | **~6.5GB** | 留有 9.5GB 余量 |

### 8.3 端口占用

| 端口 | 服务 | 外部访问 |
|------|------|----------|
| 80/443 | Nginx | ✅ |
| 3000 | Next.js | ❌ (仅Nginx内网) |
| 8080 | Dify | ❌ (仅内网) |
| 5432 | PostgreSQL | ❌ (仅内网) |

---

## 9. 错误处理

### 9.1 错误场景

| 场景 | 处理策略 | 是否阻断 |
|------|----------|----------|
| Dify 网络超时 | 重试（新会话，最多2次） | ❌ |
| Dify 404/400 (会话不存在) | 重试（新会话） | ❌ |
| Dify 500 | 返回错误信息，不扣费 | ✅ |
| 积分不足 | 预检查拒绝 | ✅ |
| 扣费失败 | 记录日志，不阻断响应 | ❌ |

**注意**：只有网络超时和会话不存在错误才会重试。**失败的请求不扣费**。

### 9.2 前端重试

```typescript
try {
  // ... 流式读取
} catch (error) {
  if (error.name === 'AbortError') {
    toast.error("请求超时，请重试");
  } else if (error.message.includes('401')) {
    toast.error("登录已过期，请重新登录");
  } else {
    toast.error(`网络错误: ${error.message}`);
  }
}
```

---

## 10. 实施路线图

### 10.1 三阶段

```
┌─────────────────────────────────────────────────────────────┐
│  第一阶段：基础设施搭建 (1-2周)                                │
├─────────────────────────────────────────────────────────────┤
│  □ 1Panel 安装配置                                           │
│  □ Docker + Docker Compose 安装                              │
│  □ Nginx 安装与 SSL 证书配置                                  │
│  □ PostgreSQL 部署                                           │
│  □ Dify 容器化部署                                           │
│  □ 内网 DNS / hosts 配置                                     │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  第二阶段：数据迁移 (1周)                                     │
├─────────────────────────────────────────────────────────────┤
│  □ Supabase → 本地 PG 数据导出                               │
│  □ 用户表、积分表、事务表迁移                                 │
│  □ 迁移脚本编写与测试                                        │
│  □ 数据一致性校验                                            │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  第三阶段：前端改造与切换 (2周)                               │
├─────────────────────────────────────────────────────────────┤
│  □ 环境变量配置                                              │
│  □ API Base URL 修改                                        │
│  □ next.config.mjs 适配                                     │
│  □ Docker 镜像构建                                           │
│  □ 灰度发布 / 切流                                           │
│  □ 监控与日志配置                                            │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 详细任务

| 阶段 | 任务 | 负责方 | 预计工时 |
|------|------|--------|----------|
| **第一阶段** | 服务器初始化 | Gemini | 4h |
| | Nginx 配置（含600s） | Gemini | 2h |
| | Dify 部署 (含 Redis) | Gemini | 4h |
| | PostgreSQL 部署 | Gemini | 1h |
| | Lighthouse 部署 | Gemini | 2h |
| | Docker Compose 编写 | Gemini | 2h |
| **第二阶段** | 数据迁移脚本 | Gemini | 4h |
| | 数据校验 | Gemini | 2h |
| **第三阶段** | 前端环境变量 | Claude Code | 1h |
| | API Base URL 修改 | Claude Code | 4h |
| | next.config.mjs 更新 | Claude Code | 1h |
| | Dockerfile 编写 | Claude Code | 2h |
| | Nginx SSL 配置 | Gemini | 1h |
| | 灰度/全量发布 | Gemini | 2h |

### 10.3 API 路由清单

| 路由 | 目标 | 改动 |
|------|------|------|
| `/api/auth/*` | Supabase | 保持 |
| `/api/dify-chat` | Next.js → Dify | Base URL 改为内网 |
| `/api/dify-upload` | Next.js → Dify | Base URL 改为内网 |
| `/api/chat-session` | 本地 PG | 指向本地 |
| `/api/save-message` | 本地 PG | 指向本地 |
| `/api/save-essay-review` | 本地 PG | 指向本地 |
| `/api/user/credits` | 本地 PG | 指向本地 |
| `/api/user/transactions` | 本地 PG | 指向本地 |
| `/api/user/membership` | 本地 PG | 指向本地 |
| `/api/payment/*` | 第三方 | 保持 |
| `/api/suno` | 第三方 | 保持 |
| `/api/sparkpage` | Dify | Base URL 改为内网 |
| `/api/essay-grade` | Dify | Base URL 改为内网 |
| `/api/essay-review` | Dify | Base URL 改为内网 |
| `/api/document-process` | Dify | Base URL 改为内网 |
| `/api/presentation` | Dify | Base URL 改为内网 |
| `/api/ocr` | 第三方/本地 | 待定 |
| `/api/providers` | 配置 | 保持 |
| `/api/share/*` | 本地 PG | 指向本地 |
| `/api/referral/*` | 本地 PG | 指向本地 |
| `/api/web-search` | 第三方 | 保持 |
| `/api/debug/*` | - | 移除或保留 |

---

## 11. 风险与缓解

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| Vercel 10s 超时导致长任务中断 | 🔴 高 | 切换到自建 Nginx |
| 数据库迁移数据丢失 | 🔴 高 | 迁移前完整备份 + 灰度验证 |
| Dify 迁移后 API 兼容性问题 | 🟡 中 | 保持 api.dify.ai 作为 fallback |
| 积分扣费不一致 | 🔴 高 | 严格模式扣费 + 事务记录 |
| Supabase Auth 单点故障 | 🔴 高 | Auth 缓存 + 熔断机制 |
| 4C16G 资源不足导致 OOM | 🟡 中 | Docker 资源限制 + 监控 |
| Lighthouse 上传无认证 | 🟡 中 | 签名 URL 机制 |
| 重试导致双重扣费 | 🟡 中 | 失败请求不扣费 |
| 回滚方案不明确 | 🟡 中 | 详见 12 节详细步骤 |

---

## 12. 回滚方案

### 12.1 回滚触发条件

- Dify 服务不可用超过 5 分钟
- 积分扣费错误率 > 1%
- 前端错误率 > 5%

### 12.2 回滚步骤

```bash
# 1. DNS 切换：将 api.shenxiang.school 指回 Vercel
#    (在 DNS 提供商控制台修改 A 记录)

# 2. 停止本地服务
docker-compose down

# 3. 验证 Vercel 服务恢复
curl https://your-app.vercel.app/api/health

# 4. Supabase 数据回滚（如有本地写入）
#    恢复迁移前备份
psql -h localhost -U shenxiang -d shenxiang < backup_pre_migration.sql

# 5. 通知用户
```

### 12.3 回滚时间估算

- DNS 切换：5-30 分钟（取决于 DNS 缓存）
- 服务停止：1 分钟
- Vercel 验证：2 分钟
- **总计**：约 10-30 分钟

### 12.4 数据一致性保证

回滚前检查：
- 确认本地 PostgreSQL 最后写入时间
- 记录需要同步的数据量
- 如有疑问，先导出本地数据再回滚

---

**文档版本**: v1.2
**创建日期**: 2026-03-25
**评审版本**: v1.0 → v1.1 (修复10个问题) → v1.2 (修复3个新问题)
**下次审查**: 评审通过后
