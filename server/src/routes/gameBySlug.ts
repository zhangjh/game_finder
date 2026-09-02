import { Router } from "express";

import { getGameBySlug } from "@/lib/games/queries";

export const gameBySlugRouter = Router();

/** GET /api/games/:slug — 游戏详情 */
gameBySlugRouter.get("/:slug", async (req, res) => {
  const { slug } = req.params;

  try {
    const game = await getGameBySlug(slug);
    if (!game) {
      res.status(404).json({ error: "game_not_found" });
      return;
    }
    res.json(game);
  } catch (err) {
    console.error("[api/games/:slug] detail failed:", err);
    res.status(500).json({ error: "failed_to_get_game" });
  }
});
