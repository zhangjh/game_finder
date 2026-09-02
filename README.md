# Game Discovery

游戏发现与推荐平台。monorepo（pnpm workspace）双包结构：

| 包 | 栈 | 角色 | 部署 |
| --- | --- | --- | --- |
| `web/` | Vite + React SPA | 公开前台 | Cloudflare Pages（主域，含 ads.txt） |
| `server/` | Express + Drizzle ORM | API 服务（无前端文件） | VPS Docker（restart 守护） |
| `packages/shared/` | TS | 前后端共享 API 契约类型 | workspace 内联 |

架构：

```text
用户浏览器 ──> CF Pages（静态 SPA + ads.txt）
    │  fetch /api/*
    └──> VPS API（Express，Docker restart 守护）──> PostgreSQL + pgvector
```

## 本地开发

```bash
pnpm install
pnpm dev:server   # http://localhost:3001（需数据库在线）
pnpm dev:web      # http://localhost:5173
```

web 通过 `VITE_API_BASE_URL` 指向 API（默认 `http://localhost:3001`，覆盖见 `web/.env.local`）。

## 常用脚本

```bash
pnpm dev:web       # 前端开发
pnpm dev:server    # 后端开发（tsx watch）
pnpm build         # 全部构建
pnpm build:server  # 后端 tsup 打包到 server/dist
pnpm typecheck     # 后端类型检查        （@仓库根）
pnpm db:migrate    # 数据库迁移           （--filter server）
pnpm db:seed       # 种子数据             （--filter server）
```

## 健康检查与部署

- 健康检查：`GET /healthz` → `200 {"status":"ok"}`
- 部署细节见 [`docs/deployment.md`](docs/deployment.md)。