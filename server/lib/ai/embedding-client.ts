/**
 * Embedding 专用 OpenAI 兼容客户端（T4.2）。
 *
 * 与 Chat（画像分析）分离：Chat 走 AI_BASE_URL（如 DeepSeek，无 embeddings 端点），
 * Embedding 走独立的 EMBEDDING_BASE_URL（如阿里云百炼 DashScope，提供 text-embedding-v4 等）。
 * 通过环境变量 EMBEDDING_BASE_URL / EMBEDDING_API_KEY / EMBEDDING_MODEL 配置。
 */
import OpenAI from "openai";

let embeddingClient: OpenAI | null = null;

/** 是否已配置 embedding（三要素齐备才启用，否则 embedding job 优雅跳过） */
export function embeddingConfigured(): boolean {
  return Boolean(
    process.env.EMBEDDING_BASE_URL &&
      process.env.EMBEDDING_API_KEY &&
      process.env.EMBEDDING_MODEL,
  );
}

/**
 * 获取 embedding 客户端（单例）。
 * 未配置时抛错，由调用方（job）捕获并按未启用处理，不影响主体流程。
 */
export function getEmbeddingClient(): OpenAI {
  if (embeddingClient) return embeddingClient;

  const rawBaseURL = process.env.EMBEDDING_BASE_URL?.trim();
  const apiKey = process.env.EMBEDDING_API_KEY;

  if (!rawBaseURL || !apiKey) {
    throw new Error(
      "Missing EMBEDDING_BASE_URL or EMBEDDING_API_KEY (embedding not configured)",
    );
  }

  // 容错：允许无协议前缀的 base url（如 llm-xxx.maas.aliyuncs.com）
  const baseURL = /^https?:\/\//i.test(rawBaseURL)
    ? rawBaseURL
    : `https://${rawBaseURL}`;

  embeddingClient = new OpenAI({ baseURL, apiKey });
  return embeddingClient;
}

/** 当前配置的 embedding 模型 ID */
export function getEmbeddingModelId(): string {
  return process.env.EMBEDDING_MODEL ?? "";
}
