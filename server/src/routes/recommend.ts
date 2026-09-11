/**
 * POST /api/recommend — AI Game Finder 推荐 API（T5.5，PRD §20/§43）。
 *
 * 输入：{ input: "自然语言" } 或 { quick: "5min" | "relax" | ... }。
 * 输出：3~5 款游戏卡片 + 每款可解释理由（PRD §23/§44）。
 *
 * 降级策略（PRD：绝不空转）：
 * - intent 解析失败 → parsedOk=false + 热门兜底结果，前端引导快捷条件
 * - LLM 额度受限 → 503 quota_limited，前端提示稍后再试
 */
import { randomUUID } from "node:crypto";
import { Router } from "express";

import { isQuotaError } from "@/lib/ai/analyze-game";
import { runRecommendation } from "@/lib/recommendation/pipeline";

export const recommendRouter = Router();

recommendRouter.post("/", async (req, res) => {
  const startedAt = Date.now();
  const traceId = randomUUID();
  const body = req.body as { input?: unknown; quick?: unknown; lang?: unknown };
  const input = typeof body.input === "string" ? body.input : undefined;
  const quick = typeof body.quick === "string" ? body.quick : undefined;
  const lang = body.lang === "zh" || body.lang === "en" ? body.lang : undefined;
  const mode = quick?.trim() ? "quick" : "natural_language";

  console.info(
    `[api/recommend] ${JSON.stringify({ traceId, event: "started", mode, lang: lang ?? "zh", inputLength: input?.trim().length ?? 0 })}`,
  );

  if (!input?.trim() && !quick?.trim()) {
    console.warn(
      `[api/recommend] ${JSON.stringify({ traceId, event: "rejected", reason: "missing_input", durationMs: Date.now() - startedAt })}`,
    );
    res.status(400).json({ error: "bad_request", message: "input 或 quick 必填其一" });
    return;
  }

  try {
    const result = await runRecommendation({ input, quick, lang }, traceId);
    console.info(
      `[api/recommend] ${JSON.stringify({ traceId, event: "completed", status: 200, parsedOk: result.parsedOk, resultCount: result.items.length, requestId: result.requestId, durationMs: Date.now() - startedAt })}`,
    );
    res.json(result);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    if (isQuotaError(err)) {
      console.warn(
        `[api/recommend] ${JSON.stringify({ traceId, event: "failed", status: 503, reason: "quota_limited", error, durationMs: Date.now() - startedAt })}`,
      );
      res.status(503).json({
        error: "quota_limited",
        message: "AI 服务暂时不可用，请稍后再试",
      });
      return;
    }
    console.error(
      `[api/recommend] ${JSON.stringify({ traceId, event: "failed", status: 500, error, durationMs: Date.now() - startedAt })}`,
    );
    res.status(500).json({ error: "failed_to_recommend" });
  }
});
