# MVP 任务拆解与实施计划

**依据：** `docs/prd_1.0`
**范围：** V0.1 ~ V0.4（PRD 第 47/48 章，单人开发 7 天节奏）
**技术栈：** TypeScript + Express（API server）+ Vite/React（web SPA）+ Drizzle ORM + PostgreSQL + pgvector + OpenAI SDK + Docker + GitHub Actions

---

## 0. 总览

| 里程碑 | 对应版本 | PRD 天 | 主题 | 核心产出 |
| --- | --- | --- | --- | --- |
| M0 | — | Day 1 前半 | 项目骨架与基础设施 | 可运行的空项目 + 数据库 + CI |
| M1 | V0.1 | Day 1 后半 | 前台页面（模拟数据） | 首页 / 列表 / 详情三页跑通 |
| M2 | V0.1 | Day 2 | 数据模型与后台 | 全量 Schema + CRUD + 管理后台 |
| M3 | V0.1 | Day 3 | 游戏采集 | GamePix/Gamezop 自动同步 |
| M4 | V0.1~V0.2 | Day 4 | AI 游戏理解 | Game Profile + 中文化 + Embedding |
| M5 | V0.2~V0.3 | Day 5 | AI Game Finder | 完整推荐 Pipeline + AI 搜索 |
| M6 | V0.4 | Day 6 | 行为埋点与 GameScore | 数据飞轮启动 |
| M7 | — | Day 7 | SEO 与上线 | 可对外发布 |

依赖关系：`M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7`，串行为主；M6 的前端埋点可与 M5 并行开发。

每个任务标注：**[P0]** MVP 必须 / **[P1]** 尽量做 / **[P2]** 可推迟。

---

## M0 项目骨架与基础设施（Day 1 上午）

### T0.1 [P0] Next.js 项目初始化

- `create-next-app`（TypeScript + App Router + Tailwind + ESLint）
- 建立项目结构（按 PRD 第 40 章）：

```text
game-discovery/
├── app/            # page.tsx / games / game / search / api / admin
├── components/
├── lib/            # db / ai / games / recommendation / search / analytics
├── jobs/           # sync-games / analyze-games / health-check
├── drizzle/
└── public/
```

- `.env.example`：`DATABASE_URL` / `AI_API_KEY` / `CRON_SECRET`

**验收：** `pnpm dev` 启动无报错；目录结构与 PRD 一致。

### T0.2 [P0] Docker Compose 数据库

- `docker-compose.yml`：`pgvector/pgvector:pg16` 镜像，本地端口映射
- 初始化脚本中启用 `CREATE EXTENSION vector;`

**验收：** `docker compose up -d` 后可连接，`SELECT '[1,2,3]'::vector` 成功。

### T0.3 [P0] Drizzle 接入

- 安装 `drizzle-orm` + `drizzle-kit`，配置 `drizzle.config.ts`
- 建立迁移工作流：`drizzle-kit generate` / `migrate`
- `lib/db/index.ts` 单例连接

**验收：** 一张测试表的迁移可生成、可回滚、可重复执行。

### T0.4 [P1] CI 流水线

- GitHub Actions：`lint` + `typecheck` + `build`，PR 触发

**验收：** 提交 PR 自动跑 CI 并通过。

### T0.5 [P1] 代码规范

- ESLint + Prettier + `strict: true`；提交前 husky/lint-staged（可选）

---

## M1 前台页面骨架（Day 1 下午，模拟数据）

### T1.1 [P0] 全局布局与设计基调

- 顶栏（Logo / 搜索框 / 分类入口）、底部（备案、版权）
- 中文优先的 UI 文案体系、设计 token（颜色/圆角/间距）
- 响应式：移动端优先（核心用户多为手机浏览器，PRD 第 4 章）

### T1.2 [P0] 游戏卡片组件

按 PRD 第 23 章实现：缩略图、名称、评分、时长、心情/难度标签、设备支持标识、"立即玩"按钮。此组件是全站复用原子，先做精。

### T1.3 [P0] 首页

按 PRD 第 32 章信息架构：AI Finder 占位区（M5 填充）+ 快捷需求 + 今日推荐 + 热门 + 最新 + 分类。

### T1.4 [P0] 游戏列表页 `/games`

- 筛选：分类 / 难度 / 时长 / 人数 / 设备 / 语言（PRD 第 33 章）
- 排序：推荐 / 热门 / 最新 / 评分
- 先用 mock 数据 + URL searchParams 驱动筛选状态

### T1.5 [P0] 游戏详情页 `/game/{slug}`

按 PRD 第 31 章结构：标题、游戏区（iframe 占位）、简介、为什么值得玩、特点、适合人群、参数、类似游戏占位。

### T1.6 [P0] 游戏启动

- "立即玩" → 全屏/内嵌 iframe 加载 `game_url`
- 加载态、失败态、横竖屏提示

### T1.7 [P1] 多语言 i18n（浏览器语种自动切换中英文）

- 建立轻量 i18n 框架（`zh` / `en` 两组 key-value 文案资源 + `useI18n` hook）
- 进入时根据浏览器 `navigator.language` 自动切到 `zh` / `en`，并记住用户选择（localStorage）
- 覆盖站点 UI 文案（顶栏 / 底部 / 首页 / 列表筛选 / 详情页 / 搜索 / 游戏启动等）与 SEO metadata 的 `lang` 属性
- 区分「界面语种」与「游戏内容语种」（`metadata_language` / `game_language`，PRD 第 8 章）：界面切英文不代表把游戏元数据也译为英文，游戏数据的中文化走 M4 的 AI 画像管道
- 首版仅中英文；默认中文、英文兜底

**里程碑验收：** 换浏览器语种（或改本地偏好）后，界面文案在中文/英文间自动切换；手动选择能被记住。

---

## M2 数据模型与管理后台（Day 2）

### T2.1 [P0] 核心 Schema（PRD 第 10~16、41 章）

按依赖顺序建表：

1. `game_sources`：来源平台（name / base_url / api_type / status / last_sync_at）
2. `games`：全字段——基础信息（id / source / source_game_id / title / title_original / slug / description×3 / thumbnail / game_url / developer …）+ 类型（genre / sub_genre / tags[] / mechanics[]）+ 体验属性（difficulty / cognitive_load / complexity / pace / stress_level / replayability，1~5）+ 时长（session_length_min/max）+ 玩家模式 + 设备 + 操作方式 + 语言（metadata_language / game_language）+ 状态（draft / published / offline / pending）
3. `game_embeddings`：`vector(1536)` 列 + HNSW 索引
4. `game_scores`：各分量 + 加权总分
5. `game_relations`：相似游戏关系（game_id / related_id / similarity）
6. `game_categories`、`game_tags`、`game_mechanics`（枚举/字典表）
7. `user_events`：事件类型 / 匿名 user_id / game_id / 推荐上下文 / 时间戳
8. `recommendation_requests`（原始输入 + 解析后的 GameIntent）/ `recommendation_results`（返回列表 + 点击反馈）

关键决策：

- `games` 上建 `(source, source_game_id)` 唯一约束做去重
- 体验属性用 `smallint` + CHECK (1~5)，不用 enum，便于后续调参
- slug 唯一索引；FTS 用 `tsvector` 生成列（中文需 `zhparser` 或先用简易 bigram，见风险 R2）

### T2.2 [P0] 游戏 CRUD 与查询层

- `lib/games/`：列表查询（筛选+排序+分页）、slug 详情、分类树
- Seed 脚本：灌入 20~50 条手工 mock 游戏数据（含完整画像字段），供 M1~M5 开发自测

### T2.3 [P0] 管理后台 `/admin`（PRD 第 36 章）

- 简单密码保护（环境变量 + cookie，不上账号体系）
- 游戏列表（筛选/状态）、游戏详情（查看 AI 画像）、上下架
- 数据源页：Source / Status / Last Sync / Game Count / Error Count

### T2.4 [P1] 后台 AI 管理页

AI 分析结果展示 + 人工修改 + 重新分析按钮（逻辑在 M4 完成后接线）。

**里程碑验收：** 从管理后台可创建/编辑/上下架一款游戏，前台立即可见；mock 游戏数据稳定可复现。

---

## M3 游戏采集（Day 3）

### T3.1 [P0] 数据源商务确认（PRD 第 7.2 章）

注册并逐项确认 GamePix、Gamezop 的 10 条标准（第三方发行 / 自有域名 / API / 自定义 UI / 详情页 / SEO 索引 / 广告 / Revenue Share / 最低流量 / 结算主体）。**这是阻塞性任务，Day 2 就应并行发出申请。**

### T3.2 [P0] 采集器框架

- `lib/games/collectors/`：Source Adapter 接口（拉取 feed → 标准化 GameRecord）
- 通用流程编排（PRD 第 35 章）：Collect → Normalize → Deduplicate → Detect Changes → 落库为 `draft` 状态

### T3.3 [P0] GamePix Adapter

### T3.4 [P0] Gamezop Adapter

### T3.5 [P0] 变更检测与下架

- 已存在且无变化 → 跳过
- 有变化 → 更新 + 标记待重新分析
- 源中消失 → `offline`

### T3.6 [P0] 定时任务

- `jobs/sync-games.ts`：每 6 小时（生产用系统 cron / GitHub Actions schedule 触发 `CRON_SECRET` 保护的 API route）
- `jobs/health-check.ts`：游戏 URL HTTP 状态、缩略图可访问性巡检；异常自动下线（PRD 第 34 章）

### T3.7 [P1] 重复游戏 Merge

基于 slug 规范化 + 标题相似度的粗去重，标记疑似重复供后台人工 Merge。

**里程碑验收：** 跑一次同步后，真实游戏数据入库并在前台可见；二次同步幂等；手动从源下架一款游戏后，站点对应游戏自动下线。

---

## M4 AI 游戏理解（Day 4）

### T4.1 [P0] Game Profile 分析 Pipeline

- `lib/ai/analyze-game.ts`：输入原始元数据（title/description/tags/screenshots URL），LLM 按 PRD 第 17 章 JSON Schema 输出：genre / subGenre / 六项 1~5 体验属性 / sessionLength / mood / mechanics
- 结构化输出校验（zod），校验失败自动重试一次，仍失败标记 `pending`
- **中文化**：同一调用输出 `title_zh` / `description_zh`；`metadata_language=zh`、`game_language` 如实标注（PRD 第 8 章，不误导用户）

### T4.2 [P0] Embedding 生成

- 拼接 Game Metadata + 中文描述 + Mechanics + 体验画像 → OpenAI Embeddings → 写入 `game_embeddings`
- `jobs/analyze-games.ts`：批量处理 draft 状态游戏（限流 + 失败重试 + 费用日志）

### T4.3 [P0] Quality Gate

- 必填字段完整性、体验属性在值域内、缩略图可用 → 通过则 `published`
- 不通过 → `pending` 进后台人工队列

### T4.4 [P0] 相似游戏预计算

- 对已发布游戏两两（或每游戏 Top-K）计算向量相似度 + 结构化加权（Genre/SubGenre/Mechanics/Difficulty/Pace/SessionLength/CognitiveLoad，PRD 第 27 章）→ 写入 `game_relations`
- 随 analyze job 增量更新

### T4.5 [P1] 后台接线

T2.4 的 AI 管理页接入真实数据：查看画像、人工修正、单游戏重新分析、Embedding 重建。

**里程碑验收：** 同步一批新游戏后 24 小时内自动完成"入库 → AI 画像 → 中文化 → Embedding → 质检 → 发布 → 相似关系"全流程；前台详情页显示中文元数据和"你可能还喜欢"。

---

## M5 AI Game Finder——推荐 Pipeline（Day 5，产品核心）

### T5.1 [P0] Intent Parser

- `lib/recommendation/intent-parser.ts`：自然语言 → GameIntent JSON（zod 校验）
- 覆盖 PRD 第 5/22 章全部场景：时间 / 心情(mood) / 认知负担 / 难度 / 人数 / 设备 / 横竖屏 / 参考游戏(similar_to) / 负向偏好(negative_preference) / 随便推荐
- 参考游戏名解析：FTS 匹配站内游戏，命中则取其画像作为相似基准
- 解析失败/模糊时降级为快捷条件交互，绝不空转

### T5.2 [P0] 候选召回（Hybrid，PRD 第 42 章）

五路并行合并去重：

1. SQL 条件召回（硬条件：时长 / 人数 / 设备 / 状态）
2. PostgreSQL FTS（关键词）
3. pgvector 语义召回（intent 与参考游戏向量）
4. 热门游戏兜底
5. 相似游戏扩展（similar_to 场景）

### T5.3 [P0] 过滤与排序

- Hard Filter：玩家人数 / 设备 / 游戏状态 / 可用性
- Hybrid Ranking 初版：`Score = Intent Match + Semantic Similarity + GameScore + Popularity + Freshness`（权重先拍脑袋定值，写成配置便于 M6 后调参）
- 输出 Top 3~5（不返回几十款）

### T5.4 [P0] 推荐理由生成

- 基于结构化数据模板化生成（非 LLM 自由发挥），必要时 LLM 润色；每款必须可解释（PRD 第 44 章）

### T5.5 [P0] 推荐 API 与前端

- `POST /api/recommend`：输入文本 / 快捷条件，返回卡片列表 + 理由
- 首页 AI Finder UI 落地（PRD 第 20 章）：大输入框 + "帮我找游戏" + 快捷 chips（⚡5分钟 / 😌放松 / 🧠烧脑 / 👥双人 / 📱手机 / 🎲随便来一个）
- 快捷条件 → 预定义 GameIntent，不走 LLM（省成本、零延迟）
- `recommendation_requests` / `recommendation_results` 落库

### T5.6 [P0] AI 搜索

- 搜索框输入长句（如"类似 Vampire Survivors 但简单一点"）→ 走同一 Intent → Pipeline；短词走传统 FTS（PRD 第 29 章）

### T5.7 [P0] E2E 验收 Case 1~3（PRD 第 51 章）

编写自动化测试（Playwright 或 API 层测试），三个 Case 全部通过：

1. "我只有10分钟，想玩轻松一点的，最好手机也能玩"——10 项检查全过
2. "有没有类似植物大战僵尸，但是简单一点的"——7 项检查全过
3. "两个人玩，最好不用下载"——`players>=2 && multiplayer && web`

**里程碑验收：** 三个 E2E Case 通过；推荐结果每款均有理由；空结果/解析失败有友好降级。

---

## M6 行为埋点与 GameScore（Day 6）

### T6.1 [P0] 匿名用户标识

- Cookie 写入匿名 `user_id`（uuid），服务端读取注入埋点上下文；无账号体系

### T6.2 [P0] 前端埋点

- `lib/analytics/track.ts` + `<AnalyticsProvider>`
- 事件全集（PRD 第 25 章）：game_impression / click / start / 30s / 2min / 5min / exit / replay / favorite / recommendation_impression / recommendation_click
- 游戏页计时器驱动 30s/2min/5min 事件；`navigator.sendBeacon` 保证退出不丢
- `POST /api/events` 批量写入 `user_events`（含推荐上下文 request_id，用于归因）

### T6.3 [P0] GameScore v0 计算

- `jobs/compute-scores.ts`（每日）：按 PRD 第 24 章权重 30/20/20/15/10/5 计算 → `game_scores`
- 冷启动：无行为数据时用质量分 + 数据完整度兜底

### T6.4 [P0] 核心指标看板

- Admin 数据分析页：游戏启动率 / 推荐 CTR / 推荐成功率(≥5min/Start) / 重玩率 / D1 回访 / 热门游戏 / 热门查询（北极星：Successful Discovery Rate，PRD 第 52/53 章）

**里程碑验收：** 真人走一遍"搜索→点击→玩 6 分钟→退出"后，后台看板各指标数字正确变化；次日 GameScore 更新。

---

## M7 SEO 与上线（Day 7）

### T7.1 [P0] 技术 SEO

- Metadata 模板（首页/列表/详情，Open Graph）
- `app/sitemap.ts` 动态生成全量游戏 + 分类页；`robots.txt`；canonical
- 详情页 JSON-LD（VideoGame 类型）

### T7.2 [P0] SEO Landing Pages

按 PRD 第 30 章落地 8 个核心页：`/games/tower-defense`、`/games/roguelike`、`/games/2-player`、`/games/5-minute`、`/games/10-minute`、`/games/relaxing`、`/games/mobile` 等。每页必须含：需求说明 + 筛选 + 推荐 + AI 解释 + 列表 + 相关游戏（不做低价值程序化页面）。

### T7.3 [P0] 部署

- `Dockerfile`（Express + tsup，Docker restart 守护）+ docker-compose 生产编排（app + postgres + cron）
- 环境变量与密钥管理；生产域名 + HTTPS

### T7.4 [P0] 上线检查清单

- E2E Case 1~3 在生产环境复测
- 同步任务 / 分析任务 / 质检任务在生产 cron 正常触发
- 埋点事件在生产落库
- 错误监控（Sentry 免费档即可）+ 基础告警

**里程碑验收：** 生产环境通过全部 E2E Case；6 小时后首次自动同步成功；看板有真实数据。

---

## 任务清单（执行顺序）

- [x] T0.1 项目初始化 + 目录结构（已迁移为 Vite/React + Express monorepo）
- [x] T0.2 Docker Compose PostgreSQL + pgvector
- [x] T0.3 Drizzle 接入与迁移工作流
- [ ] T0.4 CI（lint/typecheck/build）
- [x] T0.5 代码规范
- [x] T1.1 全局布局（移动端优先）
- [x] T1.2 游戏卡片组件
- [x] T1.3 首页（AI Finder 占位）
- [x] T1.4 列表页（筛选/排序）
- [x] T1.5 详情页
- [x] T1.6 游戏启动（iframe，已接真实 GamePix 游戏）
- [ ] T1.7 多语言 i18n（浏览器语种自动切换中英文）
- [x] **T3.1 数据源商务确认（GamePix 已接入；Gamezop 待接）**
- [x] T2.1 核心数据库 Schema（11 张表）
- [x] T2.2 CRUD + 查询层 + Seed（不再含 mock：真游戏走 import:gamepix）
- [ ] T2.3 管理后台（游戏/数据源）
- [ ] T2.4 后台 AI 管理页（壳）
- [x] T3.2 采集器框架（lib/games/collectors/ + /api/cron/sync-games，取代 import-gamepix.mjs 临时脚本）
- [x] T3.3 GamePix Adapter（json feed 采集器，含变更检测；import-gamepix.mjs 可退役）
- [x] T3.4 Gamezop Adapter（暂缓：商务未确认，GamePix 已够 MVP）
- [x] T3.5 变更检测与自动下架（随 T3.2 pipeline 实现并实测：unchanged 跳过 / 变更更新+reanalysis / 消失 offline / 复活 draft）
- [x] T3.6 定时同步 + 健康巡检（/api/cron/sync-games 每 6h + /api/cron/health-check 每日，连续失败≥3 自动下线）
- [x] T3.7 重复游戏 Merge（slug 规范化 + pg_trgm 标题相似度 → suspected_duplicates 人工队列；真实数据检出 143 对，Merge 操作待 T2.3 后台接线）
- [ ] T4.1 AI 画像分析 + 中文化
- [ ] T4.2 Embedding 生成（批量 job）
- [ ] T4.3 Quality Gate
- [ ] T4.4 相似游戏预计算
- [ ] T4.5 后台 AI 管理接线
- [ ] T5.1 Intent Parser
- [ ] T5.2 五路候选召回
- [ ] T5.3 Hard Filter + Hybrid Ranking
- [ ] T5.4 推荐理由生成
- [ ] T5.5 推荐 API + 首页 AI Finder UI
- [ ] T5.6 AI 搜索接入
- [ ] T5.7 E2E Case 1~3 自动化测试
- [ ] T6.1 匿名用户 ID
- [ ] T6.2 全量前端埋点
- [ ] T6.3 GameScore v0 计算 job
- [ ] T6.4 指标看板
- [ ] T7.1 Metadata / Sitemap / Robots / JSON-LD
- [ ] T7.2 SEO Landing Pages（8 个）
- [ ] T7.3 Docker 部署
- [ ] T7.4 上线检查清单

## 风险与预案

| # | 风险 | 影响 | 预案 |
| --- | --- | --- | --- |
| R1 | GamePix/Gamezop 审批慢或被拒（最低流量要求） | M3 阻塞 | Day 2 即提交申请；备选提前调研 GameMonetize（P1）/ Famobi；最坏情况先用人工导入 feed 过 M3~M7 |
| R2 | PostgreSQL 中文 FTS 需要 zhparser，托管 PG 常不支持 | 搜索体验 | MVP 降级：标题/标签用 bigram tsvector 或 `ILIKE` + pgvector 语义召回补位，效果通常够用 |
| R3 | LLM 画像输出不稳定/成本失控 | M4 延期 | zod 严格校验 + 温度调低 + 只分析新增/变更游戏；缓存原始输出便于重放 |
| R4 | 7 天单人节奏过于乐观（尤其 M5） | 整体延期 | M5 内部再排优先级：Intent + 召回 + 排序为 P0，理由生成可先模板化；M6 埋点提前并行 |
| R5 |  iframe 嵌入被游戏源 X-Frame-Options 拦截 | 游戏无法启动 | 采集期即检测响应头，被拦的源改用新窗口打开方案 |

## 明确不做（MVP 期间反复自查）

PRD 第 39/50 章红线：无微服务、无 Redis/ES/Kafka、无用户账号/评论/社区、无会员、无 App/小程序。任何时候 tempted，回到 PRD 第 55 章原则：**时间只花在"让用户更快找到想玩的游戏"上。**
