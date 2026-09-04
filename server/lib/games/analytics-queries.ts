/**
 * 管理后台数据看板查询层（T6.4，PRD §52/§53）。
 *
 * 北极星指标：Successful Discovery Rate（推荐后玩满 5 分钟的比例）。
 * 其余核心指标：启动率、推荐 CTR、重玩率、热门游戏、热门查询。
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  gameScores,
  games,
  recommendationRequests,
  userEvents,
} from "@/lib/db/schema";

export interface AnalyticsOverview {
  /** 总事件数 */
  totalEvents: number;
  /** 去重匿名用户数 */
  uniqueUsers: number;
  /** 游戏启动总次数 */
  totalStarts: number;
  /** 推荐请求总数 */
  totalRecommendations: number;
  /** 推荐后成功（玩满 5 分钟）的次数 */
  recommendationSuccesses: number;
  /** 推荐成功率（Successful Discovery Rate） */
  successRate: number;
  /** 推荐 CTR（点击 / 展示） */
  recommendCTR: number;
  /** 游戏启动率（start / impression） */
  launchRate: number;
  /** 重玩率（replay / start） */
  replayRate: number;
}

export interface EventBreakdown {
  eventType: string;
  count: number;
}

export interface TopGame {
  id: number;
  title: string;
  slug: string;
  thumbnail: string | null;
  totalScore: number | null;
  playCount: number;
  startCount: number;
  avgSessionSec: number | null;
}

export interface TopQuery {
  rawInput: string;
  count: number;
  avgResultCount: number;
}

export interface DailyActivity {
  date: string;
  events: number;
  starts: number;
  uniqueUsers: number;
}

/**
 * 看板核心数据。
 * 只查最近 30 天行为数据（避免全表扫描过慢）。
 */
export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const recStatsRes = await db.execute(sql`
    select
      count(distinct ue.id)::int as total,
      count(distinct case
        when exists (
          select 1 from user_events ue2
          where ue2.user_id = ue.user_id
            and ue2.game_id = ue.game_id
            and ue2.event_type = 'game_5min'
            and ue2.created_at >= ue.created_at
            and ue2.created_at <= ue.created_at + interval '30 minutes'
        ) then ue.id end
      )::int as successes
    from user_events ue
    where ue.event_type = 'recommendation_click'
      and ue.game_id is not null
      and ue.created_at >= ${thirtyDaysAgo}
  `);
  type RecRow = { total: number; successes: number };
  const r = (recStatsRes.rows as RecRow[])[0];

  const [eventStats, clickStats, startStats, replayStats, reqCount] =
    await Promise.all([
      // 总事件 + 去重用户
      db
        .select({
          totalEvents: sql<number>`count(*)::int`,
          uniqueUsers: sql<number>`count(distinct ${userEvents.userId})::int`,
        })
        .from(userEvents)
        .where(gte(userEvents.createdAt, thirtyDaysAgo)),
      // 推荐 CTR = recommendation_impression / recommendation_click
      db
        .select({
          impressions: sql<number>`count(*) filter (where ${userEvents.eventType} = 'recommendation_impression')::int`,
          clicks: sql<number>`count(*) filter (where ${userEvents.eventType} = 'recommendation_click')::int`,
        })
        .from(userEvents)
        .where(gte(userEvents.createdAt, thirtyDaysAgo)),
      // 启动率 = game_start / game_impression
      db
        .select({
          impressions: sql<number>`count(*) filter (where ${userEvents.eventType} = 'game_impression')::int`,
          starts: sql<number>`count(*) filter (where ${userEvents.eventType} = 'game_start')::int`,
        })
        .from(userEvents)
        .where(gte(userEvents.createdAt, thirtyDaysAgo)),
      // 重玩率 = game_replay / game_start
      db
        .select({
          starts: sql<number>`count(*) filter (where ${userEvents.eventType} = 'game_start')::int`,
          replays: sql<number>`count(*) filter (where ${userEvents.eventType} = 'game_replay')::int`,
        })
        .from(userEvents)
        .where(gte(userEvents.createdAt, thirtyDaysAgo)),
      // 推荐请求总数
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(recommendationRequests)
        .where(gte(recommendationRequests.createdAt, thirtyDaysAgo)),
    ]);

  const e = eventStats[0];
  const c = clickStats[0];
  const s = startStats[0];
  const rp = replayStats[0];
  const totalRecommendations = reqCount[0]?.count ?? 0;

  return {
    totalEvents: e.totalEvents,
    uniqueUsers: e.uniqueUsers,
    totalStarts: s.starts,
    totalRecommendations,
    recommendationSuccesses: r.successes,
    successRate:
      r.total > 0 ? Math.round((r.successes / r.total) * 10000) / 100 : 0,
    recommendCTR:
      c.impressions > 0 ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0,
    launchRate:
      s.impressions > 0 ? Math.round((s.starts / s.impressions) * 10000) / 100 : 0,
    replayRate: rp.starts > 0 ? Math.round((rp.replays / rp.starts) * 10000) / 100 : 0,
  };
}

/** 按事件类型分布 */
export async function getEventBreakdown(): Promise<EventBreakdown[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return db
    .select({
      eventType: userEvents.eventType,
      count: sql<number>`count(*)::int`,
    })
    .from(userEvents)
    .where(gte(userEvents.createdAt, thirtyDaysAgo))
    .groupBy(userEvents.eventType)
    .orderBy(desc(sql`count(*)`));
}

/** 热门游戏 Top 10（按启动次数） */
export async function getTopGames(limit = 10): Promise<TopGame[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return db
    .select({
      id: games.id,
      title: games.title,
      slug: games.slug,
      thumbnail: games.thumbnail,
      totalScore: gameScores.totalScore,
      playCount: games.playCount,
      startCount: sql<number>`count(*) filter (where ${userEvents.eventType} = 'game_start')::int`,
      avgSessionSec: sql<number>`coalesce(
        avg(${userEvents.sessionSeconds}) filter (where ${userEvents.eventType} = 'game_exit' and ${userEvents.sessionSeconds} is not null),
        null
      )::int`,
    })
    .from(games)
    .leftJoin(userEvents, eq(userEvents.gameId, games.id))
    .leftJoin(gameScores, eq(gameScores.gameId, games.id))
    .where(
      and(
        eq(games.status, "published"),
        sql`(${userEvents.createdAt} is null or ${userEvents.createdAt} >= ${thirtyDaysAgo})`,
      ),
    )
    .groupBy(games.id, games.title, games.slug, games.thumbnail, gameScores.totalScore, games.playCount)
    .orderBy(desc(sql`count(*) filter (where ${userEvents.eventType} = 'game_start')`))
    .limit(limit);
}

/** 热门推荐查询 Top 10 */
export async function getTopQueries(limit = 10): Promise<TopQuery[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return db
    .select({
      rawInput: recommendationRequests.rawInput,
      count: sql<number>`count(*)::int`,
      avgResultCount: sql<number>`coalesce(avg(${recommendationRequests.resultCount}), 0)::int`,
    })
    .from(recommendationRequests)
    .where(gte(recommendationRequests.createdAt, thirtyDaysAgo))
    .groupBy(recommendationRequests.rawInput)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
}

/** 最近 7 天每日活动趋势 */
export async function getDailyActivity(): Promise<DailyActivity[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      date: sql<string>`to_char(${userEvents.createdAt}, 'YYYY-MM-DD')`,
      events: sql<number>`count(*)::int`,
      starts: sql<number>`count(*) filter (where ${userEvents.eventType} = 'game_start')::int`,
      uniqueUsers: sql<number>`count(distinct ${userEvents.userId})::int`,
    })
    .from(userEvents)
    .where(gte(userEvents.createdAt, sevenDaysAgo))
    .groupBy(sql`to_char(${userEvents.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${userEvents.createdAt}, 'YYYY-MM-DD')`);
  return rows;
}
