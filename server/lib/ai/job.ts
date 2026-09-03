/**
 * 批量 AI 画像分析 job（T4.1~T4.3）。
 *
 * 消费待分析游戏：
 * 1. 批量调用 LLM（一次 20 个游戏）生成结构化画像 + 中文化，省 system prompt 重复开销
 * 2. 批量结果缺失的游戏回退单条调用（带重试）兜底
 * 3. 画像落库（覆盖展示字段：title/description/genre/tags/体验属性/设备/语言等）
 * 4. Quality Gate：必填字段完整 + 值域合法 + 缩略图可用 → published；否则 pending
 *
 * 费用：仅分析新增(draft)/变更(published+needsReanalysis)游戏，成本可控。
 */
import { and, asc, eq, gt, inArray, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { gameEmbeddings, games } from "@/lib/db/schema";
import {
  analyzeGame,
  analyzeGamesBatch,
  type GameRawData,
} from "./analyze-game";
import {
  buildEmbeddingText,
  contentHash,
  embeddingConfigured,
  generateEmbeddings,
  isValidVectorDim,
  type GameEmbeddingSource,
} from "./embedding";
import { getEmbeddingModelId } from "./embedding-client";
import type { GameProfile } from "./schemas";

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

/** 批量大小：一次 LLM 调用包含的游戏数（游戏元数据体量小，批量摊薄 system prompt 开销） */
const ANALYZE_BATCH_SIZE = 20;

/** DB 行 → analyze 输入结构 */
function toRawData(game: typeof games.$inferSelect): GameRawData {
  return {
    id: game.id,
    titleOriginal: game.titleOriginal,
    descriptionOriginal: game.descriptionOriginal,
    tags: game.tags,
    genre: game.genre,
    screenshots: game.screenshots,
    mobile: game.mobile,
    desktop: game.desktop,
  };
}

export interface EmbeddingTarget {
  gameId: number;
  title: string;
  source: GameEmbeddingSource;
}

/** 画像落库：质检 → published / pending。发布成功的返回其 embedding 目标，
 *  由 runChunk 攒批后统一批量生成向量，避免逐条串行拖慢全量分析。 */
async function applyGameProfile(
  game: typeof games.$inferSelect,
  profile: GameProfile,
  stats: AnalyzeStats,
): Promise<EmbeddingTarget | null> {
  const patch = profileToUpdate(profile);

  if (!passesQualityGate(profile, game.thumbnail)) {
    stats.pending++;
    await db
      .update(games)
      .set({ ...patch, status: "pending" })
      .where(eq(games.id, game.id));
    console.warn(
      `[analyze-games] #${game.id} "${game.titleOriginal}" 质检不过 → pending`,
    );
    return null;
  }

  stats.published++;
  await db
    .update(games)
    .set({ ...patch, status: "published", publishedAt: new Date() })
    .where(eq(games.id, game.id));
  console.log(
    `[analyze-games] #${game.id} "${profile.titleZh}" 已发布 (${profile.genre}, 难度${profile.difficulty})`,
  );

  // 用画像更新后的字段（中文标题/简介/标签等）构建 embedding 源，返回给调用方批量生成
  const { subGenre: _sub, ...patchNoUndef } = patch;
  const merged = { ...game, ...patchNoUndef };
  const source: GameEmbeddingSource = {
    title: merged.title ?? "",
    description: merged.description ?? "",
    genre: merged.genre,
    tags: merged.tags ?? "[]",
    mechanics: merged.mechanics ?? "[]",
    mood: merged.mood ?? "[]",
    difficulty: merged.difficulty ?? 0,
    cognitiveLoad: merged.cognitiveLoad ?? 0,
    sessionLengthMin: merged.sessionLengthMin,
    multiplayer: merged.multiplayer ?? false,
    mobile: merged.mobile ?? false,
    desktop: merged.desktop ?? false,
  };
  return { gameId: game.id, title: profile.titleZh, source };
}

// 单游戏分析失败：标记 pending 待重试
async function markFailed(
  game: typeof games.$inferSelect,
  stats: AnalyzeStats,
  reason?: string,
): Promise<void> {
  stats.failed++;
  await db
    .update(games)
    .set({ status: "pending", updatedAt: new Date() })
    .where(eq(games.id, game.id));
  console.warn(
    `[analyze-games] #${game.id} "${game.titleOriginal}" 分析失败: ${reason ?? "unknown"}`,
  );
}

/**
 * 批量生成画像向量并写入 game_embeddings（T4.2 并入 analyze）。
 * 一次 embedding API 调用处理一个 batch 内多条文本，避免逐条串行拖慢全量分析。
 * 仅当 embedding 已配置（EMBEDDING_* 三要素齐备）时执行；否则记录 embedSkipped。
 * 失败不影响游戏发布主体流程。
 */
async function embedBatch(
  targets: EmbeddingTarget[],
  stats: AnalyzeStats,
): Promise<void> {
  if (targets.length === 0) return;
  if (!embeddingConfigured()) {
    stats.embedSkipped += targets.length;
    return;
  }

  const texts = targets.map((t) => buildEmbeddingText(t.source));
  const model = getEmbeddingModelId();

  let vectors: number[][];
  try {
    vectors = await generateEmbeddings(texts.map((text) => ({ text })));
  } catch (err) {
    // 整批 embedding 失败 → 全部跳过，不阻塞画像发布
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[analyze-games] 批量 embedding 失败（${targets.length} 条跳过，可稍后重试）: ${msg}`,
    );
    stats.embedSkipped += targets.length;
    return;
  }

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const vector = vectors[i];
    if (!vector || vector.length === 0) {
      console.warn(
        `[analyze-games] #${target.gameId} "${target.title}" 无向量返回，跳过 embedding`,
      );
      stats.embedSkipped++;
      continue;
    }
    if (!isValidVectorDim(vector)) {
      console.warn(
        `[analyze-games] #${target.gameId} "${target.title}" 向量维度 ${vector.length} != 1536，跳过 embedding`,
      );
      stats.embedSkipped++;
      continue;
    }

    const targetHash = contentHash(texts[i]);
    const vecStr = `[${vector.join(",")}]`;
    try {
      await db
        .insert(gameEmbeddings)
        .values({
          gameId: target.gameId,
          embedding: vecStr as never,
          contentHash: targetHash,
          model,
        })
        .onConflictDoUpdate({
          target: gameEmbeddings.gameId,
          set: {
            embedding: vecStr as never,
            contentHash: targetHash,
            model,
            updatedAt: new Date(),
          },
        });
      stats.embedded++;
    } catch (err) {
      stats.embedSkipped++;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[analyze-games] #${target.gameId} "${target.title}" embedding 落库失败: ${msg}`,
      );
    }
  }
}

/**
 * 分析一批待处理游戏（批量：一次 LLM 调用处理 ANALYZE_BATCH_SIZE 个，失败单条回退）。
 * 处理范围：
 * - draft / pending 且未标记 reanalysis（全新或重试）
 * - published 且 needsReanalysis=true（源更新后重新分析）
 */
export async function runAnalyzeGames(limit = 200): Promise<AnalyzeStats> {
  const stats: AnalyzeStats = {
    scanned: 0,
    analyzed: 0,
    published: 0,
    pending: 0,
    failed: 0,
    embedded: 0,
    embedSkipped: 0,
  };

  // 候选查询。limit>0：一次取 limit 条；limit=0（全量模式）以 id 游标翻页拉完所有候选。
  const baseCond = or(
    and(
      inArray(games.status, ["draft", "pending"]),
      eq(games.needsReanalysis, false),
    ),
    and(
      eq(games.status, "published"),
      eq(games.needsReanalysis, true),
    ),
  );
  const fetchCandidates = (limitN: number, afterId?: number) =>
    db
      .select()
      .from(games)
      .where(afterId === undefined ? baseCond : and(baseCond, gt(games.id, afterId)))
      .orderBy(asc(games.id))
      .limit(limitN);

  try {
    // 单轮限量执行块（一次调用按 ANALYZE_BATCH_SIZE 再分批）。
    const runChunk = async (chunkGames: (typeof games.$inferSelect)[]) => {
      const profiles = await analyzeGamesBatch(chunkGames.map(toRawData));
      const embedTargets: EmbeddingTarget[] = [];

      for (const game of chunkGames) {
        stats.analyzed++;

        let profile = profiles.get(game.id);
        if (!profile) {
          // 批量结果缺失该游戏 → 单条兜底（带重试）
          const result = await analyzeGame(toRawData(game));
          if (result.success && result.profile) {
            profile = result.profile;
          } else {
            await markFailed(game, stats, result.error);
            continue;
          }
        }

        const target = await applyGameProfile(game, profile, stats);
        if (target) embedTargets.push(target);
      }

      // 整批统一生成 embedding（一次调用批量，避免逐条串行）
      await embedBatch(embedTargets, stats);
    };

    if (limit > 0) {
      const candidates = await fetchCandidates(limit);
      stats.scanned = candidates.length;
      for (let i = 0; i < candidates.length; i += ANALYZE_BATCH_SIZE) {
        await runChunk(candidates.slice(i, i + ANALYZE_BATCH_SIZE));
      }
    } else {
      // 全量模式：按 id 游标翻页，一次取 ANALYZE_BATCH_SIZE 条，直到候选掏空。
      // id 递增且可靠，处理落库（published）不影响后续游标，稳定跑完全部。
      let afterId: number | undefined;
      for (;;) {
        const candidates = await fetchCandidates(ANALYZE_BATCH_SIZE, afterId);
        if (candidates.length === 0) break;
        stats.scanned += candidates.length;
        for (let i = 0; i < candidates.length; i += ANALYZE_BATCH_SIZE) {
          await runChunk(candidates.slice(i, i + ANALYZE_BATCH_SIZE));
        }
        afterId = candidates[candidates.length - 1].id;
      }
    }

    return stats;
  } catch (err) {
    stats.error = err instanceof Error ? err.message : String(err);
    console.error("[analyze-games] batch failed:", err);
    return stats;
  }
}
