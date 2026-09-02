import { Router } from "express";

import { getGameBySlug, getSimilarGames } from "@/lib/games/queries";

export const gameSimilarRouter = Router();

/** GET /api/games/:slug/similar — 相似游戏（PRD §27；M4 换 game_relations） */
gameSimilarRouter.get("/:slug/similar", async (req, res) => {
  const { slug } = req.params;

  try {
    const game = await getGameBySlug(slug);
    if (!game) {
      res.status(404).json({ error: "game_not_found" });
      return;
    }
    const items = await getSimilarGames(game.id, 4);
    res.json({ items });
  } catch (err) {
    console.error("[api/games/:slug/similar] failed:", err);
    res.status(500).json({ error: "failed_to_get_similar_games" });
  }
});
