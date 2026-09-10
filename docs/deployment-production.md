# 玩什么 / PlayWhat 生产环境部署文档（VPS：2c4g）

> 本文面向**正式上线**，假定服务器为单台 **2c4g VPS**。本地/开发流程见 [`deployment.md`](deployment.md)。

## 架构总览

```text
用户浏览器
   │  https://playwhat.cc（主域，Cloudflare Pages 静态站 + 构建期 SEO + ads.txt）
   │  fetch https://game-api.zhangjh.cn/api/*
   ▼
顶级域名 game-api.zhangjh.cn ──> Nginx（自动 HTTPS，反代到本机 :3001）
                                 │
                                 ▼
                       Docker：server（Express，restart: unless-stopped）
                                 │
                                 ▼
                       Docker：postgres（pgvector，restart: unless-stopped）
```

- **web**：Cloudflare Pages 托管。`build:seo` 构建 SPA，并从 `VITE_API_BASE_URL=https://game-api.zhangjh.cn` 批量读取 SEO 数据，生成主域详情页 metadata、JSON-LD、robots 和 sitemap。
- **server**：Express API，Docker 容器；镜像为**自包含单文件**（不含 node_modules）。监听宿主机 `:3001`（避开 VPS 上其他服务占用的 3000）。
- **DB**：PostgreSQL 16 + pgvector，同机 Docker；只在自己 docker 内网，不对宿主机暴露端口。
- **守护**：进程内致命错误 → `index.ts` 兜底退出 → Docker `restart` 拉起（闭环）。

---

## 一、VPS 最小参考配置（2c4g）

| 资源 | 建议 | 说明 |
| --- | --- | --- |
| CPU | 2 核 | 足够串行跑 API + 定时采集/AI |
| 内存 | 4G | postgres + server + 采集任务余量充足 |
| 磁盘 | 40G+ | DB 数据卷 + 镜像 |
| 系统 | Ubuntu 22.04/24.04 | Docker 兼容好 |
| 网络 | 1Gbps 入网 | 静态 JSON API 足够 |

2c4g 下无需调低 PG 参数，保持默认即可。若未来上 1c1g，再考虑托管 DB（见 `deployment.md`）。

---

## 二、首次部署

### 1. 安装 Docker（Ubuntu）

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
newgrp docker
# 验证
docker --version && docker compose version
```

### 2. 拉取仓库

```bash
sudo mkdir -p ~/dev/game_finder && sudo chown "$USER" ~/dev/game_finder
cd ~/dev/game_finder
git clone <你的仓库地址> .
pnpm install   # 生成锁文件一致的环境（或仅用于 db:migrate/seed，见下）
```

> 生产 server 镜像用 `server/Dockerfile` 在**仓库根**构建，构建时不需要仓库代码以外的东西。

### 3. 配置生产环境变量

在 `server/` 下创建 `.env` 供 compose 读取（compose 的 `server` 服务已引用 `${ALLOWED_ORIGINS:-}` 等）：

```bash
cd ~/dev/game_finder/server
cat > .env <<'EOF'
# 注：compose 的 server 服务已把 DATABASE_URL 硬编码为 @postgres:5432，
#     因此 DATABASE_URL 无需在此重复（保留可覆盖，但不建议改）。
# Cloudflare Pages 构建专用导出密钥（两端必须一致）
SEO_EXPORT_TOKEN=<强随机密钥>
# Cloudflare Pages Production Deploy Hook（敏感 URL，仅放 VPS）
CLOUDFLARE_PAGES_DEPLOY_HOOK_URL=<Production Deploy Hook URL>

# CORS 白名单（必填！）：允许哪些前端域名调用。逗号分隔，不带末尾斜杠
# 未设置 = 放行所有来源（生产绝不允许）
ALLOWED_ORIGINS=https://playwhat.cc

# 管理后台密码（必填！没有它后台登录永远报"密码错误"）
ADMIN_PASSWORD=<强密码>

# AI（若启用 M3+/M5 AI 能力；任选 OpenAI 或兼容网关）
OPENAI_API_KEY=sk-xxx
# OPENAI_BASE_URL=https://api.openai.com/v1

# GamePix 数据源（feeds.gamepix.com 的 sid 参数）
GAMEPIX_SID=7E317

# Playgama 数据源（注册 widgets.playgama.com 后获得的 clid）
PLAYGAMA_CLID=p_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
PLAYGAMA_CATALOG_PATH=data/playgama-catalog.json
EOF
chmod 600 .env
```

> **安全提示**：`.env` 含密钥，务必 `chmod 600`。compose 的 `server` 服务已配置
> `env_file: .env`，会把 `.env` 注入容器（否则容器内读不到 `ADMIN_PASSWORD` 等，
> 后台登录会永远报"密码错误"）。生产建议同时把 `DATABASE_URL`、`ADMIN_PASSWORD`
> 用 VPS 密钥管理或 compose `environment` 覆盖，避免明文常驻。
>
> 后端同步、AI 发布、健康下线和后台公开目录操作会以 30 秒 debounce 合并触发
> Production Deploy Hook，使 Pages 重新生成详情页与 sitemap。Hook URL 等同部署凭据，禁止提交。

### 4. 数据库：初始化 Schema 与种子数据

先在 VPS 上把 postgres 起起来（只起 DB）：

```bash
cd ~/dev/game_finder/server
docker compose up -d postgres      # 等 healthcheck 变为 healthy
```

然后跑迁移 + 种子 + 导入。postgres **不对宿主机暴露任何端口**，宿主机脚本统一用**一次性 docker run 容器**连 compose 内网（`postgres:5432`）执行，挂载整个仓库复用已装的 node_modules：

```bash
cd ~/dev/game_finder/server
docker compose up -d postgres          # 等 healthcheck 变为 healthy

# 一次性容器执行前缀（连内网 postgres，挂载仓库复用 node_modules）
DR="docker run --rm --network server_default -v ~/dev/game_finder:/app -w /app/server"
DB="postgresql://postgres:postgres@postgres:5432/game_discovery"

# 迁移（建表 + 手动补充 SQL）
$DR -e DATABASE_URL="$DB" node:22 sh -c "npx drizzle-kit migrate && node scripts/apply-manual-sql.mjs"
# 注册数据源
$DR -e DATABASE_URL="$DB" node:22 node scripts/seed.mjs
# 导入 GamePix 真实游戏
$DR -e DATABASE_URL="$DB" node:22 node scripts/import-gamepix.mjs -- --limit=24
# 导入 Playgama 游戏目录（需先上传 catalog JSON 到 server/data/ 目录）
# --env-file .env 读取 PLAYGAMA_CLID / PLAYGAMA_CATALOG_PATH 等配置
$DR --env-file .env -e DATABASE_URL="$DB" node:22 npx tsx scripts/import-playgama.ts
```

> 说明：`--network server_default` 是 compose 项目 `server` 的默认网络名，`postgres` 主机名在该网络内可解析；`node:22` 为一次性运行容器（输完即删 `--rm`），不含仓库时不需在此安装任何东西。迁移/种子/导入均**幂等**，可重复执行。

### 5. 构建并启动完整 stack

```bash
cd server
docker compose up -d --build
docker compose ps
# postgres 与 server 都应显示 healthy
```

### 6. 冒烟自检（本机）

```bash
curl -s localhost:3001/healthz                 # → {"status":"ok"}
curl -s "localhost:3001/api/games?pageSize=2"  # → 游戏 JSON
```

---

## 三、Nginx 反代 + 自动 HTTPS（certbot）

在 VPS 上用 Nginx + Let's Encrypt（certbot）为 `game-api.zhangjh.cn` 签发证书并反代到本机 `:3001`。

### 1. 安装 Nginx 与 certbot（Ubuntu/Debian）

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. DNS（Cloudflare 上操作）

在 Cloudflare 的 `zhangjh.cn` 面板建一条 **A 记录**（当前 API 仍使用旧域名）：
- 类型：`A`，名称：`game-api`，IPv4：你的 VPS 公网 IP
- 代理状态：**灰云（仅 DNS）**（不要开橙色云，避免 CF 代理回源冲突）
- 保存后确认解析：`dig +short game-api.zhangjh.cn` 应返回你的 IP

### 3. 签发证书（certbot 自动配置 Nginx）

```bash
sudo certbot --nginx -d game-api.zhangjh.cn
# 按提示填邮箱、同意条款；签发成功会自动改好该站点的 ssl 配置并开启 443 重定向
```

### 4. 检查 Nginx 反代配置

certbot 会在 `/etc/nginx/sites-available/` 生成 `game-api.zhangjh.cn` 配置。确认其 `server` 块包含反代到 server（若 certbot 生成的只有静态站，则手动补 `location /`）：

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name game-api.zhangjh.cn;
    # ssl_certificate / ssl_certificate_key 由 certbot 自动填入，这里省略
    # （若为纯反代，也可把 HTTP_server 的 80 → 443 重定向交给 certbot 处理）

    # 仅暴露 API，拦截其他路径
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location = /healthz {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
    }
    location / {
        return 404;
    }
}
```

检查并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

> **DNS 提示**：`game-api` 子域在 Cloudflare 用**灰云（仅 DNS）**避免 CF 代理；`playwhat.cc` 主域保持 CF Pages 代理。

### 3. 验证 HTTPS

```bash
curl https://game-api.zhangjh.cn/healthz
curl https://game-api.zhangjh.cn/api/games?pageSize=2
curl -H "Origin: https://playwhat.cc" -I https://game-api.zhangjh.cn/api/games
# 响应应含 access-control-allow-origin: https://playwhat.cc
```

---

## 四、安全加固清单

- [ ] `ALLOWED_ORIGINS` 已设白名单（未设置会放行所有来源）
- [ ] `3001` 端口**不**对公网开放；仅本机 `127.0.0.1` 经 Nginx 暴露 `443`
  - 若云厂商安全组放行了 `3001/tcp`，请关闭；`5432` 同样只允许本机内部
- [ ] `server/.env` 权限 `600`，不进入版本控制（已在 `.gitignore`）
- [ ] 设置 `ADMIN_PASSWORD` 为随机强口令
- [ ] 以非 root 用户运行容器（Dockerfile 已用 `USER nodejs`）
- [ ] Nginx + certbot 已配置安全响应头（可选）、启用 HTTPS（自动续期）
- [ ] 定期 `docker compose pull` 更新 base 镜像（`node`、`pgvector`）并升级

---

## 五、数据库备份与恢复

### 每日自动备份（pg_dump）

用宿主机 cron 对 `game_discovery_pgdata` 卷内的库做逻辑备份：

```bash
sudo tee /etc/cron.d/gamefinder-backup >/dev/null <<'EOF'
# 每天 03:00 备份，保留 14 天
0 3 * * * root  docker exec game_discovery_pg pg_dump -U postgres -d game_discovery \
  | gzip > ~/dev/game_finder/backups/game_$(date +\%Y\%m\%d).sql.gz \
  && find ~/dev/game_finder/backups -name '*.sql.gz' -mtime +14 -delete
EOF
mkdir -p ~/dev/game_finder/backups
```

> 把备份目录 `~/dev/game_finder/backups` 再同步到异机/对象存储（如 rclone Borg/backblaze），防止整机故障。

### 恢复

```bash
# 只起 postgres，停掉可能写入的 server
cd ~/dev/game_finder/server && docker compose stop server
gunzip -c ~/dev/game_finder/backups/game_20260901.sql.gz \
  | docker exec -i game_discovery_pg psql -U postgres -d game_discovery
docker compose start server
```

---

## 六、升级与回滚

### 发布新版本（全量）

```bash
cd ~/dev/game_finder
git pull origin master          # 拉到最新
pnpm install                    # 若依赖有变
# 数据库有迁移则先执行（一次性容器连内网）
docker run --rm --network server_default -v ~/dev/game_finder:/app -w /app/server \
  -e DATABASE_URL="postgresql://postgres:postgres@postgres:5432/game_discovery" \
  node:22 sh -c "npx drizzle-kit migrate && node scripts/apply-manual-sql.mjs"
# 重新构建并滚动重启（server 会因镜像变化重建）
cd server && docker compose up -d --build
docker compose ps               # 确认 healthy
```

### 6.1 清洗低质量游戏（quality_score < 0.2 极渣批量下架）

> 迁移无需手动执行：server 容器启动时自动应用（`src/migrate.ts`，含本提交新增
> 的 `0006_same_ben_grimm.sql`），先 `docker compose up -d --build` 重建并重启
> server 即可让新列生效。下面的回填/下架脚本在**宿主机**跑一遍即可。
>
> 阈值说明：GamePix quality_score 全库接近均匀分布（中位数 ~0.58），默认阈值
> **0.2** 只清底部垃圾（约 8%）；调大（如 `-- --threshold 0.5`）会下架更多
> 中低质量游戏，谨慎使用。

先 `git pull` 拿到最新代码，再用一次性容器执行（连内网 postgres，挂载仓库复用
`server/node_modules` 里的 `pg`；等价于仓库根 `pnpm cleanup:quality`）：

```bash
cd ~/dev/game_finder/server

# 预检：会回填质量分并打印将下架数量，但不会下架游戏
# --env-file 让脚本在质量分或目录变化后触发 Pages 重建
docker run --rm --env-file .env --network server_default -v ~/dev/game_finder:/app -w /app/server \
  -e DATABASE_URL="postgresql://postgres:postgres@postgres:5432/game_discovery" \
  node:22 node scripts/cleanup-low-quality.mjs -- --dry-run

# 正式执行：回填 + quality<0.2 的已发布游戏 status='offline'
docker run --rm --env-file .env --network server_default -v ~/dev/game_finder:/app -w /app/server \
  -e DATABASE_URL="postgresql://postgres:postgres@postgres:5432/game_discovery" \
  node:22 node scripts/cleanup-low-quality.mjs
```

> 脚本幂等可重复跑；回填后日常由 `sync_games` 定时任务按 `source_updated_at`
> 变更自动刷新质量分，无需再手动执行。默认阈值 0.2。

### 6.2 本地部署游戏更新（中文游戏库 → R2 → 导入）

本地中文 H5 游戏**不进入 git**、**不落服务器**，托管在 Cloudflare R2 公开桶：

- **源码托管**：R2 公开桶（如 `r2.playwhat.cc`），游戏目录入口统一为 `index.html`。
- **元数据**：catalog JSON（`server/data/local-games.json`，build 生成）**随仓库提交**。
- **DB 地址**：`thumbnail` / `game_url` 存 R2 绝对 URL（导入时用 `LOCAL_GAMES_BASE_URL` 拼接）。

两条执行路径分别在不同机器：

**开发机（有游戏源码 MY-Games-01 / MY-Games-02）：**

```bash
pnpm build:local-catalog     # 拷贝+解析（智能选图）→ web/public/local-games/ + server/data/local-games.json
pnpm capture:local-thumbs    # 截图兜底：仍缺缩略图的游戏用 Edge 无头截图，产物 _thumb.png 并回填 JSON
pnpm publish:local-games     # 上传到 R2（幂等：HEAD 对比 size，只传新增/变更；凭据读 server/.env）
```

- `build:local-catalog` 默认源：`C:/Users/<你>/dev/MY-Games-01`（合集 01-04，c1-c4）与 `.../MY-Games-02`（c5）。
- 覆盖路径用 `LOCAL_GAMES_SOURCE_DIR`（MY-01）/ `LOCAL_GAMES_SOURCE_DIR_2`（MY-02）；`LOCAL_CATALOG_SKIP_COPY=1` 只重建 JSON 不拷贝。
- 入口统一规则：非 `index.html` 的入口（如 `2048/2048.html`）在 build 拷贝后自动重命名为 `index.html`。
- 缩略图三级策略：`icon.png` 等现成图标 → 智能选图（文件名+尺寸评分挑封面素材）→ Edge 无头截图兜底（`capture:local-thumbs`，需本机装 Edge，可用 `EDGE_PATH` 指定路径，`THUMB_CAPTURE_ONLY=<id>` 单独重截）。截图写入 `web/public/local-games/<游戏目录>/_thumb.png` 并回填 JSON；下次 `build:local-catalog` 会经 `capturedThumbUrl()` 优先复用，重建 JSON 不丢失。
- catalog 变更后记得 `git add server/data/local-games.json && git commit && git push`（VPS 导入依赖它）。

**VPS（生产 DB 在内网 docker，无游戏源码，不跑 build/publish）：**

```bash
cd ~/dev/game_finder && git pull origin master
docker run --rm --env-file .env --network server_default \
  -v ~/dev/game_finder:/app -w /app/server \
  -e DATABASE_URL="postgresql://postgres:postgres@postgres:5432/game_discovery" \
  -e LOCAL_GAMES_BASE_URL="https://r2.playwhat.cc" \
  node:22 sh -c "node scripts/seed.mjs && node scripts/import-local-games.mjs"
```

- `import:local` 幂等 upsert（按 `(source_id, source_game_id)`）：仅新增自动 `published`，已存在的保留后台上下架状态；不动 `play_count`；结束时通过 `CLOUDFLARE_PAGES_DEPLOY_HOOK_URL` 触发 Pages 重建（本地游戏详情页 + chinese-games.html）。

前置配置（见 `server/.env.example`）：`R2_ACCOUNT_ID` / `R2_BUCKET` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`（R2 S3 凭据）、`LOCAL_GAMES_BASE_URL`（桶公开域名，不带末尾斜杠）。R2 密钥若泄露务必轮换并同步更新 `.env`。

### 回滚

镜像不删，保留上一 tag（构建时给 tag，便于回滚）：

```bash
docker tag server-server:latest server-server:prev   # 升级前打一次
cd ~/dev/game_finder/server
# 若新镜像异常：直接用 docker-compose 指定旧镜像
# 在 docker-compose.yml 给 server 加 image: server-server:prev 后：
docker compose up -d server
```

> 生产建议给镜像固定 tag（如 `game-discovery-server:2026-09-02`），而不是只用 `latest`。

---

## 七、监控与告警（轻量）

- **健康探针**：Nginx 侧可直接轮询 `/healthz`；或加 external health check（UptimeRobot / Cloudflare 健康检查）盯 `https://game-api.zhangjh.cn/healthz`，异常时报警。
- **容器健康**：`docker compose ps` 每列 health；配合 `restart` 策略已能自愈。
- **日志**：
  ```bash
  docker logs -f --tail 200 game_discovery_server
  docker logs -f --tail 200 game_discovery_pg
  ```
- **磁盘/内存**：`htop`、`df -h`；或用简单的 cron 脚本在 `memory/disk` 超阈值时发提醒。

---

## 八、上线检查清单（生产）

- [ ] `https://game-api.zhangjh.cn/healthz` → `200 {"status":"ok"}`
- [ ] `https://game-api.zhangjh.cn/api/games?pageSize=2` 返回 JSON
- [ ] 跨域：`curl -H "Origin: https://playwhat.cc" -I .../api/games` 含 `access-control-allow-origin: https://playwhat.cc`
- [ ] `https://playwhat.cc/ads.txt` 返回 GamePix 内容
- [ ] 首页四区块、`/games` 筛选、`/game/{slug}`、搜索均显示真实数据（无 CORS 报错）
- [ ] `3001`/`5432` 未直接暴露公网，仅 `443` 可达
- [ ] `.env` 权限 600、`ALLOWED_ORIGINS`/`ADMIN_PASSWORD`/`SEO_EXPORT_TOKEN`/`CLOUDFLARE_PAGES_DEPLOY_HOOK_URL` 已设
- [ ] 发布新 slug 后 Pages 自动重建且详情进入 sitemap；下线后自动重建且详情返回 404 并从 sitemap 移除
- [ ] 本地游戏更新走完整链路：开发机 `build:local-catalog` → `publish:local-games` → 提交 catalog → VPS `import:local`（见 6.2）
- [ ] 每日备份 cron 已生效，且能恢复
- [ ] 镜像已打稳定 tag（非 `latest`），升级有回滚路径

---

## 九、故障排查速查

| 症状 | 排查 |
| --- | --- |
| `/healthz` 无响应 | `docker compose ps`、`docker logs game_discovery_server`；进程致命错误会退出 → 容器反复重启 |
| CORS 报错 | 检查 `ALLOWED_ORIGINS` 是否含前端域名、无末尾斜杠；Nginx 是否转发到 `:3001` |
| API 报 500 | `docker logs game_discovery_server`；多为 DB 连接/查询错误，确认 `DATABASE_URL` |
| 首页空且 `API error` | CF Pages 构建时 `VITE_API_BASE_URL` 未注入，重新部署 |
| 内存吃紧 | 2c4g 内 postgres + server 各约 150~250MB / 60~100MB；异常则看 `docker stats` 揪出进程 |
| 证书问题 | `sudo journalctl -u nginx -f`；确认 `game-api` 子域 A 记录指向本机 |

---

相关：完整基础[部署指南](deployment.md)（含前端 CF Pages、本地开发、常见问题）。