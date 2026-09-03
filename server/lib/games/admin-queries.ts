/**
 * 管理后台查询层（T2.3，PRD §36）。
 * 与前台 queries.ts 的区别：可见全部状态、支持 id 直查、含运营字段。
 */
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { gameScores, gameSources, games, suspectedDuplicates } from "@/lib/db/schema";

export type AdminGameStatus = "draft" | "pending" | "published" | "offline";

export interface AdminGameFilters {
  status?: AdminGameStatus;
  sourceCode?: string;
  q?: string;
  sort?: "newest" | "oldest" | "play_count" | "title";
  page?: number;
  pageSize?: number;
}

export async function adminListGames(filters: AdminGameFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 30));
  const conds: SQL[] = [];

  if (filters.status) conds.push(eq(games.status, filters.status));
  if (filters.sourceCode)
    conds.push(
      eq(
        games.sourceId,
        db
          .select({ id: gameSources.id })
          .from(gameSources)
          .where(eq(gameSources.code, filters.sourceCode))
          .limit(1),
      ),
    );
  if (filters.q) {
    const like = `%${filters.q}%`;
    conds.push(
      or(
        ilike(games.title, like),
        ilike(games.titleOriginal, like),
        ilike(games.slug, like),
      )!,
    );
  }

  const where = conds.length > 0 ? and(...conds) : undefined;
  const order =
    filters.sort === "oldest"
      ? asc(games.id)
      : filters.sort === "play_count"
        ? desc(games.playCount)
        : filters.sort === "title"
          ? asc(games.titleOriginal)
          : desc(games.id);

  const items = await db
    .select({
      id: games.id,
      sourceGameId: games.sourceGameId,
      title: games.title,
      titleOriginal: games.titleOriginal,
      slug: games.slug,
      thumbnail: games.thumbnail,
      genre: games.genre,
      status: games.status,
      playCount: games.playCount,
      needsReanalysis: games.needsReanalysis,
      healthFailCount: games.healthFailCount,
      createdAt: games.createdAt,
      sourceCode: gameSources.code,
      sourceName: gameSources.name,
    })
    .from(games)
    .innerJoin(gameSources, eq(gameSources.id, games.sourceId))
    .where(where)
    .orderBy(order)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(games)
    .where(where);

  return { items, total: count, page, pageSize };
}

/** 游戏详情（全字段 + GameScore） */
export async function adminGetGame(id: number) {
  const rows = await db
    .select({ game: games, totalScore: gameScores.totalScore, sourceCode: gameSources.code, sourceName: gameSources.name })
    .from(games)
    .innerJoin(gameSources, eq(gameSources.id, games.sourceId))
    .leftJoin(gameScores, eq(gameScores.gameId, games.id))
    .where(eq(games.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  return { ...row.game, totalScore: row.totalScore, sourceCode: row.sourceCode, sourceName: row.sourceName };
}

/** 上下架（T2.3：draft→published 手动上架；published→offline 手动下架；允许任何合法状态转换） */
export async function adminSetGameStatus(id: number, status: AdminGameStatus) {
  const updated = await db
    .update(games)
    .set({
      status,
      updatedAt: new Date(),
      ...(status === "published" ? { publishedAt: new Date() } : {}),
    })
    .where(eq(games.id, id))
    .returning({ id: games.id, status: games.status });
  return updated[0];
}

/** 数据源页：Source / Status / Last Sync / Game Count / Error Count + 各状态分布 */
export async function adminListSources() {
  const sources = await db
    .select({
      id: gameSources.id,
      code: gameSources.code,
      name: gameSources.name,
      baseUrl: gameSources.baseUrl,
      apiType: gameSources.apiType,
      status: gameSources.status,
      lastSyncAt: gameSources.lastSyncAt,
      lastSyncStatus: gameSources.lastSyncStatus,
      errorCount: gameSources.errorCount,
    })
    .from(gameSources)
    .orderBy(asc(gameSources.id));

  const counts = await db
    .select({
      sourceId: games.sourceId,
      status: games.status,
      count: sql<number>`count(*)::int`,
    })
    .from(games)
    .groupBy(games.sourceId, games.status);

  return sources.map((s) => {
    const mine = counts.filter((c) => c.sourceId === s.id);
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const c of mine) {
      byStatus[c.status] = c.count;
      total += c.count;
    }
    return { ...s, gameCount: total, gamesByStatus: byStatus };
  });
}

/** 重复游戏队列（T3.7 人工处理） */
export async function adminListDuplicates(status = "pending", page = 1, pageSize = 20) {
  const pageSize_ = Math.min(100, Math.max(1, pageSize));
  const where = eq(suspectedDuplicates.status, status);

  const items = await db
    .select({
      id: suspectedDuplicates.id,
      similarity: suspectedDuplicates.similarity,
      reason: suspectedDuplicates.reason,
      status: suspectedDuplicates.status,
      keepId: suspectedDuplicates.gameId,
      keepTitle: games.titleOriginal,
      keepSlug: games.slug,
      keepStatus: games.status,
      keepThumbnail: games.thumbnail,
      dupId: suspectedDuplicates.duplicateOfGameId,
    })
    .from(suspectedDuplicates)
    .innerJoin(games, eq(games.id, suspectedDuplicates.gameId))
    .where(where)
    .orderBy(desc(suspectedDuplicates.similarity))
    .limit(pageSize_)
    .offset((page - 1) * pageSize_);

  // 补充被合并方的信息
  const dupIds = [...new Set(items.map((i) => i.dupId))];
  const dupGames =
    dupIds.length > 0
      ? await db
          .select({ id: games.id, titleOriginal: games.titleOriginal, slug: games.slug, status: games.status, thumbnail: games.thumbnail })
          .from(games)
          .where(sql`${games.id} in ${dupIds}`)
      : [];
  const dupMap = new Map(dupGames.map((g) => [g.id, g]));

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(suspectedDuplicates)
    .where(where);

  return {
    items: items.map((i) => {
      const dup = dupMap.get(i.dupId);
      return {
        ...i,
        dupTitle: dup?.titleOriginal ?? "(已删除)",
        dupSlug: dup?.slug ?? null,
        dupStatus: dup?.status ?? null,
        dupThumbnail: dup?.thumbnail ?? null,
      };
    }),
    total: count,
    page,
    pageSize: pageSize_,
  };
}

/**
 * Merge（人工裁决版，T3.7）：
 * - duplicate 下线为 offline（不物理删除，保留数据可回滚）
 * - 记录标记 merged
 */
export async function adminMergeDuplicate(pairId: number, keep: "game_id" | "duplicate_of_game_id") {
  const rows = await db
    .select()
    .from(suspectedDuplicates)
    .where(eq(suspectedDuplicates.id, pairId))
    .limit(1);
  const pair = rows[0];
  if (!pair) return undefined;

  const keepId = keep === "game_id" ? pair.gameId : pair.duplicateOfGameId;
  const offlineId = keep === "game_id" ? pair.duplicateOfGameId : pair.gameId;

  await db
    .update(games)
    .set({ status: "offline", updatedAt: new Date() })
    .where(eq(games.id, offlineId));
  const updated = await db
    .update(suspectedDuplicates)
    .set({ status: "merged", updatedAt: new Date() })
    .where(eq(suspectedDuplicates.id, pairId))
    .returning({ id: suspectedDuplicates.id });

  return { pair: updated[0], keptId: keepId, offlinedId: offlineId };
}

export async function adminDismissDuplicate(pairId: number) {
  const updated = await db
    .update(suspectedDuplicates)
    .set({ status: "dismissed", updatedAt: new Date() })
    .where(eq(suspectedDuplicates.id, pairId))
    .returning({ id: suspectedDuplicates.id });
  return updated[0];
}

/** 仪表盘统计 */
export async function adminOverview() {
  const [statusCounts, sourceCount, dupPending] = await Promise.all([
    db
      .select({ status: games.status, count: sql<number>`count(*)::int` })
      .from(games)
      .groupBy(games.status),
    db.select({ count: sql<number>`count(*)::int` }).from(gameSources),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(suspectedDuplicates)
      .where(eq(suspectedDuplicates.status, "pending")),
  ]);
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const r of statusCounts) {
    byStatus[r.status] = r.count;
    total += r.count;
  }
  return {
    totalGames: total,
    byStatus,
    sourceCount: sourceCount[0].count,
    duplicatesPending: dupPending[0].count,
  };
}
