/**
 * 后台 AI 管理查询层（T4.5，PRD §36）。
 * 提供：人工修正 AI 画像、单游戏重新分析、重建 Embedding。
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { gameEmbeddings, games } from "@/lib/db/schema";
import { analyzeGame } from "@/lib/ai/analyze-game";
import { generateEmbedding } from "@/lib/ai/embedding";
import { profileToUpdate } from "@/lib/ai/job";
import { gameProfileSchema } from "@/lib/ai/schemas";

/** 人工修正画像：前端提交可编辑字段，标记 profile_manually_edited=true */
export async function adminUpdateGameProfile(
  id: number,
  patch: Record<string, unknown>,
) {
  const existing = await db.select().from(games).where(eq(games.id, id)).limit(1);
  if (!existing[0]) return undefined;

  const editable: Record<string, unknown> = { updatedAt: new Date() };

  // 标量字段
  const scalarFields: Record<string, keyof typeof games.$inferSelect> = {
    title: "title",
    description: "description",
    genre: "genre",
    subGenre: "subGenre",
  };
  for (const [key, col] of Object.entries(scalarFields)) {
    if (patch[key] !== undefined) editable[col] = patch[key];
  }

  // 体验属性 1~5
  const expFields: Record<string, keyof typeof games.$inferSelect> = {
    difficulty: "difficulty",
    cognitiveLoad: "cognitiveLoad",
    complexity: "complexity",
    pace: "pace",
    stressLevel: "stressLevel",
    replayability: "replayability",
  };
  for (const [key, col] of Object.entries(expFields)) {
    if (patch[key] !== undefined) {
      const v = Number(patch[key]);
      if (Number.isInteger(v) && v >= 1 && v <= 5) editable[col] = v;
    }
  }

  // JSON 数组字段
  const jsonFields: Record<string, keyof typeof games.$inferSelect> = {
    tags: "tags",
    mechanics: "mechanics",
    mood: "mood",
    inputMethods: "inputMethods",
  };
  for (const [key, col] of Object.entries(jsonFields)) {
    if (Array.isArray(patch[key])) editable[col] = JSON.stringify(patch[key]);
  }

  // 布尔字段
  const boolFields: Record<string, keyof typeof games.$inferSelect> = {
    coop: "coop",
    competitive: "competitive",
    desktop: "desktop",
    mobile: "mobile",
    tablet: "tablet",
    portrait: "portrait",
    landscape: "landscape",
  };
  for (const [key, col] of Object.entries(boolFields)) {
    if (typeof patch[key] === "boolean") editable[col] = patch[key];
  }

  // 时长/人数
  const intFields: Record<string, keyof typeof games.$inferSelect> = {
    sessionLengthMin: "sessionLengthMin",
    sessionLengthMax: "sessionLengthMax",
    minPlayers: "minPlayers",
    maxPlayers: "maxPlayers",
  };
  for (const [key, col] of Object.entries(intFields)) {
    if (patch[key] !== undefined) {
      const v = Number(patch[key]);
      if (Number.isInteger(v) && v >= 0) editable[col] = v;
    }
  }

  // 语言
  if (typeof patch.gameLanguage === "string" && patch.gameLanguage.length <= 5)
    editable.gameLanguage = patch.gameLanguage;
  if (patch.metadataLanguage === "zh" || patch.metadataLanguage === "en")
    editable.metadataLanguage = patch.metadataLanguage;

  editable.profileManuallyEdited = true;

  const updated = await db
    .update(games)
    .set(editable as never)
    .where(eq(games.id, id))
    .returning();
  return updated[0];
}

/** 单游戏重新分析：调用 LLM → 校验 → 落库 → 发布（覆盖质量门禁同款逻辑） */
export async function adminReanalyzeGame(id: number) {
  const existing = await db.select().from(games).where(eq(games.id, id)).limit(1);
  const game = existing[0];
  if (!game) return undefined;

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

  if (!result.success || !result.profile) {
    return { ok: false, error: result.error ?? "analysis_failed" };
  }

  // 人工修正过的不强行覆盖 title/description（保留人工偏好），其余字段覆盖
  const patch = profileToUpdate(result.profile);
  if (game.profileManuallyEdited) {
    delete (patch as { title?: string }).title;
    delete (patch as { description?: string }).description;
  }

  await db
    .update(games)
    .set({
      ...patch,
      status: "published",
      publishedAt: new Date(),
      needsReanalysis: false,
      analysisFailCount: 0,
      updatedAt: new Date(),
    })
    .where(eq(games.id, id));

  return { ok: true, profile: result.profile };
}

/** 单游戏重建 Embedding（成功后返回 embedding 摘要） */
export async function adminReembedGame(id: number) {
  if (!process.env.EMBEDDING_MODEL) {
    const err = new Error("EMBEDDING_MODEL 未配置，当前网关不支持 embeddings") as Error & { code?: string };
    err.code = "embedding_disabled";
    throw err;
  }
  const existing = await db.select().from(games).where(eq(games.id, id)).limit(1);
  const game = existing[0];
  if (!game) return undefined;

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

  const { vector, hash } = await generateEmbedding(source);
  const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
  const vecStr = `[${vector.join(",")}]`;

  await db
    .insert(gameEmbeddings)
    .values({ gameId: id, embedding: vecStr as never, contentHash: hash, model })
    .onConflictDoUpdate({
      target: gameEmbeddings.gameId,
      set: { embedding: vecStr as never, contentHash: hash, model, updatedAt: new Date() },
    });

  return { ok: true, dimensions: vector.length, hash };
}

/** 为后台提供画像校验（前端编辑时可调用） */
export function validateGameProfileInput(input: unknown) {
  return gameProfileSchema.safeParse(input);
}
