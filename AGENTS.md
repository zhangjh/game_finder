# 项目架构

这是一个 pnpm workspace monorepo，不使用 Next.js。

- `web/`：Vite 8 + React 19 + React Router 7 SPA，部署到 Cloudflare Pages。`web/index.html` 是 HTML 模板，`web/scripts/generate-seo.ts` 在 Vite 构建后生成 SEO 静态页面。
- `server/`：Express 5 + Drizzle ORM API 服务，由 tsup 构建并通过 Docker 部署到 VPS。
- `packages/shared/`：前后端共享的 TypeScript API 契约。

前端改动应遵循现有 Vite 配置和 React Router 路由结构；不要引入 Next.js API、目录约定或构建工具。常用校验命令为 `pnpm --filter web lint`、`pnpm --filter web build`、`pnpm --filter server lint` 和 `pnpm --filter server typecheck`。
