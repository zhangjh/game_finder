/**
 * 流量/渠道看板查询层（DANTE-7，T9.6）。
 *
 * 依赖 `page_view` 事件（context 携带 path/referrer/utm_*）与既有
 * recommendation_* / game_* 事件，对自然流量做渠道归因：
 *   - 渠道拆解：直接 / 搜索引擎 / 社交 / 外链 / 其它 UTM
 *   - 渠道转化漏斗：用户 → 启动 → 玩满 5 分钟（PRD §26/§52）
 *   - 热门落地页（含带 UTM 落地）
 *   - D1/D3/D7 留存（用户首次活跃日期分群）
 *   - AI 推荐 vs 传统搜索的行为对比
 */
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/** db.execute 的 rows 是 Record<string, unknown>，按列契约收敛为具体类型 */
function asRows<T>(rows: readonly Record<string, unknown>[]): T[] {
  return rows as unknown as T[];
}

/**
 * 渠道分类。与 SQL 内 CASE 保持同一套规则：
 * 优先看 utm_source（推广内容入口），其次 referrer（自然访问），最后归 direct。
 */
export function channelFromSource(utmSource: string | null | undefined, referrer: string | null | undefined): string {
  const s = (utmSource ?? "").trim().toLowerCase();
  if (!s) {
    const r = (referrer ?? "").toLowerCase();
    if (!r) return "direct";
    if (/(weixin\.qq\.com|xiaohongshu|bilibili|weibo\.com|douyin|tiktok)/.test(r)) return "social";
    if (/(baidu\.com|google\.|bing\.com|sogou\.com|so\.com|yandex)/.test(r)) return "search";
    return "referral";
  }
  if (["wechat", "weixin", "xiaohongshu", "redbook", "bilibili", "weibo", "douyin", "tiktok", "x", "twitter", "qq", "moments"].includes(s)) return "social";
  if (["baidu", "google", "bing", "sogou", "360", "so360", "yandex", "sm"].includes(s)) return "search";
  return "utm_other";
}

const CHANNEL_CASE = sql`
  CASE
    WHEN lower(coalesce(context->>'utm_source','')) IN ('wechat','weixin','xiaohongshu','redbook','bilibili','weibo','douyin','tiktok','x','twitter','qq','moments') THEN 'social'
    WHEN lower(coalesce(context->>'utm_source','')) IN ('baidu','google','bing','sogou','360','so360','yandex','sm') THEN 'search'
    WHEN coalesce(context->>'utm_source','') <> '' THEN 'utm_other'
    WHEN lower(coalesce(context->>'referrer','')) LIKE '%weixin.qq.com%'
      OR lower(coalesce(context->>'referrer','')) LIKE '%xiaohongshu%'
      OR lower(coalesce(context->>'referrer','')) LIKE '%bilibili%'
      OR lower(coalesce(context->>'referrer','')) LIKE '%weibo.com%'
      OR lower(coalesce(context->>'referrer','')) LIKE '%douyin%' THEN 'social'
    WHEN lower(coalesce(context->>'referrer','')) LIKE '%baidu.com%'
      OR lower(coalesce(context->>'referrer','')) LIKE '%google.%'
      OR lower(coalesce(context->>'referrer','')) LIKE '%bing.com%'
      OR lower(coalesce(context->>'referrer','')) LIKE '%sogou.com%'
      OR lower(coalesce(context->>'referrer','')) LIKE '%so.com%'
      OR lower(coalesce(context->>'referrer','')) LIKE '%yandex%' THEN 'search'
    WHEN coalesce(context->>'referrer','') = '' THEN 'direct'
    ELSE 'referral'
  END
`;

export interface ChannelRow {
  channel: string;
  pv: number;
  uv: number;
}

export interface SourceRow {
  source: string;
  pv: number;
  uv: number;
}

export interface TrafficDailyRow {
  date: string;
  pv: number;
  uv: number;
}

export interface ChannelFunnelRow {
  channel: string;
  users: number;
  starts: number;
  fiveMin: number;
  startsPerUser: number;
  successRate: number;
}

export interface LandingPageRow {
  path: string;
  users: number;
  utmUsers: number;
}

export interface UtmLandingRow {
  path: string;
  source: string;
  medium: string | null;
  pv: number;
  uv: number;
}

export interface RetentionRow {
  cohortDate: string;
  users: number;
  d1: number;
  d3: number;
  d7: number;
  d1Rate: number;
  d3Rate: number;
  d7Rate: number;
}

export interface DiscoveryCompareRow {
  group: "ai" | "keyword";
  label: string;
  users: number;
  requests: number;
  impressions: number;
  clicks: number;
  starts: number;
  fiveMin: number;
  ctr: number;
  successRate: number;
}

/** 单位换算 + 百分比归一（避免除零，空数据返回 0%） */
function pct(a: number, b: number): number {
  if (!b) return 0;
  return Math.round((a / b) * 10000) / 100;
}

/** PV/UV 来源渠道分布（page_view 事件） */
export async function getChannelBreakdown(days = 30): Promise<{
  channels: ChannelRow[];
  sources: SourceRow[];
}> {
  const since = new Date(Date.now() - days * 86400_000);
  const channels = await db.execute(sql`
    select ${CHANNEL_CASE}::text as channel,
      count(*)::int as pv,
      count(distinct user_id)::int as uv
    from user_events
    where event_type = 'page_view' and created_at >= ${since}
    group by 1
    order by pv desc
  `);
  const sources = await db.execute(sql`
    select
      case
        when coalesce(context->>'utm_source','') <> '' then context->>'utm_source'
        when lower(coalesce(context->>'referrer','')) = '' then 'direct'
        else 'referral'
      end as source,
      count(*)::int as pv,
      count(distinct user_id)::int as uv
    from user_events
    where event_type = 'page_view' and created_at >= ${since}
    group by 1
    order by pv desc
  `);
  return {
    channels: asRows<ChannelRow>(channels.rows),
    sources: asRows<SourceRow>(sources.rows),
  };
}

/** 最近 days 天 PV/UV 每日趋势 */
export async function getTrafficDaily(days = 30): Promise<TrafficDailyRow[]> {
  const since = new Date(Date.now() - (days - 1) * 86400_000 - 3600_000);
  const rows = await db.execute(sql`
    select to_char(created_at, 'YYYY-MM-DD') as date,
      count(*)::int as pv,
      count(distinct user_id)::int as uv
    from user_events
    where event_type = 'page_view' and created_at >= ${since}
    group by 1
    order by 1
  `);
  return asRows<TrafficDailyRow>(rows.rows);
}

/**
 * 渠道转化漏斗：按「用户首次 page_view」把用户归到渠道，
 * 再统计该渠道用户在窗口内的启动与玩满 5 分钟行为。
 */
export async function getChannelFunnel(days = 30): Promise<ChannelFunnelRow[]> {
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db.execute(sql`
    with first_pv as (
      select distinct on (user_id) user_id,
        ${CHANNEL_CASE}::text as channel
      from user_events
      where event_type = 'page_view' and created_at >= ${since}
      order by user_id, created_at
    )
    select fp.channel,
      count(distinct ue.user_id)::int as users,
      count(*) filter (where ue.event_type = 'game_start')::int as starts,
      count(*) filter (where ue.event_type = 'game_5min')::int as five_min
    from first_pv fp
    join user_events ue on ue.user_id = fp.user_id
      and ue.created_at >= ${since}
    group by fp.channel
    order by users desc
  `);
  return asRows<{ channel: string; users: number; starts: number; five_min: number }>(
    rows.rows,
  ).map((r) => ({
    channel: r.channel,
    users: r.users,
    starts: r.starts,
    fiveMin: r.five_min,
    startsPerUser: Math.round((r.starts / (r.users || 1)) * 100) / 100,
    successRate: pct(r.five_min, r.starts),
  }));
}

/** 热门落地页（每用户首次访问页面）+ 带 UTM 的落地明细 */
export async function getLandingPages(days = 30, limit = 10): Promise<{
  top: LandingPageRow[];
  withUtm: UtmLandingRow[];
}> {
  const since = new Date(Date.now() - days * 86400_000);
  const top = await db.execute(sql`
    with first_pv as (
      select distinct on (user_id) user_id,
        coalesce(context->>'path','/') as path,
        coalesce(context->>'utm_source','') as utm_source
      from user_events
      where event_type = 'page_view' and created_at >= ${since}
      order by user_id, created_at
    )
    select path,
      count(*)::int as users,
      count(*) filter (where utm_source <> '')::int as utm_users
    from first_pv
    group by path
    order by users desc
    limit ${limit}
  `);
  const withUtm = await db.execute(sql`
    select coalesce(context->>'path','/') as path,
      coalesce(context->>'utm_source','') as source,
      context->>'utm_medium' as medium,
      count(*)::int as pv,
      count(distinct user_id)::int as uv
    from user_events
    where event_type = 'page_view'
      and created_at >= ${since}
      and coalesce(context->>'utm_source','') <> ''
    group by 1, 2, 3
    order by pv desc
    limit ${limit}
  `);
  return {
    top: asRows<LandingPageRow>(top.rows),
    withUtm: asRows<UtmLandingRow>(withUtm.rows),
  };
}

/** D1/D3/D7 留存：以用户首次活跃日期为 cohort，计算第 1/3/7 天回访用户 */
export async function getRetention(days = 60): Promise<RetentionRow[]> {
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db.execute(sql`
    with first_act as (
      select user_id, min(created_at::date) as d0
      from user_events
      where created_at >= ${since}
      group by user_id
    ),
    cohorts as (
      select d0::text as cohort_date, count(*)::int as users
      from first_act group by d0
    ),
    returns as (
      select fa.d0,
        count(distinct fa.user_id) filter (where ue.created_at::date = fa.d0 + 1)::int as d1,
        count(distinct fa.user_id) filter (where ue.created_at::date = fa.d0 + 3)::int as d3,
        count(distinct fa.user_id) filter (where ue.created_at::date = fa.d0 + 7)::int as d7
      from first_act fa
      join user_events ue on ue.user_id = fa.user_id
      group by fa.d0
    )
    select c.cohort_date, c.users, r.d1, r.d3, r.d7
    from cohorts c
    join returns r on r.d0::text = c.cohort_date
    order by c.cohort_date desc
  `);
  return asRows<
    Omit<
      RetentionRow,
      "d1Rate" | "d3Rate" | "d7Rate"
    >
    & { cohort_date: string }
  >(rows.rows).map((r) => ({
    cohortDate: r.cohort_date,
    users: r.users,
    d1: r.d1,
    d3: r.d3,
    d7: r.d7,
    d1Rate: pct(r.d1, r.users),
    d3Rate: pct(r.d3, r.users),
    d7Rate: pct(r.d7, r.users),
  }));
}

/**
 * AI 推荐 vs 传统搜索的行为对比。
 * - ai：产生 recommendation_impression / recommendation_click（或用过 AI 输入）的用户
 * - keyword：产生 search_query 事件（传统关键词搜索）的用户
 * 比各自在窗口内的曝光→点击→启动→5min 转化。
 */
export async function getDiscoveryCompare(days = 30): Promise<DiscoveryCompareRow[]> {
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db.execute(sql`
    with cohorts as (
      select 'ai' as grp, user_id from user_events
        where event_type in ('recommendation_impression','recommendation_click')
          and created_at >= ${since}
      union
      select 'keyword' as grp, user_id from user_events
        where event_type = 'search_query' and created_at >= ${since}
    ),
    users_grp as (
      select grp, count(distinct user_id)::int as users
      from cohorts group by grp
    ),
    agg as (
      select c.grp, ue.event_type,
        count(distinct ue.user_id)::int as users
      from cohorts c
      join user_events ue on ue.user_id = c.user_id and ue.created_at >= ${since}
      group by c.grp, ue.event_type
    )
    select ug.grp, ug.users,
      coalesce(sum(a.users) filter (where a.event_type = 'game_impression'), 0)::int as impressions,
      coalesce(sum(a.users) filter (where a.event_type = 'game_click'), 0)::int as clicks,
      coalesce(sum(a.users) filter (where a.event_type = 'game_start'), 0)::int as starts,
      coalesce(sum(a.users) filter (where a.event_type = 'game_5min'), 0)::int as five_min
    from users_grp ug
    left join agg a on a.grp = ug.grp
    group by ug.grp, ug.users
  `);
  const withCounts = await Promise.all(
    (["ai", "keyword"] as const).map(async (grp) => {
      if (grp === "ai") {
        const r = await db.execute(sql`
          select count(*)::int as n from recommendation_requests
          where created_at >= ${since} and user_id is not null
        `);
        return { grp, n: (asRows<{ n: number }>(r.rows)[0]?.n) ?? 0 };
      }
      const r = await db.execute(sql`
        select count(*)::int as n from user_events
        where event_type = 'search_query' and created_at >= ${since}
      `);
      return { grp, n: (asRows<{ n: number }>(r.rows)[0]?.n) ?? 0 };
    }),
  );
  const map = new Map(rows.rows.map((r) => [r.grp as string, r]));
  const out: DiscoveryCompareRow[] = [];
  for (const grp of ["ai", "keyword"] as const) {
    const raw = (map.get(grp) ?? {
      grp,
      users: 0,
      impressions: 0,
      clicks: 0,
      starts: 0,
      five_min: 0,
    }) as Record<string, number | string>;
    const users = Number(raw.users ?? 0);
    const impressions = Number(raw.impressions ?? 0);
    const clicks = Number(raw.clicks ?? 0);
    const starts = Number(raw.starts ?? 0);
    const fiveMin = Number(raw.five_min ?? 0);
    const requests = withCounts.find((x) => x.grp === grp)?.n ?? 0;
    out.push({
      group: grp,
      label: grp === "ai" ? "AI 推荐" : "传统搜索",
      users,
      requests,
      impressions,
      clicks,
      starts,
      fiveMin,
      ctr: pct(clicks, impressions),
      successRate: pct(fiveMin, starts),
    });
  }
  return out;
}

/** 汇总：单个端点返回全部流量数据（Admin 流量看板 &api/admin/analytics/traffic） */
export async function getTrafficDashboard(days = 30) {
  const [channels, daily, funnel, landing, retention, compare] = await Promise.all([
    getChannelBreakdown(days),
    getTrafficDaily(days),
    getChannelFunnel(days),
    getLandingPages(days),
    getRetention(Math.max(days, 60)),
    getDiscoveryCompare(days),
  ]);
  const totalPv = channels.channels.reduce((acc, c) => acc + c.pv, 0);
  const totalUv = channels.channels.reduce((acc, c) => acc + c.uv, 0);
  return {
    days,
    totals: { pv: totalPv, uv: totalUv },
    channels: channels.channels,
    sources: channels.sources,
    daily,
    funnel,
    landing,
    retention,
    compare,
  };
}