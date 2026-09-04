/**
 * 候选召回（T5.2，PRD §42 Candidate Recall）。
 *
 * 五路并行合并去重：
 * ① SQL 条件召回（硬条件：时长/人数/设备/状态 + 软条件：心情/难度上限）
 * ② 关键词召回（标题/标签 ILIKE；M5 简易 FTS，风险 R2 预案的降级实现）
 * ③ pgvector 语义召回（intent 描述文本 或 参考游戏向量）
 * ④ 热门游戏兜底
 * ⑤ 相似游戏扩展（similar_to 场景，game_relations 预计算）
 *
 * 各路失败互不影响（Promise.allSettled），保证 Pipeline 永不空转。
 */
import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { gameEmbeddings, gameScores, games } from "@/lib/db/schema";
import { generateEmbeddings } from "@/lib/ai/embedding";
import { embeddingConfigured } from "@/lib/ai/embedding-client";
import { RECALL_QUOTA } from "./config";
import type { GameIntent } from "@game-finder/shared";
import type { ReferenceGame } from "./intent-parser";

/** 召回候选（ranking 输入；投影覆盖列表卡片 + 全部排序维度） */
export interface CandidateGame {
  id: number;
  slug: string;
  title: string;
  titleOriginal: string;
  description: string;
  thumbnail: string | null;
  genre: string | null;
  tags: string;
  mechanics: string;
  mood: string;
  difficulty: number;
  cognitiveLoad: number;
  complexity: number;
  pace: number;
  stressLevel: number;
  sessionLengthMin: number | null;
  sessionLengthMax: number | null;
  multiplayer: boolean;
  minPlayers: number;
  maxPlayers: number;
  mobile: boolean;
  desktop: boolean;
  portrait: boolean;
  playCount: number;
  gameLanguage: string;
  totalScore: number | null;
  publishedAt: Date | null;
}

/** 带召回来源标记的候选（可解释性：哪一路找到了它） */
export interface RecallCandidate extends CandidateGame {
  sources: string[];
  /** 语义相似度 0~1（向量召回/关系召回携带，供 ranking 的 semantic 分项） */
  semanticSim: number;
}

const candidateColumns = {
  id: games.id,
  slug: games.slug,
  title: games.title,
  titleOriginal: games.titleOriginal,
  description: games.description,
  thumbnail: games.thumbnail,
  genre: games.genre,
  tags: games.tags,
  mechanics: games.mechanics,
  mood: games.mood,
  difficulty: games.difficulty,
  cognitiveLoad: games.cognitiveLoad,
  complexity: games.complexity,
  pace: games.pace,
  stressLevel: games.stressLevel,
  sessionLengthMin: games.sessionLengthMin,
  sessionLengthMax: games.sessionLengthMax,
  multiplayer: games.multiplayer,
  minPlayers: games.minPlayers,
  maxPlayers: games.maxPlayers,
  mobile: games.mobile,
  desktop: games.desktop,
  portrait: games.portrait,
  playCount: games.playCount,
  gameLanguage: games.gameLanguage,
  totalScore: gameScores.totalScore,
  publishedAt: games.publishedAt,
};

const published = eq(games.status, "published");

async function selectCandidates(
  conds: SQL[],
  order: SQL,
  limit: number,
): Promise<CandidateGame[]> {
  const rows = await db
    .select(candidateColumns)
    .from(games)
    .leftJoin(gameScores, eq(gameScores.gameId, games.id))
    .where(and(published, ...conds))
    .orderBy(order)
    .limit(limit);
  return rows;
}

/* ===== ① SQL 条件召回 ===== */

/** intent 中的条件 → SQL（硬条件 players/platform 必加；软条件宽松 OR 组合提升召回率） */
export async function sqlRecall(intent: GameIntent): Promise<CandidateGame[]> {
  const conds: SQL[] = [];

  // 硬条件
  if (typeof intent.players === "number") {
    conds.push(
      and(
        lte(games.minPlayers, intent.players),
        gte(games.maxPlayers, intent.players),
      )!,
    );
  }
  if (intent.platform === "mobile") conds.push(eq(games.mobile, true));
  if (intent.platform === "desktop") conds.push(eq(games.desktop, true));
  if (intent.orientation === "portrait") conds.push(eq(games.portrait, true));

  // 软条件（命中越多排序越靠前；任一不满足不排除，交给 ranking）
  const soft: SQL[] = [];
  if (intent.sessionLengthMax != null)
    soft.push(lte(games.sessionLengthMin, intent.sessionLengthMax));
  if (intent.sessionLengthMin != null)
    soft.push(gte(games.sessionLengthMax, intent.sessionLengthMin));
  if (intent.difficultyMax != null)
    soft.push(lte(games.difficulty, intent.difficultyMax));
  if (intent.cognitiveLoadMax != null)
    soft.push(lte(games.cognitiveLoad, intent.cognitiveLoadMax));
  if (intent.complexityMax != null)
    soft.push(lte(games.complexity, intent.complexityMax));
  if (intent.difficultyMin != null)
    soft.push(gte(games.difficulty, intent.difficultyMin));
  if (intent.cognitiveLoadMin != null)
    soft.push(gte(games.cognitiveLoad, intent.cognitiveLoadMin));
  if (intent.complexityMin != null)
    soft.push(gte(games.complexity, intent.complexityMin));
  if (intent.genre) soft.push(eq(games.genre, intent.genre));

  // mood 数组 → JSON 包含（games.mood 是 JSON 数组字符串）
  const moodTags = intent.mood ?? [];
  for (const m of moodTags) {
    soft.push(ilike(games.mood, `%"${m}"%`));
  }

  // 软条件排序：命中数多的优先（CASE 计数），同分按 play_count
  const softScore = soft.length
    ? sql`(${sql.join(
        soft.map((c) => sql`(CASE WHEN ${c} THEN 1 ELSE 0 END)`),
        sql` + `,
      )}) DESC`
    : sql`0`;
  const order = sql`${softScore}, ${desc(games.playCount)}, ${desc(games.publishedAt)}`;

  // 条件全空（如 random）时退化为热门序
  const allConds = conds.length ? conds : [];
  if (allConds.length === 0 && soft.length === 0) {
    return selectCandidates([], desc(games.playCount), RECALL_QUOTA.sql);
  }

  return selectCandidates(allConds, order, RECALL_QUOTA.sql);
}

/* ===== ② 关键词召回 ===== */

/**
 * 关键词召回：intent 的 genre/similarTo 名字 + 原始输入的高价值词。
 * M5 用 ILIKE 简易实现（风险 R2 预案：托管 PG 无 zhparser 时 bigram/ILIKE 兜底）。
 */
export async function keywordRecall(
  keywords: string[],
): Promise<CandidateGame[]> {
  const words = keywords.map((w) => w.trim()).filter((w) => w.length >= 2);
  if (words.length === 0) return [];

  const like = `%${words[0]}%`;
  return selectCandidates(
    [
      or(
        ilike(games.title, like),
        ilike(games.titleOriginal, like),
        ilike(games.tags, like),
        ilike(games.description, like),
      )!,
    ],
    desc(games.playCount),
    RECALL_QUOTA.keyword,
  );
}

/* ===== ③ pgvector 语义召回 ===== */

/**
 * intent → 语义查询文本（与游戏 embedding 拼装口径对齐，embedding.ts buildEmbeddingText）。
 */
export function buildIntentQueryText(intent: GameIntent): string {
  const parts: string[] = [];
  if (intent.genre) parts.push(`类型：${intent.genre}`);
  if (intent.mood?.length)
    parts.push(
      `心情：${intent.mood
        .map((m) => ({ casual: "休闲", relaxing: "放松", focus: "专注", brain_burn: "烧脑", exciting: "刺激", competitive: "竞技", nostalgic: "怀旧", chill: "治愈" })[m] ?? m)
        .join("、")}`,
    );
  const caps: string[] = [];
  if (intent.difficultyMax != null && intent.difficultyMax <= 2) caps.push("难度低");
  if (intent.difficultyMin != null && intent.difficultyMin >= 4) caps.push("难度高");
  if (intent.cognitiveLoadMax != null && intent.cognitiveLoadMax <= 2) caps.push("认知负担低");
  if (intent.cognitiveLoadMin != null && intent.cognitiveLoadMin >= 4) caps.push("认知负担高");
  if (intent.complexityMax != null && intent.complexityMax <= 2) caps.push("简单");
  if (intent.complexityMin != null && intent.complexityMin >= 4) caps.push("复杂");
  if (caps.length) parts.push(`体验：${caps.join("，")}`);
  if (intent.sessionLengthMax != null)
    parts.push(`单局时长不超过${intent.sessionLengthMax}分钟`);
  if (intent.sessionLengthMin != null)
    parts.push(`单局时长至少${intent.sessionLengthMin}分钟`);
  if (intent.players === 2) parts.push("双人游戏");
  else if (intent.players != null && intent.players > 2) parts.push("多人游戏");
  if (intent.platform === "mobile") parts.push("手机可玩");
  if (intent.similarTo) parts.push(`类似《${intent.similarTo}》的游戏`);
  if (parts.length === 0) parts.push("好玩的游戏");
  return parts.join("\n");
}

export interface VectorRecallResult {
  games: CandidateGame[];
  /** query 向量是否成功生成（失败=embedding 未配置/调用失败，semantic 分项记 0） */
  available: boolean;
}

/**
 * 语义召回：
 * - 有参考游戏且其向量存在 → 直接用参考游戏向量（similar_to 场景，PRD §5 场景 F）
 * - 否则对 intent 描述文本生成 query 向量
 * 未配置 embedding 时 available=false，调用方跳过该路。
 */
export async function vectorRecall(
  intent: GameIntent,
  reference: ReferenceGame | null,
): Promise<VectorRecallResult> {
  if (!embeddingConfigured()) return { games: [], available: false };

  let queryVector: number[] | null = null;
  try {
    // 参考游戏向量优先（已发布的画像向量）
    if (reference) {
      const rows = await db
        .select({ embedding: gameEmbeddings.embedding })
        .from(gameEmbeddings)
        .where(eq(gameEmbeddings.gameId, reference.id))
        .limit(1);
      const raw = rows[0]?.embedding;
      if (raw) {
        queryVector = parseVector(raw);
      }
    }

    // 无参考向量 → intent 文本 embedding
    if (!queryVector) {
      const [vec] = await generateEmbeddings([
        { text: buildIntentQueryText(intent) },
      ]);
      if (vec && vec.length > 0) queryVector = vec;
    }

    if (!queryVector) return { games: [], available: false };

    const vecLiteral = `[${queryVector.join(",")}]`;
    const rows = await db.execute(sql`
      SELECT g.id, g.slug, g.title, g.title_original, g.description, g.thumbnail,
             g.genre, g.tags, g.mechanics, g.mood,
             g.difficulty, g.cognitive_load, g.complexity, g.pace, g.stress_level,
             g.session_length_min, g.session_length_max,
             g.multiplayer, g.min_players, g.max_players,
             g.mobile, g.desktop, g.portrait,
             g.play_count, g.game_language,
             gs.total_score, g.published_at,
             1 - (ge.embedding <=> ${vecLiteral}::vector) AS similarity
      FROM game_embeddings ge
      JOIN games g ON g.id = ge.game_id
      LEFT JOIN game_scores gs ON gs.game_id = g.id
      WHERE g.status = 'published'
      ORDER BY ge.embedding <=> ${vecLiteral}::vector
      LIMIT ${RECALL_QUOTA.vector}
    `);

    return {
      games: (rows.rows as Record<string, unknown>[]).map(mapRawCandidate),
      available: true,
    };
  } catch (err) {
    console.warn(
      "[recall] vector recall failed (skipped):",
      err instanceof Error ? err.message : String(err),
    );
    return { games: [], available: false };
  }
}

/** game_embeddings.embedding 列（customType，驱动返回字符串 "[1,2,...]"）→ number[] */
function parseVector(raw: string): number[] | null {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(Number) : null;
  } catch {
    return null;
  }
}

/** 原生 SQL 行（snake_case）→ CandidateGame（+ 可选 similarity） */
function mapRawCandidate(r: Record<string, unknown>): CandidateGame & {
  similarity?: number;
} {
  return {
    id: r.id as number,
    slug: r.slug as string,
    title: r.title as string,
    titleOriginal: r.title_original as string,
    description: (r.description as string) ?? "",
    thumbnail: (r.thumbnail as string | null) ?? null,
    genre: (r.genre as string | null) ?? null,
    tags: (r.tags as string) ?? "[]",
    mechanics: (r.mechanics as string) ?? "[]",
    mood: (r.mood as string) ?? "[]",
    difficulty: (r.difficulty as number) ?? 3,
    cognitiveLoad: (r.cognitive_load as number) ?? 3,
    complexity: (r.complexity as number) ?? 3,
    pace: (r.pace as number) ?? 3,
    stressLevel: (r.stress_level as number) ?? 3,
    sessionLengthMin: (r.session_length_min as number | null) ?? null,
    sessionLengthMax: (r.session_length_max as number | null) ?? null,
    multiplayer: (r.multiplayer as boolean) ?? false,
    minPlayers: (r.min_players as number) ?? 1,
    maxPlayers: (r.max_players as number) ?? 1,
    mobile: (r.mobile as boolean) ?? false,
    desktop: (r.desktop as boolean) ?? true,
    portrait: (r.portrait as boolean) ?? false,
    playCount: (r.play_count as number) ?? 0,
    gameLanguage: (r.game_language as string) ?? "en",
    totalScore: (r.total_score as number | null) ?? null,
    publishedAt: r.published_at ? new Date(r.published_at as string) : null,
    similarity:
      r.similarity != null ? Number(r.similarity) : undefined,
  };
}

/* ===== ④ 热门兜底 ===== */

export async function popularRecall(): Promise<CandidateGame[]> {
  // play_count 全 0 的冷启动期按最新发布兜底，M6 后自然切到热门
  return selectCandidates(
    [],
    sql`${desc(games.playCount)}, ${desc(games.publishedAt)}`,
    RECALL_QUOTA.popular,
  );
}

/* ===== ⑤ 相似游戏扩展 ===== */

export async function relationsRecall(
  referenceId: number,
): Promise<(CandidateGame & { similarity?: number })[]> {
  const rows = await db.execute(sql`
    SELECT g.id, g.slug, g.title, g.title_original, g.description, g.thumbnail,
           g.genre, g.tags, g.mechanics, g.mood,
           g.difficulty, g.cognitive_load, g.complexity, g.pace, g.stress_level,
           g.session_length_min, g.session_length_max,
           g.multiplayer, g.min_players, g.max_players,
           g.mobile, g.desktop, g.portrait,
           g.play_count, g.game_language,
           gs.total_score, g.published_at, gr.similarity
    FROM game_relations gr
    JOIN games g ON g.id = gr.related_game_id
    LEFT JOIN game_scores gs ON gs.game_id = g.id
    WHERE gr.game_id = ${referenceId} AND g.status = 'published'
    ORDER BY gr.similarity DESC
    LIMIT ${RECALL_QUOTA.relations}
  `);
  return (rows.rows as Record<string, unknown>[]).map(mapRawCandidate);
}

/* ===== 合并 ===== */

export interface RecallResult {
  candidates: RecallCandidate[];
  vectorAvailable: boolean;
}

/** 五路并行召回 + 按 id 去重合并（记录来源） */
export async function recallAll(
  intent: GameIntent,
  rawInput: string,
  reference: ReferenceGame | null,
): Promise<RecallResult> {
  const keywords: string[] = [];
  if (intent.similarTo) keywords.push(intent.similarTo);
  if (intent.genre) keywords.push(intent.genre);
  // 短输入（≤6 字）整体作为关键词，如"塔防 双人"
  if (rawInput.trim().length <= 6) keywords.unshift(rawInput.trim());

  const [sqlRes, kwRes, vecRes, popRes, relRes] = await Promise.allSettled([
    sqlRecall(intent),
    keywordRecall(keywords),
    vectorRecall(intent, reference),
    popularRecall(),
    reference ? relationsRecall(reference.id) : Promise.resolve([]),
  ]);

  const byId = new Map<number, RecallCandidate>();
  const add = (list: (CandidateGame & { similarity?: number })[], source: string) => {
    for (const g of list) {
      const sim = g.similarity != null ? Math.max(0, Math.min(1, g.similarity)) : 0;
      const existing = byId.get(g.id);
      if (existing) {
        existing.sources.push(source);
        existing.semanticSim = Math.max(existing.semanticSim, sim);
      } else {
        const { similarity: _ignored, ...rest } = g;
        byId.set(g.id, { ...rest, sources: [source], semanticSim: sim });
      }
    }
  };

  if (sqlRes.status === "fulfilled") add(sqlRes.value, "sql");
  else console.warn("[recall] sql failed:", sqlRes.reason);
  if (kwRes.status === "fulfilled") add(kwRes.value, "keyword");
  else console.warn("[recall] keyword failed:", kwRes.reason);

  let vectorAvailable = false;
  if (vecRes.status === "fulfilled") {
    add(vecRes.value.games, "vector");
    vectorAvailable = vecRes.value.available;
  } else {
    console.warn("[recall] vector failed:", vecRes.reason);
  }

  if (popRes.status === "fulfilled") add(popRes.value, "popular");
  else console.warn("[recall] popular failed:", popRes.reason);
  if (relRes.status === "fulfilled") add(relRes.value, "relations");
  else console.warn("[recall] relations failed:", relRes.reason);

  return { candidates: [...byId.values()], vectorAvailable };
}
