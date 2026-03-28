# ========== 构建阶段 ==========
FROM node:20-alpine AS builder

WORKDIR /app

# 安装依赖（包括 devDependencies，用于构建阶段）
COPY package*.json ./
RUN npm ci

# 复制源代码
COPY . .

# 构建
RUN --mount=type=secret,id=env,target=/app/.env \
    set -a && source /app/.env && set +a && \
    npm run build

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