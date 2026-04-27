# syntax=docker/dockerfile:1.7

# ========== 构建阶段 ==========
FROM node:20 AS builder

WORKDIR /app

# 接受构建参数（NEXT_PUBLIC_* 变量需要在构建时嵌入）
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_AUTHING_APP_ID
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_CDN_URL
ARG NEXT_BUILD_ID
ARG DEPLOYMENT_VERSION

# 验证必填构建参数
RUN if [ -z "${NEXT_PUBLIC_SUPABASE_URL}" ]; then \
      echo "ERROR: NEXT_PUBLIC_SUPABASE_URL is required for build"; \
      exit 1; \
    fi && \
    if [ -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY}" ]; then \
      echo "ERROR: NEXT_PUBLIC_SUPABASE_ANON_KEY is required for build"; \
      exit 1; \
    fi

# 设置环境变量（构建时需要）
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_AUTHING_APP_ID=${NEXT_PUBLIC_AUTHING_APP_ID:-}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-https://www.shenxiang.school}
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL:-https://api.shenxiang.school}
ENV NEXT_PUBLIC_CDN_URL=${NEXT_PUBLIC_CDN_URL:-https://cdn.shenxiang.school}

# 安装依赖（包括 devDependencies，用于构建阶段）
COPY package*.json ./
RUN npm ci

# 复制源代码
COPY . .

# 构建
RUN --mount=type=secret,id=next_server_actions_encryption_key,required=true \
    BUILD_ID="${NEXT_BUILD_ID:-${DEPLOYMENT_VERSION:-}}" && \
    if [ -z "$BUILD_ID" ]; then \
      BUILD_ID="$(tar cf - app components hooks lib public src styles package.json package-lock.json next.config.mjs middleware.ts tsconfig.json 2>/dev/null | sha256sum | cut -c1-16)"; \
    fi && \
    SERVER_ACTIONS_KEY="$(cat /run/secrets/next_server_actions_encryption_key)" && \
    echo "Building Next.js deployment ${BUILD_ID}" && \
    NEXT_BUILD_ID="$BUILD_ID" DEPLOYMENT_VERSION="$BUILD_ID" NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$SERVER_ACTIONS_KEY" npm run build

# ========== 生产阶段 ==========
FROM node:20 AS runner

WORKDIR /app

# 环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 从构建阶段复制 Next.js standalone 产物
# 注意：不复制整个 node_modules！
# Next.js standalone 模式已将所有运行时依赖打包到 .next/standalone/ 目录
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./

# 健康检查：等待 Next.js 启动
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -sf http://localhost:3000/ || exit 1

EXPOSE 3000

# 清除默认 entrypoint
ENTRYPOINT []

# Next.js standalone 模式：静态文件在 .next/static/ 但 standalone server 在 .next/standalone/
# 需要创建符号链接让 server.js 能找到静态文件和 public 文件
RUN mkdir -p /app/.next/standalone/.next/cache/images && \
    ln -s /app/.next/static /app/.next/standalone/.next/static && \
    ln -s /app/public /app/.next/standalone/public

# 运行时创建缓存目录（overlay 文件系统需要启动时可写）
RUN echo '#!/bin/sh\nmkdir -p /app/.next/standalone/.next/cache/images /app/.next/standalone/.next/cache/fetch-cache\nexec "$@"' > /entrypoint.sh && chmod +x /entrypoint.sh

# 启动命令 - 使用 ENTRYPOINT 覆盖默认 CMD
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", ".next/standalone/server.js"]
