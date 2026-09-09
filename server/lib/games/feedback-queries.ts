/**
 * 游戏质量反馈查询层（详情页「反馈」入口 + 后台反馈专区）。
 *
 * - 提交：匿名 user_id（_gf_uid Cookie UUID），同用户对同游戏仅保留一条
 *   pending，避免刷屏（已处理后可再报）。
 * - 后台：可见 game 信息跳转复核，可标记 resolved/dismissed；
 *   确认问题直接下架仍走 games.status（复刻 adminSetGameStatus）。
 */
import { and, desc, eq, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { gameFeedback, games, gameSources } from "@/lib/db/schema";
import type {
  GameFeedbackStatus,
  GameFeedbackType,
} from "@game-finder/shared";

export type FeedbackStatus = GameFeedbackStatus;

export interface SubmitFeedbackInput {
  userId: string;
  gameId: number;
  type: GameFeedbackType;
  note?: string;
}

/** 提交反馈；若同用户对同游戏已有 pending，则幂等返回 alreadyReported */
export async function submitGameFeedback(input: SubmitFeedbackInput) {
  const existing = await db
    .select({ id: gameFeedback.id })
    .from(gameFeedback)
    .where(
      and(
        eq(gameFeedback.userId, input.userId),
        eq(gameFeedback.gameId, input.gameId),
        eq(gameFeedback.status, "pending"),
      ),
    )
    .limit(1);

  if (existing[0]) return { ok: true, alreadyReported: true };

  await db.insert(gameFeedback).values({
    userId: input.userId,
    gameId: input.gameId,
    feedbackType: input.type,
    note: input.note?.slice(0, 500) || null,
  });
  return { ok: true, alreadyReported: false };
}

export interface AdminFeedbackFilters {
  status?: FeedbackStatus;
  type?: GameFeedbackType;
  page?: number;
  pageSize?: number;
}

/** 后台反馈列表：联查游戏信息以便跳转复核 */
export async function adminListFeedback(filters: AdminFeedbackFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 30));
  const conds: SQL[] = [];
  if (filters.status) conds.push(eq(gameFeedback.status, filters.status));
  if (filters.type) conds.push(eq(gameFeedback.feedbackType, filters.type));

  const where = conds.length > 0 ? and(...conds) : undefined;

  const items = await db
    .select({
      id: gameFeedback.id,
      feedbackType: gameFeedback.feedbackType,
      status: gameFeedback.status,
      note: gameFeedback.note,
      userId: gameFeedback.userId,
      createdAt: gameFeedback.createdAt,
      gameId: games.id,
      gameSlug: games.slug,
      gameTitle: games.title,
      gameTitleOriginal: games.titleOriginal,
      gameThumbnail: games.thumbnail,
      gameStatus: games.status,
      sourceQualityScore: games.sourceQualityScore,
      sourceCode: gameSources.code,
    })
    .from(gameFeedback)
    .innerJoin(games, eq(gameFeedback.gameId, games.id))
    .innerJoin(gameSources, eq(gameSources.id, games.sourceId))
    .where(where)
    .orderBy(desc(gameFeedback.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(gameFeedback)
    .where(where);

  return { items, total: count, page, pageSize };
}

/** 后台标记处理状态（resolved / dismissed）；pending 不可由后台手动置回 */
export async function adminSetFeedbackStatus(
  id: number,
  status: Exclude<GameFeedbackStatus, "pending">,
) {
  const updated = await db
    .update(gameFeedback)
    .set({ status })
    .where(eq(gameFeedback.id, id))
    .returning({ id: gameFeedback.id, status: gameFeedback.status });
  return updated[0];
}

/**
 * 复核确认问题：把反馈指向的游戏下架（offline），并标记该游戏全部
 * pending 反馈为 resolved。整体一个事务，避免半途失败产生脏状态。
 */
export async function adminTakedownFeedbackGame(feedbackId: number) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ gameId: gameFeedback.gameId })
      .from(gameFeedback)
      .where(eq(gameFeedback.id, feedbackId))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;

    const [game] = await tx
      .update(games)
      .set({ status: "offline", updatedAt: new Date() })
      .where(eq(games.id, row.gameId))
      .returning({ id: games.id, status: games.status });

    const updated = await tx
      .update(gameFeedback)
      .set({ status: "resolved" })
      .where(
        and(
          eq(gameFeedback.gameId, row.gameId),
          eq(gameFeedback.status, "pending"),
        ),
      )
      .returning({ id: gameFeedback.id });

    return {
      gameId: row.gameId,
      gameStatus: game.status,
      feedbackId,
      resolvedCount: updated.length,
    };
  });
}

/** 待处理反馈数（仪表盘入口） */
export async function adminFeedbackOverview() {
  const [pending, byType] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(gameFeedback)
      .where(eq(gameFeedback.status, "pending")),
    db
      .select({
        feedbackType: gameFeedback.feedbackType,
        status: gameFeedback.status,
        count: sql<number>`count(*)::int`,
      })
      .from(gameFeedback)
      .groupBy(gameFeedback.feedbackType, gameFeedback.status),
  ]);
  return {
    pending: pending[0].count,
    /** type+status → count，如 {wrong_language→pending: 3} */
    byType: byType.map((r) => ({
      type: r.feedbackType,
      status: r.status,
      count: r.count,
    })),
  };
}