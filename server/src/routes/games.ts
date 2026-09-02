import { Router } from "express";

import { listGames, type GameListFilters } from "@/lib/games/queries";

export const gamesRouter = Router();

const num = (v: string | undefined) =>
  v && /^\d+$/.test(v) ? Number(v) : undefined;

/**
 * GET /api/games — 游戏列表（筛选/排序/分页）。
 * 参数与 @game-finder/shared GameListQuery 对齐。
 */
gamesRouter.get("/", async (req, res) => {
  const { genre, duration, players, platform, q, sort, page, pageSize } =
    req.query;

  const filters: GameListFilters = {
    genre: typeof genre === "string" ? genre : undefined,
    durationMax: num(typeof duration === "string" ? duration : undefined),
    players:
      players === "multi" ? "multi" : num(typeof players === "string" ? players : undefined),
    platform:
      platform === "mobile" || platform === "desktop" ? platform : undefined,
    q: typeof q === "string" ? q : undefined,
    sort:
      sort === "newest" || sort === "score" || sort === "random"
        ? sort
        : "popular",
    page: num(typeof page === "string" ? page : undefined) ?? 1,
    pageSize: num(typeof pageSize === "string" ? pageSize : undefined) ?? 24,
  };

  try {
    const { items, total } = await listGames(filters);
    res.json({
      items,
      total,
      page: filters.page,
      pageSize: filters.pageSize,
    });
  } catch (err) {
    console.error("[api/games] list failed:", err);
    res.status(500).json({ error: "failed_to_list_games" });
  }
});
