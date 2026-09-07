# Playgama 数据源接入实施计划

**依据：** `docs/game-sources-research.md`（数据源调研结论）
**前置：** 用户已在 widgets.playgama.com 自助注册并获取 **clid**（无流量门槛，注册即得），提供官方采集接口
**目标：** 接入 Playgama 作为独立数据源，作为高品质专区的主要内容来源；GamePix 保留为基础数据池
**状态：** 规划（待用户提供 clid 后实施）

---

## 0. 背景与决策

### 0.1 为什么接 Playgama

- 已实测确认：Playgama 有**真实用户评分**（`rating` 0~5 + `ratingCount` 投票数），比 GamePix 的 `quality_score`（运营排名分）更接近"品质"信号。
- 高质量专区需要"人工精选/高品质"内容支撑，GamePix 只能当基础池（其编辑器精选本身质量平平）。
- Playgama 门槛低：**自助注册即得 clid，无流量要求**（与 GameDistribution 完全不同）。
- 站内 iframe 嵌入：✅ `https://playgama.com/export/game/{slug}`，无需自行托管游戏文件。

### 0.2 语种策略（用户明确要求）

> **采集数据源仅限英文语种，其他语言不要。站点本身做中英双语。**

- Playgama catalog 官方支持多语言（`br/de/es/fr/id/it/pl/tr` 等），**只采集英文游戏**（`metadata_language=en` 入口或英文标题）。
- 后续 AI 分析（`metadata_language` 变 `zh`）延后——LLM 额度恢复后再跑 `analyze_games`。
- 现有 pipeline 对 `game_language` / `metadata_language` 均硬编码 `"en"`（`pipeline.ts:144-145`），与"仅英文"目标天然一致，**无需改 pipeline 的默认值**。

### 0.3 质量信号映射

| Playgama 字段 | 现有字段 | 映射方式 |
| --- | --- | --- |
| `rating` (0~5) | `sourceQualityScore` (0~1) | `rating / 5` 归一化 |
| `ratingCount`（投票数） | `sourceQualityScore` | **建议以投票数作为主信号**（区分度更大），或用 `rating` 提权 |
| 分类 `recommended` / `trending_now` | 质量辅助 | 可作为人工审核/精选的参考标记 |

调研结论：Playgama 评分集中在 4.0~4.8，**原始评分区分度低**；投票数（median 2,454，最高 6.3 万）区分度大。因此 `sourceQualityScore` 的生成策略需要在实施时确认（见 §4 待确认项）。

---

## 1. 架构改动

```text
新增：
  server/lib/games/collectors/playgama.ts      # Playgama adapter
  server/env 或 .env                            # PLAYGAMA_CLID / PLAYGAMA_API_BASE

修改：
  server/lib/games/collectors/index.ts          # 注册 playgama adapter
  docs（部署文档补充新源同步说明）
```

无需数据库迁移：
- `game_sources` 行由 pipeline `ensureSourceRow()` 首次同步时自动创建。
- 游戏表不需要新列（`sourceQualityScore` 列已存在，直接复用）。

---

## 2. Adapter 实现要点（`collectors/playgama.ts`）

实现 `SourceAdapter` 接口（`collectors/types.ts:60-66`）：

```typescript
interface SourceAdapter {
  code: string;            // "playgama"
  name: string;            // "Playgama"
  fetchPage(page: number): Promise<NormalizedGameRecord[] | null>;
}
```

### 2.1 fetchPage

- 调用官方 catalog API：`GET {PLAYGAMA_API_BASE}/api/v1/games/export-list?page={page}&pageSize={n}`
  - 需带 clid（按官方文档，clid 用于跟踪收益与统计，通常拼接在 `gameURL` 参数或 header）。
  - 具体鉴权方式**以用户提供的 SDK 文档为准**，实施时先读接口文档。
- 返回空数组 / `null` → 视为末页结束。

### 2.2 normalizeItem（英文过滤核心）

`raw → NormalizedGameRecord | null`，**若非英文则返回 `null` 跳过**：

- 标题 / 描述为英文（或按接口返回的语言字段判断）。
- 跳过 `game-XXXXX` 占位 slug、明显非英文、缺必要字段（无 `gameURL` / 无缩略图）的记录。

字段映射：

| Playgama 字段 | NormalizedGameRecord 字段 |
| --- | --- |
| `id` / slug | `sourceGameId` |
| `title`（en）| `titleOriginal` |
| slug（kebab-case）| `slug` |
| `description`（en）| `descriptionOriginal` |
| 封面图 URL | `thumbnail` |
| `gameURL`（`https://playgama.com/export/game/{slug}`）| `gameUrl` |
| `genre` / `category` | `category`（英） |
| `rating`+`ratingCount` | `qualityScore`（0~1，见 §0.3）|
| — | `portrait/landscape/mobile/desktop`（按接口字段）|

> **英文过滤实现位置**：在 `normalizeItem` 中过滤，保持 pipeline 通用性。若接口返回的 catalog 本身已是英文（`export-list` 默认路径），过滤可能退化为"兜底选项"。

### 2.3 注册

`index.ts` 的 `ADAPTER_FACTORIES` 增加：

```typescript
playgama: createPlaygamaAdapter,
```

Adapter 工厂内检查 `PLAYGAMA_CLID` 缺失时抛异常，被 `allAdapters()` 吞掉跳过（与现有模式一致）。

---

## 3. 实施步骤

| # | 任务 | 说明 | 验收 |
| --- | --- | --- | --- |
| 3.1 | 阅读 Playgama 官方 SDK/API 文档 | 用户提供接口后，先读文档确认鉴权、分页、字段、语言参数 | 文档要点记录到本文件附录 |
| 3.2 | 配置环境变量 | `.env`（本地）+ 部署配置：`PLAYGAMA_CLID`、`PLAYGAMA_API_BASE`；补 `.env.example` | 配置齐全且不泄露密钥 |
| 3.3 | 实现 `playgama.ts` adapter | `fetchPage` + `normalizeItem`（含英文过滤 + 评分映射）| 单元可跑，分页正常 |
| 3.4 | 注册 adapter | `index.ts` 加入 `ADAPTER_FACTORIES` | `allAdapters()` 包含 playgama |
| 3.5 | 本地采集验证 | 跑同步任务（小批量），确认：落库、`source_game_id` 唯一、`sourceQualityScore` 映射正确、无英文游戏或错误记录 | `game_sources` 多出 playgama 行；新增游戏为 draft；非英文全部被过滤 |
| 3.6 | typecheck + build | server + 全仓 | CI 通过 |
| 3.7 | 部署文档更新 | `docs/deployment-production.md` 增加 Playgama 同步说明 | 文档可照做 |
| 3.8 | VPS 部署 + 触发同步 | `git pull` + `docker compose up -d --build` + 手动触发 sync | 线上 `game_sources` 出现 playgama 数据 |

---

## 4. 待确认项（实施前）

1. **`sourceQualityScore` 生成策略**：
   - A. `rating / 5`（直接归一，简单）
   - B. 投票数对数归一（区分度大，需定义公式）
   - C. 两者融合（如 `rating` 为主 + 最小投票数置信门槛，如 `<50` 票不算数）

2. **是否把 Playgama 的 `recommended` / `trending_now` 分类落到某个字段**，用于后台/高品质专区的"精选"标记（现 schema 无此列，可能要新增或复用 tags）。

3. **过滤强度**：只采 `metadata_language=en` 的官方英文路径？还是全量采 + adapter 内英文判断过滤？——取决于接口是否提供语言参数。

4. **高品质专区策略**：是否把 `/high-quality` 的筛选逻辑从"只看 `minQualityScore`"扩为"Playgama 用户评分高（rating≥4.5 且票数≥阈值）优先 + GamePix quality_score≥0.8 兜底"。

---

## 5. 上线推广前置清单（接入后）

接入完成、数据落库后，开始推广前仍需完成：

- [ ] Playgama 游戏走 AI 画像（LLM 额度恢复后触发 `analyze_games`），通过 Quality Gate 才 published。
- [ ] **人工策展机制**：后台 `featured` 标记 + 首页/高品质区优先展示（调研结论：机器筛选不如人工精选靠谱）。
- [ ] VPS 回填 GamePix `source_quality_score`（`cleanup:quality`）。
- [ ] 确认高品质专区有足够内容量（当前 531 款，接入 Playgama 后质量层应明显提升）。

---

## 附录：Playgama 关键接口/事实速查（调研实测）

- 主站：`https://playgama.com`
- 合作/注册：`https://widgets.playgama.com`（自助注册 → clid）；`playgama.com/partners`（邮箱 partners@playgama.com）
- Catalog API：`GET /api/v1/games/export-list`（`page` / `pageSize` 必填，`category` 可选，含 `recommended` / `trending_now` / `new`）
- iframe 嵌入：`https://playgama.com/export/game/{slug}`
- sitemap（备用免注册路径）：`https://playgama.com/sitemap.xml` → `sitemap-games-{1..4}.xml`，单独 games-1 含 25,000 URL / 约 2,778 唯一英文 slug
- 用户评分（每游戏页 JSON-LD）：`"aggregateRating":{"worstRating":1,"bestRating":5,"ratingValue":4.3,"ratingCount":1501}`
- 语言覆盖：`br/de/es/fr/id/it/pl/tr` + en，**无 zh**
- 审核制：游戏需过 moderation（3-5 工作日，全浏览器测试）
- 与 GameMonetize 对比：Playgama 有真评分 + 审核制；GameMonetize 质量低、feed 无评分、排行过滤全失效