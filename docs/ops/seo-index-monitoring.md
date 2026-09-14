# SEO 索引监控与每周复盘（DANTE-7）

本文件沉淀"如何周期性查看索引状态、问题怎么办、如何固化到每周复盘"。
配套工具：管理后台「SEO 索引」页、`pnpm --filter server seo:check`，检查逻辑
共用 `server/lib/seo/check.ts`（对外可观测层的存活健康）。

> 局限声明：我们只能观测"对外暴露层"——robots.txt / sitemap / 详情页 SEO
> 完整性。Google / Bing / Baidu 站长后台的索引数量、被索引比例、收录是否
> 通过，必须人工登录各平台站长后台核验，本工具只是把"该看什么、多久看一次"
> 固定成清单。

## 1. 我们能自动检查什么（一键入口）

### 管理后台
- 打开 `https://playwhat.cc/admin` → 「SEO 索引」页 → 一键"重新检查"。
- 检查项：
  1. robots.txt 可达，且含 `Sitemap:` 声明；
  2. /sitemap.xml 为 sitemapindex，各子 sitemap（static / landings / games-1..N）均 200 且含 URL；
  3. 最新发布 5 个游戏的详情页，title / canonical / JSON-LD 齐全。

### 命令行
```bash
pnpm --filter server seo:check   # 需要 DATABASE_URL 环境变量（对线上库运行）
```
退出码 0 = 全绿，1 = 有失败项。

## 2. 需要人工登录站长平台核验的部分

按所在市场，登录对应站长平台：

| 平台 | 入口 | 每周至少看 | 具体指标 |
| --- | --- | --- | --- |
| Google Search Console | https://search.google.com/search-console | 4 项 | sitemap 提交状态（上次成功抓取时间）；"网页索引"里有效页面数趋势；核心指标/效果；覆盖问题（索引报错、软 404） |
| Bing Webmaster | https://www.bing.com/webmasters | 2 项 | sitemap 状态；URL 索引趋势 |
| 百度站长平台 | https://ziyuan.baidu.com | 4 项 | 站点是否已添加 sitemap（目前 robots.txt 未指向百度专用 sitemap 时，可先手动提交 sitemap.xml）；索引量；搜索资源平台"收录"与"抓取诊断"；流量统计 |

### 第一次接入检查单（重点：Google）
1. 确认站点验证仍有效（GSC 通过 Cloudflare DNS 验证；如域名/TXT 记录变更需重新验证）。
2. GSC → Sitemaps → 提交 `https://playwhat.cc/sitemap.xml` 的子地址（可提交
   `https://playwhat.cc/sitemaps/landings.xml`、`games-1.xml` 等，分批提交更稳）。
3. 上次抓取失败的大文件 `games-1.xml` 已拆分为 7 个子文件（每个 ≤2000 URL，
   修复 commit `ae98d8a`），子 sitemap 均应 200。
4. 等 Google 抓取一轮后，在"sitemaps"页确认"已发现/成功抓取"状态不再失败。
   若仍失败：打开失败详情，常见原因 = 响应非 200 / 超过 50MB / 行数超过 50,000。

### Bing 注意
Bing 对索引量从 sitemap 提交开始爬取，建议也在 Bing Webmaster 里主动提交
sitemap 索引地址，并可要求 Bing 从 GSC 导入。

### 百度注意（当前为可选项，但 DANTE-7 需要明确状态）
- 百度 sitemap 协议（`<?xml version="1.0" encoding="UTF-8"?>` + `<urlset>`）与我们
  现在是 sitemapindex 不同：百度站长平台的"sitemap"处最多能提交 9000 条 URL。
  因此要么在平台直接提交各子 sitemap 地址，要么不依赖百度自己抓（自然收录）。
- 当前策略：在百度站长平台手动提交 `https://playwhat.cc/sitemap.xml` 与 7 个子
  sitemap；若平台报格式错误，提交单个 games-*.xml 子文件即可。
- 百度收录门槛高于 Google，索引量通常更少，这不代表站点问题。

## 3. 每周复盘 SOP（适合周例会用）

每次复盘产出 `docs/campaign/每周复盘.md` 的一段（追加），含：

1. **自动检查**：跑一遍管理后台「SEO 索引」→ 全绿 or 失败项截图/记录；
2. **三个站长平台各项数字**：GSC 有效页面数、Bing 索引量、百度索引量，抄表；
3. **变化对比**：与上周对比（环比），如有下跌，排查：
   - robots.txt / _headers 是否被误改（回了 404）；
   - 游戏批量下架导致 URL 回落（正常现象）；
   - 新发内容总量变化。
4. **动作**：本周要做的"喂给搜索引擎"的输入——新 landing 页、新游戏链接、
   sitemap 重提交、内链页面（详情页 → 相关推荐）。

## 4. 常见故障与修复速查

| 症状 | 可能原因 | 处理 |
| --- | --- | --- |
| /sitemap.xml 404 | 前端未部署 / 构建产物缺 sitemap | 触发 CF Pages 部署；确认仓库 master 已包含最新 web 产物 |
| 子 sitemap 5xx | CF Pages 构建时 SEO 导出失败 | 看构建日志（generate-seo.ts），或 API `/api/games/seo/export` 是否 401 |
| 详情页没有 canonical | 新页面路由没走 Seo 组件 | 检查页面是否用 `<Seo path=.../>` |
| 详情页缺 JSON-LD | generate-seo 的 `buildVideoGameJsonLd` 抛错 | 单页重生成；看构建日志 |
| Google 长时间不收录新 URL | 新 URL 没进 sitemap / 权重低 | 确认 sitemap 已刷新，用 URL 检查工具（GSC）单独提交 1-2 条新页 |

## 5. 相关文件
- `server/lib/seo/check.ts` — 检查逻辑（管理后台 + CLI 共用）
- `server/src/routes/admin.ts` → `GET /api/admin/seo/status`
- `server/scripts/seo-index-check.ts` — CLI；web 管理页 `web/src/pages/admin/seo.tsx`