/**
 * 游戏查询层：列表（筛选/排序/分页）+ slug 详情。
 * server 内部使用，返回类型与 @game-finder/shared 的 API 契约对齐。
 */
import { and, desc, eq, gt, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { games, gameScores } from "@/lib/db/schema";
import type {
  GameDetail,
  GameListItem,
  SeoGameExportResponse,
} from "@game-finder/shared";

export type { GameDetail, GameListItem };

export type GameListFilters = {
  /**
   * 界面语种过滤（T1.7）：
   * - zh：只返回有中文元数据的游戏（metadata_language='zh'）
   * - en：不加语种过滤（英文原始字段 title_original 恒存在，全部可展示）
   */
  lang?: "zh" | "en";
  genre?: string;
  /** 单局时长上限（分钟）：session_length_max <= max */
  durationMax?: number;
  /** 精确人数支持 或 "multi" 表示多人 */
  players?: number | "multi";
  platform?: "mobile" | "desktop";
  mood?: "relaxing";
  /** 关键词（标题/标签/描述简单 ILIKE；M5 升级 FTS） */
  q?: string;
  /** 源站质量分下限（strict：仅 > 该值，NULL 不通过） */
  minQualityScore?: number;
  sort?: "popular" | "newest" | "score" | "random" | "quality";
  page?: number;
  pageSize?: number;
};

const publishedOnly = eq(games.status, "published");

function buildConditions(filters: GameListFilters): SQL[] {
  const conds: SQL[] = [publishedOnly];

  // 中文界面只展示有中文元数据的游戏；英文界面展示全部（原始英文字段恒存在）
  if (filters.lang === "zh") conds.push(eq(games.metadataLanguage, "zh"));
  if (filters.genre) conds.push(eq(games.genre, filters.genre));
  if (filters.durationMax != null)
    conds.push(lte(games.sessionLengthMax, filters.durationMax));
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
  if (filters.mood === "relaxing") {
    conds.push(
      or(
        ilike(games.mood, '%"relaxing"%'),
        ilike(games.mood, '%"chill"%'),
      )!,
    );
  }
  if (filters.minQualityScore != null)
    conds.push(gt(games.sourceQualityScore, filters.minQualityScore));
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
    case "quality":
      // 源站质量分倒序；缺失值（NULL）沉底
      return sql`${games.sourceQualityScore} DESC NULLS LAST`;
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
      sourceQualityScore: games.sourceQualityScore,
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

/** 解析 games.screenshots（JSON 数组字符串），非法格式回退 [] */
function parseScreenshots(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** 把 GamePix CDN 缩略图升级为高清封面，作为截图兜底源 */
function upgradeThumbnail(thumbnail: string | null): string | null {
  if (!thumbnail) return null;
  try {
    const u = new URL(thumbnail);
    if (u.hostname === "img.gamepix.com") {
      u.searchParams.set("w", "1200");
      u.searchParams.set("ar", "16:10");
      return u.toString();
    }
  } catch {
    /* 非法 URL 原样返回 */
  }
  return thumbnail;
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

  // 截图没采集过的老数据回退到高清封面，保证详情页有画面
  const storedScreenshots = parseScreenshots(row.game.screenshots);
  const screenshots =
    storedScreenshots.length > 0
      ? storedScreenshots
      : [upgradeThumbnail(row.game.thumbnail)].filter((u): u is string => u != null);

  return {
    ...row.game,
    screenshots: JSON.stringify(screenshots),
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
  lang: "zh" | "en" = "zh",
): Promise<GameListItem[]> {
  // 中文界面只推有中文元数据的相似游戏；英文界面不过滤
  const langCond = lang === "zh" ? sql` AND g.metadata_language = 'zh'` : sql``;
  const rows = await db.execute(sql`
    SELECT id, slug, title, title_original, description, thumbnail, genre, tags,
           difficulty, cognitive_load, session_length_min, session_length_max,
           multiplayer, min_players, max_players, mobile, play_count,
           game_language, source_quality_score, NULL::real AS total_score
    FROM games g
    WHERE g.status = 'published' AND g.id != ${gameId}${langCond}
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
    sourceQualityScore: (r.source_quality_score as number | null) ?? null,
    totalScore: (r.total_score as number | null) ?? null,
  }));
}

export async function exportSeoGames(
  cursor: number,
  pageSize: number,
): Promise<SeoGameExportResponse> {
  const safeCursor = Math.max(0, cursor);
  const safePageSize = Math.min(1_000, Math.max(1, pageSize));

  return db.transaction(
    async (tx) => {
      const [snapshot] = await tx
        .select({
          total: sql<number>`count(*)::int`,
          lastUpdatedAt: sql<string>`coalesce(max(${games.updatedAt})::text, '')`,
        })
        .from(games)
        .where(publishedOnly);
      const rows = await tx
        .select({
          id: games.id,
          slug: games.slug,
          title: games.title,
          titleOriginal: games.titleOriginal,
          description: games.description,
          thumbnail: games.thumbnail,
          genre: games.genre,
          sessionLengthMax: games.sessionLengthMax,
          minPlayers: games.minPlayers,
          maxPlayers: games.maxPlayers,
          mood: games.mood,
          sourceQualityScore: games.sourceQualityScore,
          desktop: games.desktop,
          mobile: games.mobile,
          gameLanguage: games.gameLanguage,
          multiplayer: games.multiplayer,
          metadataLanguage: games.metadataLanguage,
          developer: games.developer,
          publisher: games.publisher,
          releaseDate: games.releaseDate,
          updatedAt: games.updatedAt,
        })
        .from(games)
        .where(and(publishedOnly, gt(games.id, safeCursor)))
        .orderBy(games.id)
        .limit(safePageSize);

      return {
        items: rows.map(({ id: _id, updatedAt, ...game }) => ({
          ...game,
          updatedAt: updatedAt.toISOString(),
        })),
        total: snapshot.total,
        nextCursor:
          rows.length === safePageSize ? rows[rows.length - 1].id : null,
        catalogVersion: `${snapshot.total}:${snapshot.lastUpdatedAt}`,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
