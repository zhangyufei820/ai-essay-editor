# ai-essay-editor 部署优化 SOP

> 本 SOP 解决：部署耗时过长、镜像臃肿、构建缓存失效、部署流程混乱、部署后无验证、隐形问题未发现
> 适用环境：服务器 43.154.111.156，路径 `/data/ai-essay-editor`
> 最后更新：2026-04-10

---

## 目录

1. [问题根因速查](#问题根因速查)
2. [标准部署流程](#标准部署流程)（P0 - 立即执行）
3. [Dockerfile 优化修复](#dockerfile-优化修复)（P0 - 立即执行）
4. [部署前检查清单](#部署前检查清单)
5. [部署后验证流程](#部署后验证流程)
6. [隐形问题监控](#隐形问题监控)
7. [部署问题自查决策树](#部署问题自查决策树)

---

## 问题根因速查

| 症状 | 根因 | 修复优先级 |
|------|------|-----------|
| **每次部署 5-10 分钟** | `docker build --no-cache` 强制全量重建 | P0 |
| **镜像 2.54GB（臃肿）** | `COPY node_modules` 复制了 devDependencies | P0 |
| **构建缓存在 7.9GB 但未利用** | `--no-cache` 导致缓存失效 | P0 |
| **镜像有 3 个 tag** | 多次 `docker tag` 操作 | P1 |
| **无 health check** | `docker-compose.prod.yml` 健康检查配置 | P1 |
| **部署后无验证** | 缺少部署后烟雾测试 | P0 |
| **worker_beat 网络断裂** | 容器网络隔离，`docker_default` vs `shenxiang-net` | P0（已修复）|

---

## 标准部署流程

### 命令行一行搞定（推荐）

```bash
# 完整部署：构建 + 启动 + 验证
ssh root@43.154.111.156 \
  "cd /data/ai-essay-editor && \
   export DOCKER_BUILDKIT=1 && \
   docker-compose -f docker-compose.prod.yml up -d --build nextjs && \
   sleep 5 && \
   docker inspect shenxiang-nextjs | grep -q '\"Health\":' && \
   curl -sf http://127.0.0.1:3000/ > /dev/null && echo 'DEPLOY OK' || echo 'DEPLOY FAILED'"
```

### 分步执行（调试用）

```bash
# 第1步：确保代码最新
ssh root@43.154.111.156 "cd /data/ai-essay-editor && git fetch origin && git reset --hard origin/main"

# 第2步：启用 buildkit 缓存
ssh root@43.154.111.156 "export DOCKER_BUILDKIT=1"

# 第3步：使用 docker-compose 构建（不用 --no-cache）
ssh root@43.154.111.156 "cd /data/ai-essay-editor && docker-compose -f docker-compose.prod.yml build nextjs"

# 第4步：启动服务
ssh root@43.154.111.156 "cd /data/ai-essay-editor && docker-compose -f docker-compose.prod.yml up -d nextjs"

# 第5步：验证
ssh root@43.154.111.156 "docker logs shenxiang-nextjs --tail 5 && curl -sf http://127.0.0.1:3000/ && echo 'OK'"
```

### 🚫 禁止的操作

| 禁止命令 | 原因 |
|---------|------|
| `docker build --no-cache` | 强制全量重建，每次浪费 5-8 分钟 |
| `docker run ...` 手动启动 | 绕过 docker-compose，无法管理容器生命周期 |
| `docker-compose up -d --no-deps` | 只重启单个服务，不重建 |
| `docker stop && docker rm && docker run` | 破坏容器状态，无回滚能力 |

---

## Dockerfile 优化修复

**当前问题**：生产镜像复制了整个 `node_modules`（659MB，包含 devDependencies），而 standalone 模式根本不需要。

### 修复后的 Dockerfile

```dockerfile
# ========== 构建阶段 ==========
FROM node:20 AS builder

WORKDIR /app

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_AUTHING_APP_ID

ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_AUTHING_APP_ID=${NEXT_PUBLIC_AUTHING_APP_ID}

# 关键优化：分离依赖安装和代码复制，利用 Docker 层缓存
COPY package*.json ./
RUN npm install -g pnpm && pnpm install --production=false

COPY . .
RUN npm run build

# ========== 生产阶段 ==========
FROM node:20 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 只复制 standalone 产物
COPY --from=builder /app/.next/standalone ./.next
COPY --from=builder /app/public ./public

# 只安装 production 依赖（不包含 devDependencies）
RUN npm install -g pnpm && pnpm install --production

EXPOSE 3000
ENTRYPOINT []

CMD ["node", ".next/standalone/server.js"]
```

**预期效果**：
- 镜像大小：从 2.54GB 降至约 800MB-1GB
- 构建缓存：package*.json 层可被缓存，代码变化时跳过依赖安装
- 构建时间：缓存命中时从 5-10 分钟降至 1-2 分钟

---

## 部署前检查清单

在本地执行 `git push` 之前，必须确认：

### 1. 本地构建验证 ✅

```bash
# 在本地（mac）执行
npm run build:clean

# 验证无错误后继续
echo "Build passed, ready to push"
```

### 2. Git 状态检查 ✅

```bash
git status
# 确保无未提交的变更
# 确保在正确的分支上
```

### 3. Commit 规范检查 ✅

```bash
# 必须包含前缀
# feat | fix | refactor | docs | test | chore | perf | ci
git log --oneline -3
```

### 4. 敏感信息检查 ✅

```bash
# 确保没有 .env 被 commit
git diff --cached --name-only | grep -E '\.env'
# 必须返回空
```

---

## 部署后验证流程

部署完成后**必须**执行以下验证，按顺序任何一步失败都要回滚：

### Step 1: 容器状态 ✅

```bash
ssh root@43.154.111.156 "docker ps --format '{{.Names}} {{.Status}}' | grep shenxiang-nextjs"
# 期望：shenxiang-nextjs Up X minutes (healthy)
```

### Step 2: 应用健康 ✅

```bash
ssh root@43.154.111.156 "curl -sf http://127.0.0.1:3000/ | head -3"
# 期望：返回 HTML，包含站点标题
```

### Step 3: 错误日志扫描 ✅

```bash
ssh root@43.154.111.156 "docker logs shenxiang-nextjs --tail 20 | grep -iE 'error|fail|exception' | grep -v '^$'"
# 期望：无 ERROR/FATAL/EXCEPTION
```

### Step 4: 关键服务联动 ✅

```bash
ssh root@43.154.111.156 "docker logs docker-worker-1 --tail 10 | grep -c ERROR"
# 期望：0

ssh root@43.154.111.156 "docker logs docker-worker_beat-1 --tail 10 | grep -c ERROR"
# 期望：0
```

### Step 5: 外部可访问性 ✅

```bash
curl -sf https://www.shenxiang.school/ -I | head -3
# 期望：HTTP/2 200
```

### Step 6: 功能冒烟测试（可选，推荐） ✅

```bash
# 测试登录页面可访问
curl -sf https://www.shenxiang.school/login -I | grep '200'

# 测试 API 端点可访问
curl -sf https://www.shenxiang.school/api/chat/models -I | head -3
```

### 回滚操作（如验证失败）

```bash
ssh root@43.154.111.156 "cd /data/ai-essay-editor && \
  docker-compose -f docker-compose.prod.yml down && \
  git reset --hard HEAD~1 && \
  docker-compose -f docker-compose.prod.yml up -d --build nextjs"
```

---

## 隐形问题监控

以下问题不会导致部署失败，但会影响长期稳定性，需要定期检查：

### 每周检查项

| 检查项 | 命令 | 问题表现 |
|--------|------|----------|
| **镜像大小** | `docker images \| grep ai-essay` | 超过 1.5GB 说明有包膨胀 |
| **构建缓存** | `docker builder df` | 缓存超过 10GB 需清理 |
| **悬空镜像** | `docker images -f dangling=true` | 有悬空镜像需清理 |
| **容器网络** | `docker network inspect shenxiang-net \| grep -c Names` | 容器数量异常变化 |
| **worker_beat** | `docker logs docker-worker_beat-1 --tail 50 \| grep ERROR` | 有 DNS/连接错误 |

### 每月清理

```bash
# 清理构建缓存
docker builder prune -f

# 清理悬空镜像
docker image prune -f

# 清理未使用网络
docker network prune -f
```

---

## 部署问题自查决策树

```
部署失败了？
│
├─ docker build 失败？
│   ├─ Next.js 构建错误 → 本地 npm run build:clean 验证
│   ├─ 缺少环境变量 → 添加 --build-arg 参数
│   └─ node_modules 缺失 → docker-compose build --no-cache nextjs
│
├─ 容器启动失败？
│   ├─ health check 失败 → 检查 NODE_ENV=production + curl 测试
│   ├─ 端口占用 → docker ps | grep 3000，找到冲突进程
│   └─ env-file 缺失 → 添加 --env-file 参数
│
├─ 部署后网站 502？
│   ├─ Next.js 容器健康但 nginx 未转发 → 检查 docker-compose 网络
│   ├─ 旧容器还在跑 → docker ps | grep nextjs（应有且仅有一个）
│   └─ nginx 缓存问题 → docker exec shenxiang-openresty nginx -s reload
│
└─ 功能异常（无错误日志）？
    ├─ 数据/积分相关 → 检查 SUPABASE_SERVICE_ROLE_KEY
    ├─ Dify 调用失败 → 检查 DIFY_API_KEY_* 环境变量
    └─ Session 问题 → 检查 Next.js standalone session 配置
```

---

## 附录：部署环境变量速查

`.env.production` 必须包含（缺少则部署前校验会拦截）：

```
NEXT_PUBLIC_SUPABASE_URL=https://rnujdnmxufmzgjvmddla.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...       # 仅容器内可见
NEXT_PUBLIC_AUTHING_APP_ID=692b0bd30de159be78db726b
DIFY_API_KEY=app-...
DIFY_API_KEY_GPT5=app-...
DIFY_API_KEY_CLAUDE=app-...
XUNHUPAY_APPSECRET=...
```

**禁止**在 `.env.production` 中出现的：
- `NEXT_PUBLIC_` 开头的密钥（应为 ANON_KEY）
- 任何以 `.local` 结尾的文件内容
