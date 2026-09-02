/**
 * 游戏查询层：列表（筛选/排序/分页）+ slug 详情。
 * server 内部使用，返回类型与 @game-finder/shared 的 API 契约对齐。
 */
import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { games, gameScores } from "@/lib/db/schema";
import type {
  GameDetail,
  GameListItem,
} from "@game-finder/shared";

export type { GameDetail, GameListItem };

export type GameListFilters = {
  genre?: string;
  /** 单局时长上限（分钟）：session_length_min <= max */
  durationMax?: number;
  /** 精确人数支持 或 "multi" 表示多人 */
  players?: number | "multi";
  platform?: "mobile" | "desktop";
  /** 关键词（标题/标签/描述简单 ILIKE；M5 升级 FTS） */
  q?: string;
  sort?: "popular" | "newest" | "score" | "random";
  page?: number;
  pageSize?: number;
};

const publishedOnly = eq(games.status, "published");

function buildConditions(filters: GameListFilters): SQL[] {
  const conds: SQL[] = [publishedOnly];

  if (filters.genre) conds.push(eq(games.genre, filters.genre));
  if (filters.durationMax != null)
    conds.push(lte(games.sessionLengthMin, filters.durationMax));
  if (filters.players === "multi") conds.push(eq(games.multiplayer, true));
  else if (typeof filters.players === "number")
    conds.push(
      and(
        lte(games.minPlayers, filters.players),
        gte(games.maxPlayers, filters.players),
      )!,
    );
  if (filters.platform === "mobile") conds.push(eq(games.mobile, true));
  else if (filters.platform === "desktop") conds.push(eq(games.desktop, true));
  if (filters.q) {
    const like = `%${filters.q}%`;
    conds.push(
      or(
        ilike(games.title, like),
        ilike(games.titleOriginal, like),
        ilike(games.description, like),
        ilike(games.tags, like),
      )!,
    );
  }

  return conds;
}

function orderBy(sort: GameListFilters["sort"]) {
  switch (sort) {
    case "newest":
      return desc(games.publishedAt);
    case "score":
      return desc(sql`coalesce(${gameScores.totalScore}, 0)`);
    case "random":
      return sql`random()`;
    default:
      return desc(games.playCount);
  }
}

export async function listGames(
  filters: GameListFilters,
): Promise<{ items: GameListItem[]; total: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, filters.pageSize ?? 24));
  const conds = buildConditions(filters);

  const base = db
    .select({
      id: games.id,
      slug: games.slug,
      title: games.title,
      titleOriginal: games.titleOriginal,
      description: games.description,
      thumbnail: games.thumbnail,
      genre: games.genre,
      tags: games.tags,
      difficulty: games.difficulty,
      cognitiveLoad: games.cognitiveLoad,
      sessionLengthMin: games.sessionLengthMin,
      sessionLengthMax: games.sessionLengthMax,
      multiplayer: games.multiplayer,
      minPlayers: games.minPlayers,
      maxPlayers: games.maxPlayers,
      mobile: games.mobile,
      playCount: games.playCount,
      gameLanguage: games.gameLanguage,
      totalScore: gameScores.totalScore,
    })
    .from(games)
    .leftJoin(gameScores, eq(gameScores.gameId, games.id));

  const items = await base
    .where(and(...conds))
    .orderBy(orderBy(filters.sort))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(games)
    .where(and(...conds));

  return { items, total: count };
}

export async function getGameBySlug(slug: string) {
  const rows = await db
    .select({
      game: games,
      totalScore: gameScores.totalScore,
    })
    .from(games)
    .leftJoin(gameScores, eq(gameScores.gameId, games.id))
    .where(and(eq(games.slug, slug), publishedOnly))
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;

  return {
    ...row.game,
    totalScore: row.totalScore,
  };
}

/** 首页区块用：热门 / 最新 / 相似（M4 换 game_relations 预计算） */
export async function getTopGames(limit = 4) {
  return listGames({ sort: "popular", pageSize: limit });
}

export async function getNewestGames(limit = 4) {
  return listGames({ sort: "newest", pageSize: limit });
}

/** 粗排相似游戏：同类型优先 + 难度/认知负担距离（M1 详情页逻辑的 SQL 版） */
export async function getSimilarGames(
  gameId: number,
  limit = 4,
): Promise<GameListItem[]> {
  const rows = await db.execute(sql`
    SELECT id, slug, title, title_original, description, thumbnail, genre, tags,
           difficulty, cognitive_load, session_length_min, session_length_max,
           multiplayer, min_players, max_players, mobile, play_count,
           game_language, NULL::real AS total_score
    FROM games
    WHERE status = 'published' AND id != ${gameId}
    ORDER BY (CASE WHEN genre = (SELECT genre FROM games WHERE id = ${gameId}) THEN 0 ELSE 2 END)
           + abs(difficulty - (SELECT difficulty FROM games WHERE id = ${gameId}))
           + abs(cognitive_load - (SELECT cognitive_load FROM games WHERE id = ${gameId}))
    LIMIT ${limit}
  `);
  // 原生 SQL 返回 snake_case，映射回 API 契约的 camelCase
  type Row = Record<string, unknown>;
  return (rows.rows as Row[]).map((r) => ({
    id: r.id as number,
    slug: r.slug as string,
    title: r.title as string,
    titleOriginal: r.title_original as string,
    description: r.description as string,
    thumbnail: (r.thumbnail as string | null) ?? null,
    genre: (r.genre as string | null) ?? null,
    tags: (r.tags as string) ?? "[]",
    difficulty: (r.difficulty as number) ?? 3,
    cognitiveLoad: (r.cognitive_load as number) ?? 3,
    sessionLengthMin: (r.session_length_min as number | null) ?? null,
    sessionLengthMax: (r.session_length_max as number | null) ?? null,
    multiplayer: (r.multiplayer as boolean) ?? false,
    minPlayers: (r.min_players as number) ?? 1,
    maxPlayers: (r.max_players as number) ?? 1,
    mobile: (r.mobile as boolean) ?? false,
    playCount: (r.play_count as number) ?? 0,
    gameLanguage: (r.game_language as string) ?? "en",
    totalScore: (r.total_score as number | null) ?? null,
  }));
}
