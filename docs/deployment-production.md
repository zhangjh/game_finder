# 生产环境部署文档（VPS：2c4g）

> 本文面向**正式上线**，假定服务器为单台 **2c4g VPS**。本地/开发流程见 [`deployment.md`](deployment.md)。

## 架构总览

```text
用户浏览器
   │  https://zhangjh.cn（主域，Cloudflare Pages SPA + ads.txt）
   │  fetch https://api.zhangjh.cn/api/*
   ▼
顶级域名 api.zhangjh.cn ──> Caddy（自动 HTTPS，反代到本机 :3000）
                                │
                                ▼
                      Docker：server（Express，restart: unless-stopped）
                                │
                                ▼
                      Docker：postgres（pgvector，restart: unless-stopped）
```

- **web**：静态 SPA，Cloudflare Pages 托管。构建时把 `VITE_API_BASE_URL=https://api.zhangjh.cn` 注入。
- **server**：Express API，Docker 容器；镜像为**自包含单文件**（不含 node_modules）。
- **DB**：PostgreSQL 16 + pgvector，同机 Docker。
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
sudo mkdir -p /opt/game-finder && sudo chown "$USER" /opt/game-finder
cd /opt/game-finder
git clone <你的仓库地址> .
pnpm install   # 生成锁文件一致的环境（或仅用于 db:migrate/seed，见下）
```

> 生产 server 镜像用 `server/Dockerfile` 在**仓库根**构建，构建时不需要仓库代码以外的东西。

### 3. 配置生产环境变量

在 `server/` 下创建 `.env` 供 compose 读取（compose 的 `server` 服务已引用 `${ALLOWED_ORIGINS:-}` 等）：

```bash
cd /opt/game-finder/server
cat > .env <<'EOF'
# 注：compose 的 server 服务已把 DATABASE_URL 硬编码为 @postgres:5432，
#     因此 DATABASE_URL 无需在此重复（保留可覆盖，但不建议改）。
# CORS 白名单（必填！）：允许哪些前端域名调用。逗号分隔，不带末尾斜杠
# 未设置 = 放行所有来源（生产绝不允许）
ALLOWED_ORIGINS=https://zhangjh.cn

# 定时任务保护密钥（采集/AI 等 cron 通过 ?secret= 调用）
CRON_SECRET=<生成一个随机强串>
# 管理后台密码（若启用）
ADMIN_PASSWORD=<强密码>

# AI（若启用 M3+/M5 AI 能力；任选 OpenAI 或兼容网关）
OPENAI_API_KEY=sk-xxx
# OPENAI_BASE_URL=https://api.openai.com/v1
EOF
chmod 600 .env

# 生成随机 CRON_SECRET
openssl rand -hex 24
```

> **安全提示**：`.env` 含密钥，务必 `chmod 600`；compose 默认也会把 `server/.env` 读入容器。生产建议同时把 `DATABASE_URL`、`CRON_SECRET` 用 VPS 密钥管理或 compose 环境变量覆盖，避免明文常驻。

### 4. 数据库：初始化 Schema 与种子数据

先在 VPS 上把 postgres 起起来（只起 DB）：

```bash
cd /opt/game-finder/server
docker compose up -d postgres      # 等 healthcheck 变为 healthy
```

然后跑迁移 + 种子（指向 **容器网络内** 的 DB 地址，从宿主机用映射端口也可）：

```bash
# 方式一（推荐）：走 compose 内网，从宿主机执行
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/game_discovery"
pnpm db:migrate
pnpm db:seed
```

迁移与种子均**幂等**，可重复执行。

### 5. 构建并启动完整 stack

```bash
cd server
docker compose up -d --build
docker compose ps
# postgres 与 server 都应显示 healthy
```

### 6. 冒烟自检（本机）

```bash
curl -s localhost:3000/healthz                 # → {"status":"ok"}
curl -s "localhost:3000/api/games?pageSize=2"  # → 游戏 JSON
```

---

## 三、Caddy 反代 + 自动 HTTPS

在主域 2c4g VPS 上直接用 Caddy（利用其自动签发/续期证书，替代 certbot）。

### 1. 安装 Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

### 2. Caddyfile

```caddy
api.zhangjh.cn {
    reverse_proxy 127.0.0.1:3000

    # 可选：只暴露 API，拦截非 API 路径
    @not_api not path /api/* /healthz
    respond @not_api 404

    # 请求体限制（默认足够，可按需调整）
    request_body { max_size 2MB }

    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy no-referrer
    }
}

# 仅当你在 VPS 还想顺带托管主域静态站（否则主域交给 CF Pages）：
# zhangjh.cn { root * /var/www/game-finder; file_server }
```

检查并重载：

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

> **DNS**：`api.zhangjh.cn` 的 A 记录指向 VPS 公网 IP。若域名在 Cloudflare 托管，为 `api` 子域建一条 **灰色（仅 DNS）** A 记录避免 CF 代理回源冲突；`zhangjh.cn` 主域名继续保持 CF Pages 代理。

### 3. 验证 HTTPS

```bash
curl https://api.zhangjh.cn/healthz
curl https://api.zhangjh.cn/api/games?pageSize=2
curl -H "Origin: https://zhangjh.cn" -I https://api.zhangjh.cn/api/games
# 响应应含 access-control-allow-origin: https://zhangjh.cn
```

---

## 四、安全加固清单

- [ ] `ALLOWED_ORIGINS` 已设白名单（未设置会放行所有来源）
- [ ] `3000` 端口**不**对公网开放；仅本机 `127.0.0.1` 经 Caddy 暴露 `443`
  - 若云厂商安全组放行了 `3000/tcp`，请关闭；`5432` 同样只允许本机内部
- [ ] `server/.env` 权限 `600`，不进入版本控制（已在 `.gitignore`）
- [ ] 设置 `CRON_SECRET`、`ADMIN_PASSWORD` 为随机强口令
- [ ] 以非 root 用户运行容器（Dockerfile 已用 `USER nodejs`）
- [ ] Caddy 加安全响应头（见上）、启用 HTTPS（自动）
- [ ] 定期 `docker compose pull` 更新 base 镜像（`node`、`pgvector`）并升级

---

## 五、数据库备份与恢复

### 每日自动备份（pg_dump）

用宿主机 cron 对 `game_discovery_pgdata` 卷内的库做逻辑备份：

```bash
sudo tee /etc/cron.d/gamefinder-backup >/dev/null <<'EOF'
# 每天 03:00 备份，保留 14 天
0 3 * * * root  docker exec game_discovery_pg pg_dump -U postgres -d game_discovery \
  | gzip > /opt/game-finder/backups/game_$(date +\%Y\%m\%d).sql.gz \
  && find /opt/game-finder/backups -name '*.sql.gz' -mtime +14 -delete
EOF
mkdir -p /opt/game-finder/backups
```

> 把备份目录 `/opt/game-finder/backups` 再同步到异机/对象存储（如 rclone Borg/backblaze），防止整机故障。

### 恢复

```bash
# 只起 postgres，停掉可能写入的 server
cd /opt/game-finder/server && docker compose stop server
gunzip -c /opt/game-finder/backups/game_20260901.sql.gz \
  | docker exec -i game_discovery_pg psql -U postgres -d game_discovery
docker compose start server
```

---

## 六、升级与回滚

### 发布新版本（全量）

```bash
cd /opt/game-finder
git pull origin master          # 拉到最新
pnpm install                    # 若依赖有变
# 数据库有迁移则先执行
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/game_discovery"
pnpm db:migrate
# 重新构建并滚动重启（server 会因镜像变化重建）
cd server && docker compose up -d --build
docker compose ps               # 确认 healthy
```

### 回滚

镜像不删，保留上一 tag（构建时给 tag，便于回滚）：

```bash
docker tag server-server:latest server-server:prev   # 升级前打一次
cd /opt/game-finder/server
# 若新镜像异常：直接用 docker-compose 指定旧镜像
# 在 docker-compose.yml 给 server 加 image: server-server:prev 后：
docker compose up -d server
```

> 生产建议给镜像固定 tag（如 `game-discovery-server:2026-09-02`），而不是只用 `latest`。

---

## 七、监控与告警（轻量）

- **健康探针**：Caddy 侧可直接轮询 `/healthz`；或加 external health check（UptimeRobot / Cloudflare 健康检查）盯 `https://api.zhangjh.cn/healthz`，异常时报警。
- **容器健康**：`docker compose ps` 每列 health；配合 `restart` 策略已能自愈。
- **日志**：
  ```bash
  docker logs -f --tail 200 game_discovery_server
  docker logs -f --tail 200 game_discovery_pg
  ```
- **磁盘/内存**：`htop`、`df -h`；或用简单的 cron 脚本在 `memory/disk` 超阈值时发提醒。

---

## 八、上线检查清单（生产）

- [ ] `https://api.zhangjh.cn/healthz` → `200 {"status":"ok"}`
- [ ] `https://api.zhangjh.cn/api/games?pageSize=2` 返回 JSON
- [ ] 跨域：`curl -H "Origin: https://zhangjh.cn" -I .../api/games` 含 `access-control-allow-origin: https://zhangjh.cn`
- [ ] `https://zhangjh.cn/ads.txt` 返回 GamePix 内容
- [ ] 首页四区块、`/games` 筛选、`/game/{slug}`、搜索均显示真实数据（无 CORS 报错）
- [ ] `3000`/`5432` 未直接暴露公网，仅 `443` 可达
- [ ] `.env` 权限 600、`ALLOWED_ORIGINS`/`CRON_SECRET`/`ADMIN_PASSWORD` 已设
- [ ] 每日备份 cron 已生效，且能恢复
- [ ] 镜像已打稳定 tag（非 `latest`），升级有回滚路径

---

## 九、故障排查速查

| 症状 | 排查 |
| --- | --- |
| `/healthz` 无响应 | `docker compose ps`、`docker logs game_discovery_server`；进程致命错误会退出 → 容器反复重启 |
| CORS 报错 | 检查 `ALLOWED_ORIGINS` 是否含前端域名、无末尾斜杠；Caddy 是否转发到 `:3000` |
| API 报 500 | `docker logs game_discovery_server`；多为 DB 连接/查询错误，确认 `DATABASE_URL` |
| 首页空且 `API error` | CF Pages 构建时 `VITE_API_BASE_URL` 未注入，重新部署 |
| 内存吃紧 | 2c4g 内 postgres + server 各约 150~250MB / 60~100MB；异常则看 `docker stats` 揪出进程 |
| 证书问题 | `sudo journalctl -u caddy -f`；确认 `api` 子域 A 记录指向本机 |

---

相关：完整基础[部署指南](deployment.md)（含前端 CF Pages、本地开发、常见问题）。