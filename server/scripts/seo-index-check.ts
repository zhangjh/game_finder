/**
 * SEO 索引状态命令行检查（DANTE-7，T9.1/T9.4）。
 *
 * 用法：
 *   pnpm --filter server seo:check            # 用线上已发布游戏抽样
 *   SEARCH_CONSOLE_NOTE=false pnpm ...        # 关闭打印机外提示
 *
 * 检查项（只查"可观测层"）：robots.txt 可达性与 Sitemap 声明、sitemap 索引
 * 与各子 sitemap、抽样详情页的 title/canonical/JSON-LD。
 * Google/Bing/Baidu 站点的索引状态需人工登录站长平台核验，见
 * docs/ops/seo-index-monitoring.md 的每周复盘清单。
 *
 * 退出码：0 = 全部通过；1 = 存在失败项。
 */
import "dotenv/config";

import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { games } from "@/lib/db/schema";
import { runSeoIndexCheck } from "@/lib/seo/check";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL 未配置，无法抽样线上游戏详情页");
    process.exit(1);
  }
  const rows = await db
    .select({ slug: games.slug })
    .from(games)
    .where(eq(games.status, "published"))
    .orderBy(desc(games.publishedAt), desc(games.id))
    .limit(5);
  const slugs = rows.map((r) => r.slug as string);

  const result = await runSeoIndexCheck(slugs);
  const S = (ok: boolean) => (ok ? "PASS" : "FAIL");

  console.log(`\nSEO 索引状态检查 — ${result.siteUrl} （${result.runAt}）\n`);
  for (const c of result.checks) {
    console.log(`  [${S(c.ok)}] ${c.name}  ${c.url}`);
    if (c.detail) console.log(`        ${c.detail}`);
  }
  for (const s of result.sitemapPages) {
    console.log(`  [${S(s.ok)}] sitemap  ${s.loc}`);
    if (s.detail) console.log(`        ${s.detail}`);
  }
  console.log(`\n  子 sitemap 累计收录 URL：${result.summary.totalUrls}\n`);
  for (const d of result.sampleDetail) {
    console.log(`  [${S(d.ok)}] 详情页 ${d.slug}`);
    if (d.detail) console.log(`        ${d.detail}`);
  }

  console.log(
    `\n汇总：基础检查 ${result.summary.checksOk}/${result.summary.checksOk + result.summary.checksFail}` +
      `，sitemap ${result.summary.sitemapOk}/${result.summary.sitemapOk + result.summary.sitemapFail}` +
      `（${result.summary.totalUrls} URL），详情页 ${result.summary.detailOk}/${result.summary.detailOk + result.summary.detailFail}`,
  );
  console.log(
    `Google/Bing/Baidu 索引状态请登录站长平台核验（清单见 docs/ops/seo-index-monitoring.md）。`,
  );
  if (!result.ok) {
    console.error("存在失败项，请排查后重新检查");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});