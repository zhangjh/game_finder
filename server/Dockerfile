# VPS 部署：Next.js API server（standalone 产物）
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
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server ./server
COPY packages ./packages
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/server
RUN pnpm build

# ===== 运行 =====
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/server/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/server/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/server/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
