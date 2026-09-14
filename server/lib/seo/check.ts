/**
 * SEO 索引状态检查（DANTE-7，T9.1/T9.4）。
 *
 * 只做"我们能观测到的部分"：对外暴露层的存活健康（robots.txt / sitemap /
 * 详情页SEO完整性）。Google/Bing/Baidu 站长后台里的索引状态由运营按
 * docs/ops/seo-index-monitoring.md 的检查清单人工核验。
 *
 * 供两处复用：
 *   - 管理后台 GET /api/admin/seo/status（页面一键检查）
 *   - 命令行 scripts/seo-index-check.ts（本地/CI 跑，输出可读报告）
 */

export interface SeoCheckItem {
  name: string;
  url: string;
  ok: boolean;
  status?: number | null;
  detail?: string;
}

export interface SitemapPageCheck {
  loc: string;
  ok: boolean;
  status?: number | null;
  urlCount?: number;
  detail?: string;
}

export interface SampleDetailCheck {
  slug: string;
  url: string;
  ok: boolean;
  status?: number | null;
  hasTitle?: boolean;
  hasCanonical?: boolean;
  hasJsonLd?: boolean;
  detail?: string;
}

export interface SeoCheckResult {
  ok: boolean;
  runAt: string;
  siteUrl: string;
  checks: SeoCheckItem[];
  sitemapPages: SitemapPageCheck[];
  sampleDetail: SampleDetailCheck[];
  summary: {
    checksOk: number;
    checksFail: number;
    sitemapOk: number;
    sitemapFail: number;
    totalUrls: number;
    detailOk: number;
    detailFail: number;
  };
}

const TIMEOUT_MS = 15_000;
const MAX_BODY = 2_000_000;

async function fetchText(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
    headers: { "user-agent": "Mozilla/5.0 (compatible; PlayWhat SEO check/1.0)" },
  });
  const body = await res.text();
  if (body.length > MAX_BODY) {
    return { status: res.status, body: body.slice(0, MAX_BODY) };
  }
  return { status: res.status, body };
}

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

export async function runSeoIndexCheck(sampleSlugs: string[] = []): Promise<SeoCheckResult> {
  const siteUrl = (process.env.PUBLIC_SITE_URL ?? "https://playwhat.cc").replace(/\/+$/, "");
  const checks: SeoCheckItem[] = [];
  const sitemapPages: SitemapPageCheck[] = [];
  const sampleDetail: SampleDetailCheck[] = [];
  let totalUrls = 0;

  // 1. robots.txt
  const robotsUrl = `${siteUrl}/robots.txt`;
  try {
    const { status, body } = await fetchText(robotsUrl);
    const sitemapRef = body === undefined ? null : (body.match(/^Sitemap:\s*\S+$/gim) ?? []);
    const ok = status === 200 && !!sitemapRef?.length;
    checks.push({
      name: "robots 可达且声明 sitemap",
      url: robotsUrl,
      ok,
      status,
      detail: ok ? `发现 ${sitemapRef!.length} 条 Sitemap 声明` : `status=${status}${body ? ", 未找到 Sitemap 声明" : ""}`,
    });
  } catch (err) {
    checks.push({ name: "robots 可达", url: robotsUrl, ok: false, detail: String(err) });
  }

  // 2. sitemap index 与各子 sitemap
  const indexUrl = `${siteUrl}/sitemap.xml`;
  try {
    const { status, body } = await fetchText(indexUrl);
    if (status !== 200 || !/<sitemapindex/i.test(body)) {
      checks.push({
        name: "sitemap 索引可达",
        url: indexUrl,
        ok: false,
        status,
        detail: status !== 200 ? `status=${status}` : "响应不是 sitemapindex",
      });
    } else {
      checks.push({ name: "sitemap 索引可达", url: indexUrl, ok: true, status, detail: "响应为 sitemapindex" });
      const childLocs = extractLocs(body);
      sitemapPages.push({ loc: indexUrl, ok: true, status, urlCount: childLocs.length });
      for (const loc of childLocs) {
        try {
          const pg = await fetchText(loc);
          const urlCount = extractLocs(pg.body).length;
          const ok = pg.status === 200 && urlCount > 0;
          totalUrls += ok ? urlCount : 0;
          sitemapPages.push({
            loc,
            ok,
            status: pg.status,
            urlCount,
            detail: ok ? `${urlCount} 条 URL` : `status=${pg.status ?? "fetch_failed"}`,
          });
        } catch (err) {
          sitemapPages.push({ loc, ok: false, detail: String(err) });
        }
      }
    }
  } catch (err) {
    checks.push({ name: "sitemap 索引可达", url: indexUrl, ok: false, detail: String(err) });
  }

  // 3. 详情页 SEO 完整性抽样（最新发布的 published 游戏）
  const slugs =
    sampleSlugs.length > 0
      ? sampleSlugs
      : [];
  for (const slug of slugs) {
    const url = `${siteUrl}/game/${slug}`;
    try {
      const { status, body } = await fetchText(url);
      const hasTitle = /<title>[^<]+</i.test(body ?? "");
      const hasCanonical = new RegExp(`rel=["']canonical["'][^>]*href=["']${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/|["'])`).test(body ?? "") ||
        new RegExp(`href=["'][^"']*${slug}[^"']*["'][^>]*rel=["']canonical["']`).test(body ?? "");
      const hasJsonLd = /application\/ld\+json/.test(body ?? "") && /VideoGame/.test(body ?? "");
      const ok = status === 200 && hasTitle && hasCanonical && hasJsonLd;
      sampleDetail.push({
        slug,
        url,
        ok,
        status,
        hasTitle,
        hasCanonical,
        hasJsonLd,
        detail: ok ? "标题/规范链接/JSON-LD 齐全" : `缺失字段: title=${hasTitle} canonical=${hasCanonical} jsonLd=${hasJsonLd}`,
      });
    } catch (err) {
      sampleDetail.push({ slug, url, ok: false, detail: String(err) });
    }
  }

  const checksOk = checks.filter((c) => c.ok).length;
  const checksFail = checks.length - checksOk;
  const sitemapOk = sitemapPages.filter((s) => s.ok).length;
  const sitemapFail = sitemapPages.length - sitemapOk;
  const detailOk = sampleDetail.filter((d) => d.ok).length;
  const detailFail = sampleDetail.length - detailOk;
  const ok = checksFail === 0 && sitemapFail === 0 && detailFail === 0;

  return {
    ok,
    runAt: new Date().toISOString(),
    siteUrl,
    checks,
    sitemapPages,
    sampleDetail,
    summary: { checksOk, checksFail, sitemapOk, sitemapFail, totalUrls, detailOk, detailFail },
  };
}