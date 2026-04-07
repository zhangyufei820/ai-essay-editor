# ========== 构建阶段 ==========
FROM node:20 AS builder

WORKDIR /app

# 接受构建参数
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_AUTHING_APP_ID

# 设置环境变量（构建时需要）
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_AUTHING_APP_ID=${NEXT_PUBLIC_AUTHING_APP_ID}

# 安装依赖（包括 devDependencies，用于构建阶段）
COPY package*.json ./
RUN npm install -g pnpm && pnpm install

# 复制源代码
COPY . .

# 构建
RUN npm run build

# ========== 生产阶段 ==========
FROM node:20 AS runner

WORKDIR /app

# 环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 从构建阶段复制 Next.js 产物（Next.js 16 输出结构）
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

# 清除默认 entrypoint
ENTRYPOINT []

# Next.js standalone 模式：静态文件在 .next/static/ 但 standalone server 在 .next/standalone/
# 需要创建符号链接让 server.js 能找到静态文件和 public 文件
RUN mkdir -p /app/.next/standalone/.next && \
    ln -s /app/.next/static /app/.next/standalone/.next/static && \
    ln -s /app/public /app/.next/standalone/public

# 启动命令 - 使用 standalone server.js 以正确加载包含 proxyClientMaxBodySize 的配置
CMD ["node", ".next/standalone/server.js"]
