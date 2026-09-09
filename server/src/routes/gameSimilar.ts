import { Router } from "express";

import { getGameBySlug, getSimilarGames } from "@/lib/games/queries";

export const gameSimilarRouter = Router();

/** GET /api/games/:slug/similar — 相似游戏（PRD §27；M4 换 game_relations） */
gameSimilarRouter.get("/:slug/similar", async (req, res) => {
  const { slug } = req.params;
  const { lang } = req.query;

  try {
    const game = await getGameBySlug(slug);
    if (!game) {
      res.status(404).json({ error: "game_not_found" });
      return;
    }
    // 界面语种（T1.7）：zh/缺省=只推中文元数据游戏，en=不过滤
    const uiLang = lang === "en" ? "en" : "zh";
    const items = await getSimilarGames(game.id, 4, uiLang);
    res.json({ items });
  } catch (err) {
    console.error("[api/games/:slug/similar] failed:", err);
    res.status(500).json({ error: "failed_to_get_similar_games" });
  }
});
