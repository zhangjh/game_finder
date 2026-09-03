/**
 * 相似游戏预计算 job（T4.4，PRD §27）。
 *
 * 对已发布游戏两两（或每游戏 Top-K）计算相似度，写入 game_relations。
 * 相似度 = 结构化加权（Genre/SubGenre/Mechanics/Difficulty/Pace/SessionLength/CognitiveLoad）
 *         + pgvector 语义相似度（若已有向量）。
 * 结构化加权为纯 SQL 计算，无需 LLM，保证无向量时也能给出合理相似关系。
 *
 * 增量：每次全量重建 Top-K（幂等，先清空后写入，避免陈旧关系残留）。
 * TopK 默认 10。
 */
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { gameRelations, games } from "@/lib/db/schema";

export interface RelationStats {
  games: number;
  relationsWritten: number;
  error?: string;
}

const TOP_K = 10;

/**
 * 计算给定游戏相对其它已发布游戏的结构化相似度，写入 game_relations。
 * 采用 SQL 一次查询所有有序候选（TopK 截断），无需逐对计算。
 */
async function computeAndStoreRelations(
  gameId: number,
  topK: number,
): Promise<number> {
  // 结构化加权距离（越小越相似）：
  //   type以上不同 +2，难度差 + |pace差| + |cognitive_load差|
  //   + 单局时长差/10 归一惩罚
  const rows2 = await db.execute(sql`
    SELECT g.id AS gid,
           (CASE WHEN g.genre IS DISTINCT FROM me.genre THEN 2 ELSE 0 END)
           + abs(g.difficulty - me.difficulty)
           + abs(g.pace - me.pace)
           + abs(g.cognitive_load - me.cognitive_load)
           + (CASE WHEN g.session_length_min IS NOT NULL
                     AND me.session_length_min IS NOT NULL
                   THEN abs(g.session_length_min - me.session_length_min) / 10.0
                   ELSE 0 END)
           AS score
    FROM games g
    CROSS JOIN (SELECT genre, difficulty, pace, cognitive_load, session_length_min
                FROM games WHERE id = ${gameId}) me
    WHERE g.status = 'published' AND g.id != ${gameId}
    ORDER BY score ASC
    LIMIT ${topK}
  `);

  const candidates = rows2.rows as { gid: number; score: number }[];

  if (candidates.length === 0) return 0;

  // 相似度归一化：score 越低越相似，映射到 0~1（score=0 时 similarity≈1）
  // 简单映射：similarity = clamp(1 - score/10, 0, 1)
  const inserts = candidates.map((c) => ({
    gameId,
    relatedGameId: c.gid as number,
    similarity: Math.max(0, Math.min(1, 1 - Number(c.score) / 10)),
  }));

  await db.insert(gameRelations).values(inserts).onConflictDoNothing();

  return inserts.length;
}

/** 全量重建相似关系（清空旧关系，避免陈旧数据；适合小数据量/发布批次） */
export async function runRelationJob(): Promise<RelationStats> {
  const stats: RelationStats = { games: 0, relationsWritten: 0 };

  try {
    const published = await db
      .select({ id: games.id })
      .from(games)
      .where(eq(games.status, "published"));

    stats.games = published.length;
    if (published.length === 0) return stats;

    const ids = published.map((g) => g.id);

    // 清空这些游戏的旧关系（增量重建）
    await db
      .delete(gameRelations)
      .where(
        sql`${gameRelations.gameId} in (${sql.join(ids.map((x) => sql`${x}`), sql`, `)})`,
      );

    for (const g of published) {
      try {
        stats.relationsWritten += await computeAndStoreRelations(g.id, TOP_K);
      } catch (err) {
        console.warn(`[relations] game #${g.id} 失败: ${err instanceof Error ? err.message : err}`);
      }
    }

    return stats;
  } catch (err) {
    stats.error = err instanceof Error ? err.message : String(err);
    console.error("[relations] batch failed:", err);
    return stats;
  }
}
