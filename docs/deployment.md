# 玩什么 / PlayWhat 部署指南

> **生产上线请看**：[生产环境部署文档](deployment-production.md)（2c4g VPS 实战：Nginx/HTTPS、安全加固、备份恢复、升级回滚、监控）。

**架构**：`web/`（Vite+React SPA）→ Cloudflare Pages 主域；`server/`（Express API）→ VPS `api` 子域；PostgreSQL + pgvector → VPS（或托管 PG）。

```text
用户浏览器 ──> CF Pages（主域，静态 SPA + ads.txt）
    │  fetch /api/*
    └──> VPS API（api 子域，Express，Docker restart 守护）──> PostgreSQL + pgvector
```

---

## 一、本地开发

```bash
pnpm install
pnpm dev:server   # http://localhost:3001（需数据库在线，见 server/.env.example）
pnpm dev:web      # http://localhost:5173
```

web 通过 `VITE_API_BASE_URL` 知道 API 地址（默认 `http://localhost:3001`）。
在 `web/.env.local` 中覆盖：

```
VITE_API_BASE_URL=http://localhost:3001
```

---

## 二、前端部署：Cloudflare Pages

### 首次创建（Git 集成，推荐）

1. 推送仓库到 GitHub（已有 `zhangjh/game_finder`）。
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git，选中仓库。
3. 构建配置：

| 项 | 值 |
| --- | --- |
| Framework preset | None（自定义） |
| Build command | `pnpm --filter web build:seo` |
| Build output directory | `web/dist` |
| Root directory | `/`（仓库根，monorepo） |

   Environment variables（Production 和 Preview 都加）：

| 变量 | 值 |
| --- | --- |
| `NODE_VERSION` | `22` |
| `VITE_API_BASE_URL` | `https://game-api.zhangjh.cn`（当前 API 域名） |
| `SEO_EXPORT_TOKEN` | 与 VPS `server/.env` 相同的强随机密钥（加密变量） |
| `SEO_MAX_OUTPUT_FILES` | `19000`（可选；按 Pages 套餐文件上限调整） |

4. Save and Deploy。`build:seo` 会携带 `SEO_EXPORT_TOKEN` 从 `VITE_API_BASE_URL` 分页读取已发布游戏，生成详情页 metadata、JSON-LD、robots 和 sitemap；API 不可用、目录在分页期间变化、数据不完整或预计文件数超过 `SEO_MAX_OUTPUT_FILES` 时，构建会失败并保留上一成功部署。
5. Pages 项目 → Settings → Builds & deployments → Deploy hooks，创建 Production Deploy Hook；将 URL 仅写入 VPS `server/.env` 的 `CLOUDFLARE_PAGES_DEPLOY_HOOK_URL`，不要提交或暴露给前端。

### 绑定主域

6. Pages 项目 → Custom domains → Add → `playwhat.cc`。
7. 按提示添加 CNAME 记录（域在 CF 托管时自动完成）。
8. 验证：`https://<你的域名>/ads.txt` 返回 GamePix 的 ads.txt 内容（`web/public/ads.txt` 会随 dist 一起部署）。

> **路由与 SEO**：构建产物包含全部已知 SPA 路径、`/game/{slug}`、8 个专题页、robots、sitemap 与顶级 `404.html`；未知路径由 Cloudflare Pages 返回真实 404。

### 每次更新

push 到 GitHub 会自动构建部署（默认监听 production 分支，可在设置中改为 master）。后端同步、AI 发布、健康下线和后台公开目录操作会在 30 秒内合并触发一次 Production Deploy Hook；如果本次同时修改了 SEO 导出接口，仍应先部署 server，再触发 Pages 构建。

---

## 三、后端部署：VPS（Docker）

### 1. 准备数据库

VPS 上拉起 PostgreSQL + pgvector：

```bash
# 在仓库 server/ 目录（docker-compose.yml）
docker compose up -d
```

或使用托管 PG（Neon/Supabase，均原生支持 pgvector）。

### 2. 初始化 Schema 与种子数据

```bash
# 本地执行（指向 VPS/托管 PG）
DATABASE_URL=postgresql://... pnpm --filter server db:migrate
DATABASE_URL=postgresql://... pnpm --filter server db:seed
```

### 3. 构建 server 镜像并运行

```bash
# 仓库根目录构建
docker build -f server/Dockerfile -t game-discovery-server .

docker run -d --name game-server \
  -p 3001:3001 \
  -e DATABASE_URL=postgresql://postgres:postgres@<db-host>:5432/game_discovery \
  -e ALLOWED_ORIGINS=https://playwhat.cc \
  -e PORT=3001 \
  -e ADMIN_PASSWORD=<强密码> \
  -e SEO_EXPORT_TOKEN=<与 Cloudflare Pages 相同的强随机密钥> \
  -e CLOUDFLARE_PAGES_DEPLOY_HOOK_URL=<Production Deploy Hook URL> \
  -e GAMEPIX_SID=7E317 \
  --restart unless-stopped \
  game-discovery-server
```

> 崩溃自动重启由 Docker `--restart` 策略承担；进程内任何致命错误都会经 `index.ts`
> 的兜底处理退出进程，从而触发容器重启闭环。
> 健康检查端点：`GET /healthz` → `200 {"status":"ok"}`。

### 3.5 定时同步游戏 / 健康巡检 / 重复检测（应用内调度）

> **自 3.6 起改为应用内调度**：服务进程启动时自动装载 `cron_jobs` 表中的任务并用
> `node-cron` 在进程内维护，**不再需要手动配置 VPS crontab**。默认任务在首次启动
> 且表为空时自动 seed，管理后台（`/admin/cron-jobs`）可启停、编辑计划、手动执行、
> 查看运行历史。

默认三个任务：

| 任务 | 类型 | 计划 | 说明 |
|------|------|------|------|
| 游戏源同步 | `sync_games` | 每 6 小时 | 全量拉取 GamePix 等源，入库/更新/下架 |
| 健康巡检 | `health_check` | 每日 04:00 | 每次 500 条，published 连续失败 ≥3 自动下线 |
| 重复检测 | `detect_duplicates` | 每日 05:00 | slug + 标题 trigram 相似度 → 人工队列 |

> `sync_games` 全量同步约 142 页（96/页，约 13.5k 款），首次耗时 ~15 分钟；后续增量
> 大部分为 unchanged，较快。源中消失的游戏在**全量**同步结束时自动标记 `offline`。
>
> 旧版 `/api/cron/*` HTTP 触发端点已移除（改用应用内调度 + 管理后台手动执行）。

同步说明：

- 新游戏入库为 `draft`，需 M4 AI 分析 + Quality Gate 后才会 `published` 上前台
- 测试小批量：管理后台手动触发时，给任务参数加 `maxPages`

### 4. 反向代理 + HTTPS（api 子域）

用你熟悉的 Nginx/Caddy。Nginx 示例（配合 certbot 自动 HTTPS，反代到 :3001）：

```nginx
server {
    server_name game-api.zhangjh.cn;
    listen 443 ssl;
    # ssl_certificate / ssl_certificate_key（certbot 自动）
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 5. 验证

```bash
curl https://game-api.zhangjh.cn/api/games          # 返回游戏 JSON
curl -H "Origin: https://playwhat.cc" -I https://game-api.zhangjh.cn/api/games
# 响应头应含 access-control-allow-origin: https://playwhat.cc
```

---

## 四、上线检查清单

- [ ] `https://主域/ads.txt` 可访问且内容为 GamePix 提供的文件
- [ ] 首页四区块（今日/热门/最新/分类）显示真实数据
- [ ] `/games` 筛选、`/game/{slug}` 详情、相似游戏正常
- [ ] 搜索关键词返回结果
- [ ] 浏览器控制台无 CORS 报错
- [ ] GamePix 后台提交域名验证

## 常见问题

**SPA 打开子路由 404？** CF Pages 默认已做 SPA fallback；若使用 wravel/直连模式需添加 `web/public/_redirects` 文件内容 `/* /index.html 200`。

**API 报 CORS 错误？** 检查 server 环境变量 `ALLOWED_ORIGINS` 是否包含前端域名（逗号分隔，不带末尾斜杠）。

**首页空且报 `API error`？** 检查 `VITE_API_BASE_URL` 是否在 CF Pages 构建环境变量里配置——Vite 在**构建时**注入该值，改完必须重新部署。
