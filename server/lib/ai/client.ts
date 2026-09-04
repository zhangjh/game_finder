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

/**
 * 通义千问思考模型「关闭思考」参数（spread 进请求体）。
 * reasoning token 按输出计费（单价更高），元数据提取/意图解析类任务
 * 关闭思考可省约 40% 成本。仅通义（dashscope / 阿里云 MaaS）网关需要；
 * 其他 OpenAI 兼容网关可能拒绝未知参数，故按 base URL 判断是否附加。
 */
export function noThinkingParams(): Record<string, unknown> {
  const base = process.env.AI_BASE_URL ?? "";
  return base.includes("dashscope") || base.includes("maas.aliyuncs")
    ? { enable_thinking: false }
    : {};
}
