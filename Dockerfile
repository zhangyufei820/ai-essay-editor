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

# 从构建阶段精准复制 Standalone 产物及静态文件夹 (注意目标路径的修改)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

# Standalone 模式的终极启动命令
CMD ["node", "server.js"]
