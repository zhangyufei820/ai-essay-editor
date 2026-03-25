# 沈翔智学架构迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将前端从 Vercel 迁移到自建香港服务器，支持 600 秒长连接和 100MB 文件上传

**Architecture:** 客户端 → Nginx (600s) → Next.js 容器 → Dify 内网 → 积分本地扣费。Supabase Auth 保留云服务，数据迁回本地 PostgreSQL。

**Tech Stack:** Next.js 16, Docker, Nginx, PostgreSQL 15, Dify, Lighthouse

---

## 阶段分工

| 阶段 | 负责方 | 范围 |
|------|--------|------|
| 第一阶段 | Gemini | 服务器基础设施、Docker、Nginx、Dify |
| 第二阶段 | Gemini | 数据迁移 (Supabase → 本地 PG) |
| 第三阶段 | Claude Code | 前端改造 (本计划范围) |

---

## 第三阶段：前端改造任务

### Task 1: 环境变量配置

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: 添加新的环境变量到 .env.example**

```bash
# API 配置
NEXT_PUBLIC_API_BASE_URL=https://api.shenxiang.school

# Dify 内网地址 (仅服务端使用，不暴露给前端)
DIFY_INTERNAL_URL=http://dify:8080/v1

# 本地 PostgreSQL (仅服务端使用)
LOCAL_POSTGRES_URL=postgresql://shenxiang:password@postgres:5432/shenxiang
LOCAL_POSTGRES_SERVICE_KEY=your-service-key

# Lighthouse
NEXT_PUBLIC_LIGHTHOUSE_UPLOAD_URL=http://lighthouse:9000
LIGHTHOUSE_SECRET=your-secret
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "feat: add self-hosted environment variables"
```

---

### Task 2: next.config.mjs 更新

**Files:**
- Modify: `next.config.mjs`

- [ ] **Step 1: 添加 api.shenxiang.school 到 remotePatterns**

```javascript
// 在 remotePatterns 数组中添加
{
  protocol: 'https',
  hostname: 'api.shenxiang.school',
},
```

- [ ] **Step 2: Commit**

```bash
git add next.config.mjs
git commit -m "feat: add api.shenxiang.school to image remote patterns"
```

---

### Task 3: 创建环境变量工具函数

**Files:**
- Create: `lib/api-config.ts`

- [ ] **Step 1: 创建 API 配置工具**

```typescript
/**
 * API 配置
 * 统一管理 API Base URL
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || ''

/**
 * 获取完整的 API URL
 */
export function getApiUrl(path: string): string {
  if (path.startsWith('http')) {
    return path
  }
  return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

/**
 * 判断是否使用绝对路径
 */
export function isAbsoluteUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/api-config.ts
git commit -m "feat: add API config utility"
```

---

### Task 4: enhanced-chat-interface.tsx API 调用改造

**Files:**
- Modify: `components/chat/enhanced-chat-interface.tsx:1020-1035`

- [ ] **Step 1: 找到 API 调用位置**

查找:
```typescript
const res = await fetch("/api/dify-chat", {
```

- [ ] **Step 2: 替换为使用环境变量**

```typescript
import { getApiUrl } from '@/lib/api-config'

// 在组件中添加
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || ''

// 替换原来的 fetch 调用
const res = await fetch(`${API_BASE}/api/dify-chat`, {
```

- [ ] **Step 3: Commit**

```bash
git add components/chat/enhanced-chat-interface.tsx
git commit -m "feat: use environment variable for dify-chat API URL"
```

---

### Task 5: banana-chat-interface.tsx API 调用改造

**Files:**
- Modify: `components/chat/banana-chat-interface.tsx`

- [ ] **Step 1: 查找并替换 /api/ 调用**

使用 Grep 查找所有 `/api/` 开头的 fetch 调用

- [ ] **Step 2: 应用相同的改造模式**

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || ''
// 替换 /api/xxx 为 ${API_BASE}/api/xxx
```

- [ ] **Step 3: Commit**

```bash
git add components/chat/banana-chat-interface.tsx
git commit -m "feat: use environment variable for API URLs in banana-chat"
```

---

### Task 6: essay-grader.tsx API 调用改造

**Files:**
- Modify: `components/essay-grader.tsx`

- [ ] **Step 1: 查找并替换 /api/ 调用**

- [ ] **Step 2: Commit**

```bash
git add components/essay-grader.tsx
git commit -m "feat: use environment variable for API URLs in essay-grader"
```

---

### Task 7: essay-analyzer.tsx API 调用改造

**Files:**
- Modify: `components/essay-analyzer.tsx`

- [ ] **Step 1: 查找并替换 /api/ 调用**

- [ ] **Step 2: Commit**

```bash
git add components/essay-analyzer.tsx
git commit -m "feat: use environment variable for API URLs in essay-analyzer"
```

---

### Task 8: app/api/dify-chat/route.ts Dify URL + Supabase 改造

**Files:**
- Modify: `app/api/dify-chat/route.ts`

**注意**: 此文件同时需要：
1. Dify URL 改为内网地址
2. Supabase 积分扣费改为本地 PostgreSQL (Task 10c)

- [ ] **Step 1: 找到 DIFY_BASE_URL 定义 (约第18行)**

```typescript
// 当前
const DIFY_BASE_URL = process.env.DIFY_BASE_URL || "https://api.dify.ai/v1"

// 改造后 - 优先使用内网地址
const DIFY_BASE_URL = process.env.DIFY_INTERNAL_URL
  || process.env.DIFY_BASE_URL
  || "https://api.dify.ai/v1"
```

- [ ] **Step 2: 找到 Supabase 客户端定义 (约第23-26行)**

```typescript
// 当前
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 改造后 - 使用本地 PostgreSQL
// 见 Task 10c 的实现模式
```

- [ ] **Step 3: Commit**

```bash
git add app/api/dify-chat/route.ts
git commit -m "feat: use DIFY_INTERNAL_URL and local PostgreSQL for dify-chat"
```

---

### Task 9: app/api/dify-upload/route.ts Dify URL 改造

**Files:**
- Modify: `app/api/dify-upload/route.ts`

- [ ] **Step 1: 同样修改 DIFY_BASE_URL**

- [ ] **Step 2: Commit**

```bash
git add app/api/dify-upload/route.ts
git commit -m "feat: use DIFY_INTERNAL_URL for dify-upload"
```

---

### Task 10: 检查并改造所有 Dify 相关 API 路由

**Files:**
- Modify: `app/api/sparkpage/route.ts`
- Modify: `app/api/essay-grade/route.ts`
- Modify: `app/api/essay-review/route.ts`
- Modify: `app/api/document-process/route.ts`
- Modify: `app/api/presentation/route.ts`

- [ ] **Step 1: 使用 Grep 查找所有 api.dify.ai 引用**

```bash
grep -r "api.dify.ai" app/api/
```

预期输出：列出所有包含 api.dify.ai 的文件

- [ ] **Step 2: 逐个修改找到的文件，将 DIFY_BASE_URL 替换为内网地址**

每个文件都需要修改 DIFY_BASE_URL 定义，模式与 Task 8 相同

- [ ] **Step 3: Commit**

```bash
git add app/api/sparkpage/route.ts app/api/essay-grade/route.ts app/api/essay-review/route.ts app/api/document-process/route.ts app/api/presentation/route.ts
git commit -m "feat: update Dify API routes to use internal URL"
```

---

### Task 10b: 检查所有 chat 组件中的 API 调用

**Files:**
- Modify: `components/chat/ChatInput.tsx`
- Modify: `components/chat/MessageBubble.tsx`
- Modify: `components/chat/WorkflowVisualizer.tsx`
- Modify: `components/chat/EmptyState.tsx`
- Modify: `components/chat/MusicCard.tsx`
- Modify: `components/chat/ModelSelector.tsx`

- [ ] **Step 1: 查找所有 chat 组件中的 fetch 调用**

```bash
grep -r "fetch.*api/" components/chat/
```

- [ ] **Step 2: 替换为使用 NEXT_PUBLIC_API_BASE_URL 环境变量**

- [ ] **Step 3: Commit**

```bash
git add components/chat/
git commit -m "feat: update chat components to use environment variable API base URL"
```

---

### Task 10c: 将 Supabase 数据操作迁移到本地 PostgreSQL

**Files:**
- Modify: `app/api/dify-chat/route.ts` (积分扣费、事务记录)
- Modify: `app/api/chat-session/route.ts`
- Modify: `app/api/save-message/route.ts`
- Modify: `app/api/save-essay-review/route.ts`
- Modify: `app/api/user/credits/route.ts`
- Modify: `app/api/user/transactions/route.ts`
- Modify: `app/api/user/membership/route.ts`
- Modify: `app/api/share/route.ts`
- Modify: `app/api/referral/get-code/route.ts`
- Modify: `app/api/referral/process/route.ts`
- Modify: `app/api/share/claim-reward/route.ts`

**依赖**: 第一阶段 (Gemini) 完成 PostgreSQL 部署

**实现模式**:

```typescript
// 1. 添加 PostgreSQL 客户端 (推荐使用 postgres.js)
import { Pool } from '@neondatabase/serverless'

const pool = new Pool({
  connectionString: process.env.LOCAL_POSTGRES_URL,
})

// 2. 替换 Supabase 调用
// 原来: const { data } = await supabase.from('table').select()
// 改为: const { rows } = await pool.query('SELECT * FROM table WHERE user_id = $1', [userId])
```

- [ ] **Step 1: 确认 LOCAL_POSTGRES_URL 环境变量已配置 (Task 1)**

- [ ] **Step 2: 安装 postgres.js**

```bash
npm install @neondatabase/serverless
```

- [ ] **Step 3: 逐个修改文件，将 Supabase 数据操作替换为本地 PG**

每个文件的改动模式相同：
1. 导入 postgres.js
2. 创建 Pool 实例
3. 替换 supabase 调用为 pool.query

- [ ] **Step 4: Commit**

```bash
git add app/api/
npm install @neondatabase/serverless
git add package.json package-lock.json
git commit -m "feat: migrate data operations from Supabase to local PostgreSQL"
```

**注意**:
- `/api/auth/*` 路由继续使用 Supabase Auth (不迁移)
- `/api/payment/*` 路由使用第三方支付 API (保持不变)
- 涉及数据库迁移的具体表结构见设计文档 Section 10.3

---

### Task 11: 创建 Dockerfile

**Files:**
- Create: `Dockerfile`

**说明**: 本 Dockerfile 用于构建 Next.js 容器镜像。Nginx 配置由第一阶段 (Gemini) 负责。

- [ ] **Step 1: 创建多阶段构建 Dockerfile**

```dockerfile
# ========== 构建阶段 ==========
FROM node:20-alpine AS builder

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --omit=dev

# 复制源代码
COPY . .

# 构建
RUN npm run build

# ========== 生产阶段 ==========
FROM node:20-alpine AS runner

WORKDIR /app

# 安装生产依赖
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 从构建阶段复制
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./
COPY --from=builder /app/public ./public

# 环境变量
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
```

- [ ] **Step 2: Commit**

```bash
git add Dockerfile
git commit -m "feat: add Dockerfile for containerized deployment"
```

---

### Task 12: 创建 .dockerignore

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: 创建 .dockerignore**

```dockerfile
# 依赖
node_modules
.npm

# 构建产物
.next
out

# 测试
coverage
*.test.ts
*.spec.ts

# 开发文件
.env*
!.env.example
.git
.gitignore

# 文档
README.md
docs
*.md

# IDE
.vscode
.idea

# 日志
logs
*.log
npm-debug.log*

# Docker
Dockerfile
docker-compose.yml
.dockerignore
```

- [ ] **Step 2: Commit**

```bash
git add .dockerignore
git commit -m "chore: add .dockerignore"
```

---

### Task 13: 创建 docker-compose.yml (前端开发环境)

**Files:**
- Create: `docker-compose.yml`
- Create: `docker-compose.prod.yml` (生产环境完整配置)

**说明**:
- 本文件用于**前端本地开发**，不包含 Nginx/Lighthouse (由第一阶段 Gemini 负责)
- 生产环境完整配置见 `docker-compose.prod.yml` (基于设计文档 Section 8.1)

- [ ] **Step 1: 创建开发环境 docker-compose.yml**

```yaml
version: '3.8'

services:
  nextjs:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
      - DIFY_INTERNAL_URL=http://host.docker.internal:8080/v1
      - NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      - LOCAL_POSTGRES_URL=postgresql://shenxiang:password@postgres:5432/shenxiang
    volumes:
      - .:/app
      - /app/node_modules
      - /app/.next
    depends_on:
      - postgres
    networks:
      - shenxiang-net

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_USER=shenxiang
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=shenxiang
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - shenxiang-net

volumes:
  postgres_data:

networks:
  shenxiang-net:
    driver: bridge
```

- [ ] **Step 2: 创建生产环境 docker-compose.prod.yml**

基于设计文档 Section 8.1 创建完整的生产环境配置 (包含 Nginx, Dify, Lighthouse)

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml docker-compose.prod.yml
git commit -m "feat: add docker-compose files for dev and prod"
```

---

### Task 14: 验证构建

**Files:**
- Modify: `Dockerfile` (如需调整)

- [ ] **Step 1: 本地构建测试**

```bash
docker build -t shenxiang-nextjs .
```

- [ ] **Step 2: 验证镜像**

```bash
docker run -p 3000:3000 shenxiang-nextjs
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: verify Docker build works"
```

---

## 前端改造任务清单

| Task | 任务 | 状态 |
|------|------|------|
| 1 | 环境变量配置 (.env.example) | ⬜ |
| 2 | next.config.mjs 更新 | ⬜ |
| 3 | 创建 API 配置工具函数 | ⬜ |
| 4 | enhanced-chat-interface.tsx 改造 | ⬜ |
| 5 | banana-chat-interface.tsx 改造 | ⬜ |
| 6 | essay-grader.tsx 改造 | ⬜ |
| 7 | essay-analyzer.tsx 改造 | ⬜ |
| 8 | dify-chat route.ts (Dify URL + PG) | ⬜ |
| 9 | dify-upload route.ts 改造 | ⬜ |
| 10 | Dify 相关 API 路由改造 | ⬜ |
| 10b | Chat 组件 API 调用改造 | ⬜ |
| 10c | 数据路由迁移到本地 PG | ⬜ |
| 11 | 创建 Dockerfile | ⬜ |
| 12 | 创建 .dockerignore | ⬜ |
| 13 | 创建 docker-compose.yml (dev + prod) | ⬜ |
| 14 | 验证构建 | ⬜ |

---

## 第一阶段：基础设施 (Gemini 负责)

### 服务器初始化
- [ ] 1Panel 安装配置
- [ ] Docker + Docker Compose 安装
- [ ] SSL 证书申请与配置

### Nginx 配置
- [ ] `nginx/conf.d/shenxiang.school.conf` 创建
- [ ] proxy_read_timeout 600s 配置
- [ ] proxy_buffering off 配置
- [ ] CORS 白名单配置

### Dify 部署
- [ ] Dify Docker 容器部署
- [ ] Redis 依赖配置
- [ ] 健康检查配置

### PostgreSQL 部署
- [ ] PostgreSQL 15 安装
- [ ] 数据库创建
- [ ] 用户权限配置

### Lighthouse 部署
- [ ] Lighthouse 安装
- [ ] 签名 URL 密钥配置

---

## 第二阶段：数据迁移 (Gemini 负责)

### 数据导出
- [ ] Supabase 数据导出脚本
- [ ] 用户表导出
- [ ] 积分表导出
- [ ] 事务表导出

### 数据导入
- [ ] 本地 PostgreSQL 导入
- [ ] 数据一致性校验
- [ ] 索引重建

---

## 依赖关系

```
Task 1 (环境变量)
    ↓
Task 2 (next.config.mjs) ← Task 1
Task 3 (API工具) ← Task 1
    ↓
Task 4-7 (组件改造) ← Task 3
Task 8 (dify-chat) ← Task 1, Task 3
Task 9 (dify-upload) ← Task 3
Task 10 (Dify路由) ← Task 3
Task 10b (Chat组件) ← Task 1
    ↓
Task 10c (数据迁移) ← Task 1, Task 3, Phase 1完成
    ↓
Task 11-12 (Docker) ← Task 1
Task 13 (docker-compose) ← Task 11
    ↓
Task 14 (验证构建) ← Task 11-13
```

**注意**: Phase 1 (Gemini) 必须在 Task 10c 之前完成，以确保 PostgreSQL 可用

---

## 测试验证清单

### 功能测试
- [ ] `/api/dify-chat` SSE 流式响应正常
- [ ] 文件上传到 Lighthouse 成功
- [ ] 积分扣费正确
- [ ] 认证流程正常

### 性能测试
- [ ] 600 秒长连接不断开
- [ ] 内存使用在限制内

### 回归测试
- [ ] 现有功能不受影响
- [ ] API 响应格式一致

---

**计划版本**: v1.3
**创建日期**: 2026-03-25
**基于设计文档**: docs/superpowers/specs/2026-03-25-shenxiang-architecture-migration-design.md
