/**
 * GameScore v0 计算 job（T6.3，PRD §24）。
 *
 * 每日从 user_events 聚合行为数据，按权重计算总分写入 game_scores：
 *   启动率(30%) + 深度参与率(20%) + 平均时长(20%) +
 *   点击率(15%) + 重玩率(10%) + 新鲜度(5%)
 *
 * 冷启动：无行为数据的游戏保持 totalScore=0 + sampleSize=0，
 * 由 Quality Gate / 数据完整度兜底排序（PRD §24.2）。
 */
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { gameScores, games, userEvents } from "@/lib/db/schema";

/**
 * 权重配置（PRD §24.1）。调参只需改此对象，computeScores 读取后计算。
 * 总和应为 1.0。
 */
const WEIGHTS = {
  /** game_start / game_impression（点击到启动的转化） */
  startRate: 0.3,
  /** game_5min / game_start（深度参与：玩满 5 分钟） */
  deepEngageRate: 0.2,
  /** 平均游戏时长秒 / 300（封顶 5 分钟得满分） */
  avgDuration: 0.2,
  /** game_click / game_impression（曝光→点击转化） */
  clickRate: 0.15,
  /** game_replay / game_start（重玩率） */
  replayRate: 0.1,
  /** 新鲜度：最近 7 天内有活动 +0.05，30 天 +0.02，否则 0 */
  freshness: 0.05,
} as const;

/** 各分量 0~1 归一化后的得分 */
interface Components {
  startRate: number;
  deepEngageRate: number;
  avgDuration: number;
  clickRate: number;
  replayRate: number;
  freshness: number;
}

export interface ComputeResult {
  computed: number;
  skipped: number;
  error?: string;
}

/**
 * 计算全量已发布游戏的 GameScore。
 * 增量模式：只算有行为数据的游戏 + 每日批量重建（防止热门度变化不及时）。
 */
export async function computeScores(): Promise<ComputeResult> {
  const start = Date.now();

  try {
    // 拉取所有已发布游戏 ID
    const published = await db
      .select({ id: games.id, publishedAt: games.publishedAt })
      .from(games)
      .where(eq(games.status, "published"));

    if (published.length === 0) {
      return { computed: 0, skipped: 0 };
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 批量查询各游戏的行为聚合指标
    const stats = await db
      .select({
        gameId: userEvents.gameId,
        impressions: sql<number>`count(*) filter (where ${userEvents.eventType} = 'game_impression')::int`,
        clicks: sql<number>`count(*) filter (where ${userEvents.eventType} = 'game_click')::int`,
        starts: sql<number>`count(*) filter (where ${userEvents.eventType} = 'game_start')::int`,
        d30s: sql<number>`count(*) filter (where ${userEvents.eventType} = 'game_30s')::int`,
        d2min: sql<number>`count(*) filter (where ${userEvents.eventType} = 'game_2min')::int`,
        d5min: sql<number>`count(*) filter (where ${userEvents.eventType} = 'game_5min')::int`,
        exits: sql<number>`count(*) filter (where ${userEvents.eventType} = 'game_exit')::int`,
        replays: sql<number>`count(*) filter (where ${userEvents.eventType} = 'game_replay')::int`,
        totalSession: sql<number>`coalesce(sum(${userEvents.sessionSeconds}), 0)::int`,
        exitCount: sql<number>`count(*) filter (where ${userEvents.eventType} = 'game_exit' and ${userEvents.sessionSeconds} is not null)::int`,
        recent7d: sql<number>`count(*) filter (where ${userEvents.createdAt} >= ${sevenDaysAgo})::int`,
        recent30d: sql<number>`count(*) filter (where ${userEvents.createdAt} >= ${thirtyDaysAgo})::int`,
      })
      .from(userEvents)
      .where(
        and(
          sql`${userEvents.gameId} is not null`,
          sql`${userEvents.createdAt} >= ${thirtyDaysAgo}`,
        ),
      )
      .groupBy(userEvents.gameId);

    const statsMap = new Map(stats.map((s) => [s.gameId, s]));

    // 计算每个游戏的分数
    const upserts: {
      gameId: number;
      totalScore: number;
      components: string;
      sampleSize: number;
      computedAt: Date;
    }[] = [];

    for (const game of published) {
      const s = statsMap.get(game.id);
      if (!s || s.impressions === 0) {
        // 无行为数据：冷启动兜底
        upserts.push({
          gameId: game.id,
          totalScore: 0,
          components: "{}",
          sampleSize: 0,
          computedAt: now,
        });
        continue;
      }

      const comp: Components = {
        startRate: Math.min(1, s.starts / Math.max(1, s.impressions)),
        deepEngageRate: Math.min(1, s.d5min / Math.max(1, s.starts)),
        avgDuration: Math.min(1, s.exitCount > 0 ? s.totalSession / s.exitCount / 300 : 0),
        clickRate: Math.min(1, s.clicks / Math.max(1, s.impressions)),
        replayRate: Math.min(1, s.replays / Math.max(1, s.starts)),
        freshness:
          s.recent7d > 0 ? 1 : s.recent30d > 0 ? 0.4 : 0,
      };

      const total =
        WEIGHTS.startRate * comp.startRate +
        WEIGHTS.deepEngageRate * comp.deepEngageRate +
        WEIGHTS.avgDuration * comp.avgDuration +
        WEIGHTS.clickRate * comp.clickRate +
        WEIGHTS.replayRate * comp.replayRate +
        WEIGHTS.freshness * comp.freshness;

      // 归一化到 0~10 分
      const totalScore = Math.round(total * 10 * 1000) / 1000;

      upserts.push({
        gameId: game.id,
        totalScore,
        components: JSON.stringify({
          ...comp,
          raw: {
            impressions: s.impressions,
            clicks: s.clicks,
            starts: s.starts,
            d5min: s.d5min,
            replays: s.replays,
            avgSessionSec: s.exitCount > 0 ? Math.round(s.totalSession / s.exitCount) : 0,
          },
        }),
        sampleSize: s.impressions,
        computedAt: now,
      });
    }

    // 分批 upsert（每批 200 条，避免超大事务）
    const BATCH = 200;
    for (let i = 0; i < upserts.length; i += BATCH) {
      const chunk = upserts.slice(i, i + BATCH);
      await db
        .insert(gameScores)
        .values(chunk)
        .onConflictDoUpdate({
          target: gameScores.gameId,
          set: {
            totalScore: sql`excluded.total_score`,
            components: sql`excluded.components`,
            sampleSize: sql`excluded.sample_size`,
            computedAt: sql`excluded.computed_at`,
          },
        });
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      `[compute-scores] done: ${upserts.length} games scored in ${elapsed}s`,
    );

    return { computed: upserts.length, skipped: 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[compute-scores] failed:", msg);
    return { computed: 0, skipped: 0, error: msg };
  }
}
