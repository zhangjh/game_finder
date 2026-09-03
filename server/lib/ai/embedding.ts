/**
 * Embedding 生成（T4.2，PRD §28）。
 *
 * 向量拼装：Game Metadata + 中文描述 + Mechanics + 体验画像（PRD §28）。
 *
 * 使用独立 Embedding 客户端（embedding-client），与 Chat 分离：
 * Chat 走 AI_BASE_URL（如 DeepSeek，无 embeddings 端点），
 * Embedding 走 EMBEDDING_BASE_URL（如阿里云百炼，提供 text-embedding-v4 @1536 维）。
 * 通过 EMBEDDING_BASE_URL / EMBEDDING_API_KEY / EMBEDDING_MODEL 配置；
 * 未配置时 embeddingConfigured() 返回 false，调用方（job）优雅跳过。
 */
import {
  embeddingConfigured,
  getEmbeddingModelId,
  getEmbeddingClient,
} from "./embedding-client";

export { embeddingConfigured };

export interface GameEmbeddingSource {
  title: string;
  description: string;
  genre?: string | null;
  tags: string; // JSON 数组字符串
  mechanics: string; // JSON 数组字符串
  mood: string; // JSON 数组字符串
  difficulty: number;
  cognitiveLoad: number;
  sessionLengthMin: number | null;
  multiplayer: boolean;
  mobile: boolean;
  desktop: boolean;
}

const safeParse = (s: string): string[] => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
};

/**
 * 拼接游戏画像为 embedding 输入文本（与 PRD §28 一致）。
 * 每次生成需稳定可复现，生成后计算 content_hash 供增量判断。
 */
export function buildEmbeddingText(src: GameEmbeddingSource): string {
  const tags = safeParse(src.tags);
  const mechanics = safeParse(src.mechanics);
  const mood = safeParse(src.mood);

  const parts: string[] = [];
  parts.push(`游戏：${src.title}`);
  if (src.genre) parts.push(`类型：${src.genre}`);
  if (tags.length) parts.push(`标签：${tags.join("、")}`);
  if (mechanics.length) parts.push(`机制：${mechanics.join(", ")}`);
  if (mood.length) parts.push(`心情：${mood.join(", ")}`);
  parts.push(
    `体验：难度${src.difficulty}/5，认知负担${src.cognitiveLoad}/5，单局${src.sessionLengthMin ?? "?"}分钟`,
  );
  parts.push(`玩法：${src.multiplayer ? "多人" : "单人"}`); // inner marker for embedding
  parts.push(`设备：${src.mobile ? "手机 " : ""}${src.desktop ? "电脑" : ""}`);
  if (src.description) parts.push(`简介：${src.description}`);

  return parts.filter(Boolean).join("\n");
}

/** 计算 embedding 输入文本的稳定 hash（用于判断画像是否变化，需重算向量） */
export function contentHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return `${(hash >>> 0).toString(16)}_${text.length}`;
}

export interface EmbeddingResult {
  text: string;
  hash: string;
  /** 1536 维向量（dimensions 由模型决定） */
  vector: number[];
}

const VECTOR_DIM = 1536;

/** 校验向量维度与存储 schema（vector(1536)）一致；不一致说明 embedding 模型未按 1536 输出 */
export function isValidVectorDim(vector: { length: number }): boolean {
  return vector.length === VECTOR_DIM;
}

/**
 * 生成文本向量。失败时抛错，由调用方决定降级策略。
 */
export async function generateEmbedding(
  src: GameEmbeddingSource,
): Promise<EmbeddingResult> {
  const client = getEmbeddingClient();
  const text = buildEmbeddingText(src);

  const model = getEmbeddingModelId();
  const resp = await client.embeddings.create({
    model,
    input: text,
    dimensions: VECTOR_DIM,
  });

  const vector = resp.data[0]?.embedding;
  if (!vector) {
    throw new Error("Empty embedding response");
  }

  return { text, hash: contentHash(text), vector };
}

/** 生成多条文本的批量向量（返回与输入顺序对应） */
export async function generateEmbeddings(
  items: { text: string }[],
): Promise<number[][]> {
  if (items.length === 0) return [];
  const client = getEmbeddingClient();
  const resp = await client.embeddings.create({
    model: getEmbeddingModelId(),
    input: items.map((i) => i.text),
    dimensions: VECTOR_DIM,
  });
  // 按顺序补全（模型可能乱序返回，按 index 排序）
  const byIndex = new Map(
    resp.data.map((d) => [d.index ?? 0, d.embedding]),
  );
  return items.map((_, i) => byIndex.get(i) ?? []);
}
