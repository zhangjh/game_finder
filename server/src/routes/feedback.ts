/**
 * POST /api/games/:slug/feedback — 游戏质量反馈（不可玩 / 语言错误）。
 *
 * 无鉴权（匿名 `_gf_uid` Cookie UUID 即身份），同用户对同游戏仅保留一条
 * pending 反馈（幂等去重）。后台反馈专区可复核并直接下架确有问题的游戏。
 */
import { eq } from "drizzle-orm";
import { Router } from "express";

import { db } from "@/lib/db";
import { submitGameFeedback } from "@/lib/games/feedback-queries";
import { games } from "@/lib/db/schema";

import { resolveUserId } from "../middleware/uid";

export const feedbackRouter = Router();

const FEEDBACK_TYPES = ["not_playable", "wrong_language"] as const;

feedbackRouter.post("/:slug/feedback", async (req, res) => {
  const { slug } = req.params;
  const body = (req.body ?? {}) as { type?: unknown; note?: unknown };

  const type =
    typeof body.type === "string" &&
    (FEEDBACK_TYPES as readonly string[]).includes(body.type)
      ? (body.type as (typeof FEEDBACK_TYPES)[number])
      : undefined;
  if (!type) {
    res.status(400).json({ error: "invalid_feedback_type" });
    return;
  }
  const note =
    typeof body.note === "string" ? body.note.slice(0, 500) : undefined;

  const userId = resolveUserId(req, res);
  if (!userId) {
    // 与续玩存档约定一致：无法识别身份时不落库，静默成功
    res.json({ ok: true, alreadyReported: false });
    return;
  }

  try {
    const game = await db
      .select({ id: games.id })
      .from(games)
      .where(eq(games.slug, slug))
      .limit(1);
    if (game.length === 0) {
      // 游戏不存在/已下架：静默成功，不破坏用户体验
      res.json({ ok: true, alreadyReported: false });
      return;
    }
    const result = await submitGameFeedback({
      userId,
      gameId: game[0].id,
      type,
      note,
    });
    res.json(result);
  } catch (err) {
    console.error("[api/games/:slug/feedback] failed:", err);
    res.status(500).json({ error: "failed_to_submit_feedback" });
  }
});