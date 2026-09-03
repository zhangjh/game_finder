/**
 * 批量 AI 画像分析 job（T4.1~T4.3）。
 *
 * 消费待分析游戏：
 * 1. 调用 LLM 生成结构化画像 + 中文化（analyze-game）
 * 2. 画像落库（覆盖展示字段：title/description/genre/tags/体验属性/设备/语言等）
 * 3. Quality Gate：必填字段完整 + 值域合法 + 缩略图可用 → published；否则 pending
 *
 * 限流：逐条串行，模型并发/速率限制由 LLM 侧处理。
 * 费用：仅分析新增(draft)/变更(published+needsReanalysis)游戏，成本可控。
 */
import { and, eq, inArray, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { gameEmbeddings, games } from "@/lib/db/schema";
import { analyzeGame } from "./analyze-game";
import {
  buildEmbeddingText,
  contentHash,
  embeddingConfigured,
  generateEmbedding,
  isValidVectorDim,
} from "./embedding";
import { getEmbeddingModelId } from "./embedding-client";

export interface AnalyzeStats {
  scanned: number;
  analyzed: number;
  published: number;
  pending: number;
  failed: number;
  embedded: number;
  embedSkipped: number;
  error?: string;
}

/** 画像落库 payload（仅覆盖 AI 生成/展示字段，不动源事实字段） */
export function profileToUpdate(
  profile: NonNullable<Awaited<ReturnType<typeof analyzeGame>>["profile"]>,
) {
  return {
    title: profile.titleZh,
    description: profile.descriptionZh,
    descriptionZh: profile.descriptionZh,
    genre: profile.genre,
    subGenre: profile.subGenre,
    tags: JSON.stringify(profile.tags),
    mechanics: JSON.stringify(profile.mechanics),
    difficulty: profile.difficulty,
    cognitiveLoad: profile.cognitiveLoad,
    complexity: profile.complexity,
    pace: profile.pace,
    stressLevel: profile.stressLevel,
    replayability: profile.replayability,
    sessionLengthMin: profile.sessionLengthMin,
    sessionLengthMax: profile.sessionLengthMax,
    minPlayers: profile.minPlayers,
    maxPlayers: profile.maxPlayers,
    coop: profile.coop,
    competitive: profile.competitive,
    desktop: profile.desktop,
    mobile: profile.mobile,
    tablet: profile.tablet,
    inputMethods: JSON.stringify(profile.inputMethods),
    mood: JSON.stringify(profile.mood),
    gameLanguage: profile.gameLanguage,
    metadataLanguage: "zh" as const,
    needsReanalysis: false,
    updatedAt: new Date(),
  };
}

/** Quality Gate：必填字段完整性（PRD §T4.3） */
function passesQualityGate(
  profile: NonNullable<Awaited<ReturnType<typeof analyzeGame>>["profile"]>,
  thumbnail: string | null,
): boolean {
  return (
    profile.titleZh.trim().length > 0 &&
    profile.descriptionZh.trim().length >= 10 &&
    profile.genre.trim().length > 0 &&
    profile.tags.length > 0 &&
    profile.mechanics.length > 0 &&
    thumbnail != null &&
    thumbnail.length > 10
  );
}

/** 分析单个待办游戏，返回其画像或失败原因 */
async function processGame(
  game: typeof games.$inferSelect,
  stats: AnalyzeStats,
): Promise<void> {
  const result = await analyzeGame({
    id: game.id,
    titleOriginal: game.titleOriginal,
    descriptionOriginal: game.descriptionOriginal,
    tags: game.tags,
    genre: game.genre,
    screenshots: game.screenshots,
    mobile: game.mobile,
    desktop: game.desktop,
  });

  stats.analyzed++;

  if (!result.success || !result.profile) {
    stats.failed++;
    await db
      .update(games)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(games.id, game.id));
    console.warn(
      `[analyze-games] #${game.id} "${game.titleOriginal}" 分析失败: ${result.error ?? "unknown"}`,
    );
    return;
  }

  const patch = profileToUpdate(result.profile);

  if (!passesQualityGate(result.profile, game.thumbnail)) {
    stats.pending++;
    await db
      .update(games)
      .set({ ...patch, status: "pending" })
      .where(eq(games.id, game.id));
    console.warn(
      `[analyze-games] #${game.id} "${game.titleOriginal}" 质检不过 → pending`,
    );
    return;
  }

  stats.published++;
  await db
    .update(games)
    .set({ ...patch, status: "published", publishedAt: new Date() })
    .where(eq(games.id, game.id));
  console.log(
    `[analyze-games] #${game.id} "${result.profile.titleZh}" 已发布 (${result.profile.genre}, 难度${result.profile.difficulty})`,
  );

  // 发布后即时生成 embedding（跟随发布，不设独立定时任务）
  await embedSingleGame(game, stats);
}

/**
 * 为单个游戏生成画像向量并写入 game_embeddings（T4.2 并入 analyze）。
 * 仅当 embedding 已配置（EMBEDDING_* 三要素齐备）时执行；否则记录 embedSkipped。
 * 失败不影响游戏发布主体流程。
 */
async function embedSingleGame(
  game: typeof games.$inferSelect,
  stats: AnalyzeStats,
): Promise<void> {
  if (!embeddingConfigured()) {
    stats.embedSkipped++;
    return;
  }

  const source = {
    title: game.title,
    description: game.description,
    genre: game.genre,
    tags: game.tags,
    mechanics: game.mechanics,
    mood: game.mood,
    difficulty: game.difficulty,
    cognitiveLoad: game.cognitiveLoad,
    sessionLengthMin: game.sessionLengthMin,
    multiplayer: game.multiplayer,
    mobile: game.mobile,
    desktop: game.desktop,
  };

  const targetText = buildEmbeddingText(source);
  const targetHash = contentHash(targetText);

  try {
    const { vector } = await generateEmbedding(source);
    if (!isValidVectorDim(vector)) {
      console.warn(
        `[analyze-games] #${game.id} "${game.title}" 向量维度 ${vector.length} != 1536，跳过 embedding`,
      );
      stats.embedSkipped++;
      return;
    }

    const vecStr = `[${vector.join(",")}]`;
    await db
      .insert(gameEmbeddings)
      .values({
        gameId: game.id,
        embedding: vecStr as never,
        contentHash: targetHash,
        model: getEmbeddingModelId(),
      })
      .onConflictDoUpdate({
        target: gameEmbeddings.gameId,
        set: {
          embedding: vecStr as never,
          contentHash: targetHash,
          model: getEmbeddingModelId(),
          updatedAt: new Date(),
        },
      });
    stats.embedded++;
    console.log(`[analyze-games] #${game.id} "${game.title}" embedding 已生成`);
  } catch (err) {
    stats.embedSkipped++;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[analyze-games] #${game.id} "${game.title}" embedding 失败（可稍后重试）: ${msg}`,
    );
  }
}

/**
 * 分析一批待处理游戏。
 * 处理范围：
 * - draft / pending 且未标记 reanalysis（全新或重试）
 * - published 且 needsReanalysis=true（源更新后重新分析）
 */
export async function runAnalyzeGames(limit = 20): Promise<AnalyzeStats> {
  const stats: AnalyzeStats = {
    scanned: 0,
    analyzed: 0,
    published: 0,
    pending: 0,
    failed: 0,
    embedded: 0,
    embedSkipped: 0,
  };

  try {
    const candidates = await db
      .select()
      .from(games)
      .where(
        or(
          and(
            inArray(games.status, ["draft", "pending"]),
            eq(games.needsReanalysis, false),
          ),
          and(
            eq(games.status, "published"),
            eq(games.needsReanalysis, true),
          ),
        ),
      )
      .limit(limit);

    stats.scanned = candidates.length;
    for (const game of candidates) {
      await processGame(game, stats);
    }

    return stats;
  } catch (err) {
    stats.error = err instanceof Error ? err.message : String(err);
    console.error("[analyze-games] batch failed:", err);
    return stats;
  }
}
