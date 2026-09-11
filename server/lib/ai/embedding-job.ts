/**
 * Embedding 批量生成 job（T4.2）。
 *
 * 为已发布游戏生成画像向量并写入 game_embeddings。
 * 增量：通过 content_hash 判断画像是否变化，避免重复调用费用。
 * 只处理 published 且尚无向量（或向量 hash 与当前画像不一致）的游戏。
 *
 * 降级：embedding 批次失败时有限重试，持续失败则停止任务；已完成页面保持落库，重跑时幂等跳过。
 */
import { and, asc, eq, getTableColumns, gt, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { gameEmbeddings, games } from "@/lib/db/schema";
import { isQuotaError } from "./analyze-game";
import {
  buildEmbeddingText,
  contentHash,
  embeddingConfigured,
  generateEmbeddings,
  isValidVectorDim,
} from "./embedding";
import { getEmbeddingModelId } from "./embedding-client";

export interface EmbeddingJobOptions {
  pageSize?: number;
  batchSize?: number;
  /** 0 表示扫描全部已发布游戏 */
  maxGames?: number;
}

export interface EmbeddingStats {
  scanned: number;
  pages: number;
  pageSize: number;
  batchSize: number;
  maxGames: number;
  newEmbeddings: number;
  updatedEmbeddings: number;
  skippedUnchanged: number;
  failed: number;
  error?: string;
}

const VECTOR_DIM = 1536;
const MAX_RETRIES = 3;

/** 是否允许调用嵌入端点（需配置 EMBEDDING 三要素；DeepSeek 等网关不支持时可关闭） */
function embeddingEnabled(): boolean {
  return embeddingConfigured();
}

function normalizeInteger(
  value: number | undefined,
  fallback: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(value)));
}

async function generateBatchWithRetry(
  items: { text: string }[],
): Promise<number[][]> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await generateEmbeddings(items);
    } catch (err) {
      if (isQuotaError(err) || attempt >= MAX_RETRIES) throw err;
      console.warn(
        `[embedding] batch request failed, retry ${attempt}/${MAX_RETRIES - 1}: ${err instanceof Error ? err.message : String(err)}`,
      );
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
}

export async function runEmbeddingJob(
  options: EmbeddingJobOptions = {},
): Promise<EmbeddingStats> {
  const pageSize = normalizeInteger(options.pageSize, 100, 500);
  const batchSize = normalizeInteger(options.batchSize, 5, 20);
  const maxGames =
    typeof options.maxGames === "number" && Number.isFinite(options.maxGames)
      ? Math.max(0, Math.trunc(options.maxGames))
      : 0;
  const stats: EmbeddingStats = {
    scanned: 0,
    pages: 0,
    pageSize,
    batchSize,
    maxGames,
    newEmbeddings: 0,
    updatedEmbeddings: 0,
    skippedUnchanged: 0,
    failed: 0,
  };

  if (!embeddingEnabled()) {
    stats.error =
      "EMBEDDING_BASE_URL / EMBEDDING_API_KEY / EMBEDDING_MODEL 未完整配置，跳过 embedding 生成。";
    console.warn("[embedding] " + stats.error);
    return stats;
  }

  const model = getEmbeddingModelId();
  const columns = getTableColumns(games);
  const fetchCandidates = (limit: number, afterId?: number) =>
    db
      .select({
        ...columns,
        embeddingContentHash: gameEmbeddings.contentHash,
        embeddingModel: gameEmbeddings.model,
      })
      .from(games)
      .leftJoin(gameEmbeddings, eq(gameEmbeddings.gameId, games.id))
      .where(
        afterId === undefined
          ? eq(games.status, "published")
          : and(eq(games.status, "published"), gt(games.id, afterId)),
      )
      .orderBy(asc(games.id))
      .limit(limit);

  try {
    let afterId: number | undefined;
    let nextProgressLog = 1000;

    for (;;) {
      const remaining = maxGames === 0
        ? pageSize
        : Math.min(pageSize, maxGames - stats.scanned);
      if (remaining <= 0) break;

      const candidates = await fetchCandidates(remaining, afterId);
      if (candidates.length === 0) break;

      stats.pages++;
      stats.scanned += candidates.length;
      afterId = candidates[candidates.length - 1].id;

      const targets = candidates.flatMap((game) => {
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

        // 计算目标 hash（与生成用同一文本拼接逻辑）
        const text = buildEmbeddingText(source);
        const targetHash = contentHash(text);
        if (
          game.embeddingContentHash === targetHash &&
          game.embeddingModel === model
        ) {
          stats.skippedUnchanged++;
          return [];
        }

        return [{
          gameId: game.id,
          title: game.title,
          text,
          targetHash,
          hasEmbedding: game.embeddingContentHash !== null,
        }];
      });

      for (let i = 0; i < targets.length; i += batchSize) {
        const batch = targets.slice(i, i + batchSize);
        let vectors: number[][];
        try {
          vectors = await generateBatchWithRetry(
            batch.map((target) => ({ text: target.text })),
          );
        } catch (err) {
          stats.failed += batch.length;
          throw err;
        }

        const valid = batch.flatMap((target, index) => {
          const vector = vectors[index];
          if (!vector || !isValidVectorDim(vector)) {
            stats.failed++;
            console.warn(
              `[embedding] #${target.gameId} "${target.title}" 向量维度 ${vector?.length ?? 0} != ${VECTOR_DIM}，跳过`,
            );
            return [];
          }
          return [{ target, vector }];
        });
        if (valid.length === 0 && batch.length > 0) {
          throw new Error("embedding batch returned no valid vectors");
        }
        if (valid.length === 0) continue;

        try {
          await db
            .insert(gameEmbeddings)
            .values(
              valid.map(({ target, vector }) => ({
                gameId: target.gameId,
                embedding: `[${vector.join(",")}]` as never,
                contentHash: target.targetHash,
                model,
              })),
            )
            .onConflictDoUpdate({
              target: gameEmbeddings.gameId,
              set: {
                embedding: sql`excluded.embedding`,
                contentHash: sql`excluded.content_hash`,
                model: sql`excluded.model`,
                updatedAt: new Date(),
              },
            });
          stats.newEmbeddings += valid.filter(
            ({ target }) => !target.hasEmbedding,
          ).length;
          stats.updatedEmbeddings += valid.filter(
            ({ target }) => target.hasEmbedding,
          ).length;
        } catch (err) {
          stats.failed += valid.length;
          throw err;
        }
      }

      if (stats.scanned >= nextProgressLog) {
        console.log(
          `[embedding] progress: scanned=${stats.scanned} new=${stats.newEmbeddings} ` +
            `updated=${stats.updatedEmbeddings} skipped=${stats.skippedUnchanged} failed=${stats.failed}`,
        );
        nextProgressLog += 1000;
      }
    }

    return stats;
  } catch (err) {
    stats.error = err instanceof Error ? err.message : String(err);
    console.error("[embedding] batch failed:", err);
    return stats;
  }
}
