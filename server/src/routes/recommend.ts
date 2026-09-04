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
import { Router } from "express";

import { isQuotaError } from "@/lib/ai/analyze-game";
import { runRecommendation } from "@/lib/recommendation/pipeline";

export const recommendRouter = Router();

recommendRouter.post("/", async (req, res) => {
  const body = req.body as { input?: unknown; quick?: unknown };
  const input = typeof body.input === "string" ? body.input : undefined;
  const quick = typeof body.quick === "string" ? body.quick : undefined;

  if (!input?.trim() && !quick?.trim()) {
    res.status(400).json({ error: "bad_request", message: "input 或 quick 必填其一" });
    return;
  }

  try {
    const result = await runRecommendation({ input, quick });
    res.json(result);
  } catch (err) {
    if (isQuotaError(err)) {
      res.status(503).json({
        error: "quota_limited",
        message: "AI 服务暂时不可用，请稍后再试",
      });
      return;
    }
    console.error("[api/recommend] failed:", err);
    res.status(500).json({ error: "failed_to_recommend" });
  }
});
