import OpenAI from "openai";

let client: OpenAI | null = null;

/**
 * 获取 OpenAI 兼容客户端（单例）。
 * 支持任意兼容网关（DeepSeek / 通义千问 / OpenAI 等），
 * 通过环境变量 AI_BASE_URL / AI_KEY / MODEL_ID 配置。
 */
export function getAIClient(): OpenAI {
  if (client) return client;

  const baseURL = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_KEY;

  if (!baseURL || !apiKey) {
    throw new Error(
      "Missing AI_BASE_URL or AI_KEY in environment variables",
    );
  }

  client = new OpenAI({ baseURL, apiKey });
  return client;
}

/** 当前配置的模型 ID */
export function getModelId(): string {
  const model = process.env.MODEL_ID;
  if (!model) throw new Error("Missing MODEL_ID in environment variables");
  return model;
}
