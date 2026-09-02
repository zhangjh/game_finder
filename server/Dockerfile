# VPS 部署：Express API server（tsup 打包为自包含单文件）
# 依赖 Docker restart 策略做崩溃自动重启（见 server/docker-compose.yml 的 server 服务）
# 构建：docker build -f server/Dockerfile -t game-discovery-server . （在仓库根执行）
# 运行：见 docs/deployment.md
FROM node:22-alpine AS base
RUN corepack enable

# ===== 依赖安装 =====
FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY server/package.json server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

# ===== 构建 =====
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server ./server
COPY packages ./packages
WORKDIR /app/server
# tsup 会把所有依赖打进 dist/index.js（含 shared、express、pg、drizzle、dotenv、cors）
RUN pnpm build

# ===== 运行：仅需自包含的 dist，无需 node_modules =====
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME=0.0.0.0

COPY --from=builder /app/server/dist ./dist

# 非 root 运行
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nodejs \
    && chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3001
# 崩溃自动重启交给 Docker restart 策略（见 docker-compose.yml）；
# 进程内任何致命错误都会在 index.ts 的兜底处理中退出进程，从而触发容器重启
CMD ["node", "dist/index.js"]