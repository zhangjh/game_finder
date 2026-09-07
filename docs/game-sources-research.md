# HTML5 游戏数据源调研文档

> 调研时间：2026-09-07
> 目的：为 GamePix 之外寻找**可申请授权、支持站内 iframe 嵌入游戏本体**的补充/替代数据源，并评估游戏质量与注册门槛（新站能否申请）。

---

## 0. 结论速览

| 排名 | 数据源 | 质量信号 | 门槛 | 站内嵌入 | 推荐度 |
| --- | --- | --- | --- | --- | --- |
| 1 | **Playgama** | ✅ 真实用户评分 + 投票数 + 审核制 | ✅ 自助注册，无流量要求 | ✅ iframe `export/game/{slug}` | ⭐⭐⭐⭐⭐ |
| 2 | **GameMonetize** | ❌ 无评分，质量低（已实测） | ✅ 零门槛 | ✅ iframe（直接给游戏文件 URL） | ⭐⭐ |
| 3 | **Gamezop** | ❌ 无评分 | ⚠️ 人工审核 + AdSense 域名要求 | ⚠️ Unique Link 不能 iframe，API 需白名单 | ⭐⭐ |
| — | GameDistribution | ❌ 公开 feed 无评分 | ❌ **有流量要求，新站无法申请** | ✅ DGI | ❌ 排除 |
| — | Poki / CrazyGames / Kizi / Y8 / CoolMath / Kongregate | — | — | ❌ 均为门户，无第三方嵌入授权 | ❌ 排除 |

**当前推荐动作**：暂不接入新源，优先把已完成的 GamePix 质量分链路上线；若增源，首选 Playgama（需用 sitemap 爬取多语言目录，注意其几乎不含中文游戏）。

---

## 1. 约束条件（重要）

### 1.1 复用现有架构

所有候选源都要映射到现有 collector 框架：

```text
server/lib/games/collectors/
  ├── gamepix.ts        # fetchPage + normalizeItem → NormalizedGameRecord
  ├── types.ts          # NormalizedGameRecord（含 qualityScore: number | null）
  └── pipeline.ts       # 去重 / AI 画像 / 落库 / 下架
```

新源 = 新增一个 adapter，`qualityScore` 字段已就绪。

### 1.2 LLM 额度限制（2026-09-07 起）

**当前 LLM 额度有限，英文游戏暂时无法进行 AI 画像分析。**

影响：
- 新增的英文游戏即使采集落库，也**不会自动进入 AI 分析**（`analyze_games` 默认停用）。
- 若新源几乎全是英文游戏，对"AI 推荐"业务价值有限。
- **中文游戏稀缺是目前增源的硬瓶颈**。

### 1.3 新站现状

- 网站仍为新站，**无流量**。
- GamePix 能够申请通过（说明 GamePix 门槛可过）。
- GameDistribution 因流量要求申请被拒。

---

## 2. 各源详细调研

### 2.1 GamePix（已接入，作为参照基线）

- 合作入口：`https://partners.gamepix.com/publishers`
- 站内 iframe 嵌入：✅ 支持
- 官方 API/feed：✅ JSON API + RSS Feed
  - `https://games.gamepix.com/games?sid={SID}&limit=1000&offset=0`
  - `https://feeds.gamepix.com/v2/json?sid={SID}&pagination=96&page=1`
  - **含 `quality_score` 字段**（0~1，全库接近均匀分布，中位数 ~0.58，是运营排名分非绝对品质分）
  - 含 `rkScore`、category、thumbnailUrl、orientation、responsive
- 授权方式：注册制，免费加入，收入分成。
- 结论：**当前唯一已接入的可授权源，质量链路已完整实现但 VPS 尚未回填。**

### 2.2 Playgama ✅ 推荐

**官方信息**：
- 合作入口：`https://widgets.playgama.com`（自助注册获得 clid）；`playgama.com/partners`（邮箱 partners@playgama.com）
- 站内 iframe 嵌入：✅ `https://playgama.com/export/game/{slug}`
- 官方 API：`GET https://playgama.com/api/v1/games/export-list`（需 clid）
  - 支持 `page` / `pageSize` / `category`（含 `recommended`、`trending_now`、`new` 等）
- 授权方式：**自助注册即得 clid，无流量要求**；注册时可选填每月流量。审核制：游戏需过 moderation（3-5 个工作日，含全浏览器/OS 测试）。
- 合作伙伴：Microsoft、YouTube、Discord、Facebook、Telegram、LINE。
- 商业模式：广告收入分成（最高 50%）。

**质量实测（2026-09-07，真实抓取）**：
- sitemap 公开可爬：`https://playgama.com/sitemap.xml` → `sitemap-games-{1..4}.xml`，robots.txt 允许（只禁 `/api/`）。
- 单个 sitemap（games-1）含 25,000 条 URL，去掉 ~9 种语言变体后 **2,778 个唯一英文 slug**。
- **有真实用户评分**（每游戏页 `<script type="application/ld+json">` 的 `aggregateRating`）：
  - 评分分布集中在 4.0~4.8（70 个样本 avg 4.27，min 3.4）；**评分本身区分度低**。
  - **投票数区分度大**（样本 median 2,454，最高 63,147 `fillwords`）→ **建议用投票数而非原始评分作为质量主信号**。
  - 低质尾部仍然存在：`game-XXXXX` 占位名、蹭 IP（`free-huggy-wuggy`、`fnaf-case-simulator`）、蹭热点（`tiktok-fall-fashion-b00b-1`）。
- **语言覆盖**：`br/de/es/fr/id/it/pl/tr` + 英文，**无中文（zh/cn）**。中文相关仅有 mahjong/xiangqi 两款英文标题游戏。
- 关键结论：无登录（clid）的路径 = **sitemap 全量拉 slug → 逐游戏页抓 `aggregateRating`**，可程序化获得含用户评分的目录。

**评估**：质量优于 GameMonetize（真评分 + 审核制），门槛低（自助注册）。**缺点：几乎不含中文游戏，LLM 额度限制下价值打折；需要逐页抓取才拿得到评分。**

---

### 2.3 GameMonetize ⚠️ 可用但质量低

**官方信息**：
- 合作入口：`https://gamemonetize.com/joinus`（注册表只有 First Name / Last Name / Company / Email / Password）
- 站内 iframe 嵌入：✅ 直接给游戏文件 URL（`html5.gamemonetize.co/{hash}/`）
- 官方 feed（**公开，无需登录**）：`https://gamemonetize.com/rssfeed.php?format=json&type=html5&amount={n}`，可选 `category` / `popularity` / `company`
- 授权方式：**零门槛注册制，无流量/审核**；45% 收入分成，Net 30 结算（最低 $30）。
- 官方声称：开发者资料经验证、编辑器每日质量检查。

**质量实测（2026-09-07，真实抓取）**：
- Feed 字段确认：`id, title, description, instructions, tags, category, url, thumb, width, height` —— **无 quality_score / rating**。
- `popularity=best/hot/popular/exclusive` 全部返回 0（过滤器失效），只有 `newest` / `editorpicks` 可用。
- "Editor Picks" 100 款抽查：**大量低质换皮仿制游戏**（Roblox Parkour、Car Parking Master 3D、海量 Obby/Truck Driving/换皮赛车）。
- 库规模声称 37,847+（但广告页写 7500+/19500+ 合作方，数字可疑）。

**评估**：零门槛 + 公开 feed + 可直接 iframe，最容易接入；但**质量差、无任何质量信号**，会拉低站内均质。仅适合快速扩量，不适合质量诉求。

---

### 2.4 Gamezop ⚠️ 门槛最高

**官方信息**：
- 合作入口：`https://business.gamezop.com/`（**需联系 Business Alliances 团队**，Account Manager 对接）
- All Games API v3：`GET https://api.gamezop.com/v3/games`（需 Bearer Token）
  - 字段：code, url, name, description, screen_orientation, has_integrated_ads, category, images —— **无评分**
- 站内嵌入：
  - **Unique Link 模式必须新开标签页，不能 iframe**（iframe 会失效）
  - API 模式支持 iframe 单个游戏，但**需 Account Manager 白名单 Property ID**
- 授权方式：人工审核制；若要跑自家域名，需 CNAME + SSL + `ads.txt`，且根域需已过 Google AdSense 审核。

**评估**：API 文档规范（OpenAPI），1000+ 游戏，多语言；但**门槛最高**（人工 + AdSense 域名要求），新站难达标，且质量无评分。

---

### 2.5 GameDistribution ❌ 排除（新站申请不到）

- 合作入口：`https://gamedistribution.com/publishers/`
- 站内 iframe 嵌入：✅ DGI 模式
- 官方 feed：✅ `https://catalog.api.gamedistribution.com/api/v2.0/rss/All/?format=json`（已实测可用），包含 Title/Description/Category/Tag/Url/Asset(多尺寸缩略图)/Width/Height/Mobile
  - **公开 feed 无 quality_score**（Developer Panel 内有 Gameplay/Ad/Engagement Score，仅开发者可见）
- **授权方式：需注册 Publisher Account 并审核，有流量要求 → 新站无资格（用户实测）**。

**评估**：库最大、最成熟，与 GamePix 高度互补；但**被新站流量门槛卡死，明确排除**。

---

### 2.6 门户平台全列 ❌（无法第三方嵌入）

以下均为**游戏门户**，只有面向"游戏开发者提交"的入口，**没有面向网站主的嵌入授权**：

| 平台 | 开发者入口 | 面向网站主嵌入 | 备注 |
| --- | --- | --- | --- |
| Poki | developers.poki.com | ❌ | 游戏要求站内 Web Exclusive，无数据/嵌入 API |
| CrazyGames | developer.crazygames.com | ❌ | **有 Sitelock 防外嵌**，游戏仅限站内运行 |
| Kizi | kizi.com/developers | ❌ | 无 Publisher API |
| Y8 | developer.y8.com | ⚠️ 零散 embed 代码，非正式计划 | 无目录 API |
| CoolMath | developers.coolmathgames.com | ❌ | 以非独家买断运行游戏 |
| Kongregate | 开发者门户 | ❌ | 仅站内运行 |

---

## 3. 各源质量数据实测对比

### 3.1 Playgama 评分抽样（70 款随机，2026-09-07）

```text
评分分布：  avg 4.27   min 3.4   max 4.8
          ≥4.5：17   ≥4.0：66   <4.0：4
投票数分布：avg 7,500   median 2,454
          ≥1000 票：45   ≥5000 票：25   ≥10000 票：16
```

代表样本：

| 游戏 | 评分 | 票数 |
| --- | --- | --- |
| bank-robbery | 4.8 | 25,132 |
| highway-traffic | 4.7 | 29,409 |
| fillwords | 4.1 | 63,147 |
| spider-solitaire-1-2-and-4-suits | 4.1 | 59,847 |
| oneline | 3.4 | 10,079 |

### 3.2 GameMonetize Editor Picks 抽样（100 款，2026-09-07）

- 无评分字段。
- 标题 100 款中大量为低质仿制：`Roblox Parkour Adventure`、`City Car Parking Master 3D`、`Obby +1 Double Jump`、`Toilet Rush Race Game` 等。
- 结论：**editor picks ≠ 优质**，该平台的"精选"过滤不可作为质量信号。

---

## 4. 中文游戏问题（当前核心矛盾）

| 数据源 | 中文游戏量 | 说明 |
| --- | --- | --- |
| GamePix | 极少/无 | 以英文为主，质量分与中文无关 |
| Playgama | **几乎无** | 语言覆盖 br/de/es/fr/id/it/pl/tr，无 zh |
| GameMonetize | 极少/无 | FRIV/4399 有中文开发者，但标题以英文为主 |
| Gamezop | 无 | 印度系平台 |

**结论**：目前所有候选"可授权嵌入源"都**以英文游戏为主**。PRD 的策略是"英文游戏本体 + 中文体验层包装"（`metadata_language=zh, game_language=en`）。

在 LLM 额度受限、英文游戏无法分析的前提下：
- 若坚持等"中文游戏源"，可留意 **MiniGame（微游出海，business.minigame.com）**、**4399 开放平台（open.4399.cn）**、**7k7k** —— 但它们主要面向**开发者提交游戏 / 渠道发行**，不是面向网站主的"一键嵌入授权源"，且个体网站主接入门槛与结算方式需另行核实。
- 若恢复"英文可分析"（额度充足），则 **Playgama** 是当前最佳增源（真实评分 + 低门槛），按 §2.2 的 sitemap 路径即可接。

---

## 5. 建议路线

### 短期（当前，LLM 额度受限）

1. **不新增英文源**。新增英文游戏无法过 AI 画像，只会白白膨胀 draft 库。
2. **优先上线已完成的 GamePix 质量链路**（VPS）：
   1. `git pull` + `docker compose up -d --build`（自动跑 migration 0006）
   2. 运行 `cleanup:quality`（默认阈值 0.2，仅清极渣尾部）
   3. 验证 `/high-quality`（threshold 0.8）与后台排序有数据
3. 在后台手动触发一次 `analyze_games`（暂停的 draft 游戏，若额度允许）确认画像质量。

### 中期（恢复英文分析能力 / 额度充足）

4. **接入 Playgama**：sitemap（免注册）拉 slug → 逐游戏页抓 `aggregateRating`（用户评分 + 投票数）→ 新增 `collectors/playgama.ts` adapter → 投票数映射 `sourceQualityScore` → 走 pipeline。
5. 若需要官方稳定链路，再自助注册 widgets.playgama.com 拿 clid，用 `export-list` API（还可得 `recommended/trending_now` 精选分类）。

### 远期

6. 调研中文源（MiniGame / 4399 / 7k7k）面向网站主的可用性 —— **待 LLM 额度与产品阶段更成熟后再评估**。

---

## 附录 A：验证用命令（Playgama sitemap + 评分抓取）

```powershell
# 1. sitemap 索引
Invoke-WebRequest -Uri 'https://playgama.com/sitemap.xml' -UseBasicParsing

# 2. 单个游戏 sitemap（25,000 URL / 约 2,778 唯一 slug）
#    https://playgama.com/sitemaps/v1/releases/{release}/sitemap-games-1.xml

# 3. 游戏页 → 用户评分
#    GET https://playgama.com/game/{slug}
#    提取 <script type="application/ld+json"> 中:
#    "aggregateRating":{"worstRating":1,"bestRating":5,"ratingValue":4.3,"ratingCount":1501}
```

## 附录 B：验证用命令（GameMonetize feed）

```powershell
# 匿名可访问，无需登录
Invoke-WebRequest -Uri 'https://gamemonetize.com/rssfeed.php?format=json&type=html5&amount=100' -UseBasicParsing

# 分类/数量过滤
# &category=Puzzles&amount=100
# &popularity=newest|editorpicks  (best/hot/popular/exclusive 均返回 0，勿用)
```