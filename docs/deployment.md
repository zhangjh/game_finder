# 部署指南

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
pnpm dev:server   # http://localhost:3000（需数据库在线，见 server/.env.example）
pnpm dev:web      # http://localhost:5173
```

web 通过 `VITE_API_BASE_URL` 知道 API 地址（默认 `http://localhost:3000`）。
在 `web/.env.local` 中覆盖：

```
VITE_API_BASE_URL=http://localhost:3000
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
| Build command | `pnpm --filter web build` |
| Build output directory | `web/dist` |
| Root directory | `/`（仓库根，monorepo） |

   Environment variables（Production 和 Preview 都加）：

| 变量 | 值 |
| --- | --- |
| `NODE_VERSION` | `22` |
| `VITE_API_BASE_URL` | `https://api.zhangjh.cn`（你的 API 域名） |

4. Save and Deploy。首次构建会失败一次也没关系——如果 monorepo 根目录没有 `package.json` 里的构建脚本，确认上表命令正确即可。

### 绑定主域

5. Pages 项目 → Custom domains → Add → `zhangjh.cn`（或你想给 GamePix 验证的域名）。
6. 按提示添加 CNAME 记录（域在 CF 托管时自动完成）。
7. 验证：`https://<你的域名>/ads.txt` 返回 GamePix 的 ads.txt 内容（`web/public/ads.txt` 会随 dist 一起部署）。

> **SPA 路由**：CF Pages 对未命中文件的路径默认回退 `index.html`，SPA 的 `/games`、`/game/xxx` 路由无需额外配置。

### 每次更新

push 到 GitHub 即自动构建部署（默认监听 production 分支，可在设置中改为 master）。

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
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://postgres:postgres@<db-host>:5432/game_discovery \
  -e ALLOWED_ORIGINS=https://zhangjh.cn \
  --restart unless-stopped \
  game-discovery-server
```

> 崩溃自动重启由 Docker `--restart` 策略承担；进程内任何致命错误都会经 `index.ts`
> 的兜底处理退出进程，从而触发容器重启闭环。
> 健康检查端点：`GET /healthz` → `200 {"status":"ok"}`。

### 4. 反向代理 + HTTPS（api 子域）

用你熟悉的 Nginx/Caddy。Caddy 示例（自动 HTTPS）：

```caddy
api.zhangjh.cn {
    reverse_proxy 127.0.0.1:3000
}
```

### 5. 验证

```bash
curl https://api.zhangjh.cn/api/games          # 返回游戏 JSON
curl -H "Origin: https://zhangjh.cn" -I https://api.zhangjh.cn/api/games
# 响应头应含 access-control-allow-origin: https://zhangjh.cn
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
