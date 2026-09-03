/**
 * Embedding 批量生成 job（T4.2）。
 *
 * 为已发布游戏生成画像向量并写入 game_embeddings。
 * 增量：通过 content_hash 判断画像是否变化，避免重复调用费用。
 * 只处理 published 且尚无向量（或向量 hash 与当前画像不一致）的游戏。
 *
 * 降级：若网关不支持 embeddings（如 DeepSeek），generateEmbedding 会抛错，
 * 此处捕获并记录，不影响游戏主体数据，避免阻塞整批。
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { gameEmbeddings, games } from "@/lib/db/schema";
import {
  buildEmbeddingText,
  contentHash,
  embeddingConfigured,
  generateEmbedding,
  isValidVectorDim,
} from "./embedding";
import { getEmbeddingModelId } from "./embedding-client";

export interface EmbeddingStats {
  scanned: number;
  newEmbeddings: number;
  updatedEmbeddings: number;
  skippedUnchanged: number;
  failed: number;
  error?: string;
}

const VECTOR_DIM = 1536;

/** 是否允许调用嵌入端点（需配置 EMBEDDING 三要素；DeepSeek 等网关不支持时可关闭） */
function embeddingEnabled(): boolean {
  return embeddingConfigured();
}

export async function runEmbeddingJob(limit = 20): Promise<EmbeddingStats> {
  const stats: EmbeddingStats = {
    scanned: 0,
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

  try {
    const candidates = await db
      .select()
      .from(games)
      .where(eq(games.status, "published"))
      .limit(limit);

    stats.scanned = candidates.length;

    for (const game of candidates) {
      // 已有向量及 hash（判断需否重算）
      const existing = await db
        .select()
        .from(gameEmbeddings)
        .where(eq(gameEmbeddings.gameId, game.id))
        .limit(1);
      const existingRow = existing[0];

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
      const targetText = buildEmbeddingText(source);
      const targetHash = contentHash(targetText);

      if (existingRow && existingRow.contentHash === targetHash) {
        stats.skippedUnchanged++;
        continue;
      }

      try {
        const { vector } = await generateEmbedding(source);
        if (!isValidVectorDim(vector)) {
          // 非 1536 维（模型未按 dimensions 输出）仍可写入，但 pgvector 存储可能尺寸不匹配；
          // 记录失败避免类型不匹配错误。
          stats.failed++;
          console.warn(
            `[embedding] #${game.id} "${game.title}" 向量维度 ${vector.length} != ${VECTOR_DIM}，跳过`,
          );
          continue;
        }

        const model = getEmbeddingModelId();
        const vecStr = `[${vector.join(",")}]`;

        if (existingRow) {
          await db
            .update(gameEmbeddings)
            .set({
              embedding: vecStr as never,
              contentHash: targetHash,
              model,
              updatedAt: new Date(),
            })
            .where(eq(gameEmbeddings.gameId, game.id));
          stats.updatedEmbeddings++;
        } else {
          await db
            .insert(gameEmbeddings)
            .values({
              gameId: game.id,
              embedding: vecStr as never,
              contentHash: targetHash,
              model,
            });
          stats.newEmbeddings++;
        }
      } catch (err) {
        stats.failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[embedding] #${game.id} "${game.title}" 失败: ${msg}`);
      }
    }

    return stats;
  } catch (err) {
    stats.error = err instanceof Error ? err.message : String(err);
    console.error("[embedding] batch failed:", err);
    return stats;
  }
}
