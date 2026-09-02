import { NextResponse } from "next/server";

import { listGames, type GameListFilters } from "@/lib/games/queries";

/**
 * GET /api/games — 游戏列表（筛选/排序/分页）。
 * 参数与 @game-finder/shared GameListQuery 对齐。
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;

  const num = (key: string) => {
    const v = sp.get(key);
    return v && /^\d+$/.test(v) ? Number(v) : undefined;
  };

  const playersRaw = sp.get("players");
  const platformRaw = sp.get("platform");
  const sortRaw = sp.get("sort");

  const filters: GameListFilters = {
    genre: sp.get("genre") ?? undefined,
    durationMax: num("duration"),
    players:
      playersRaw === "multi" ? "multi" : num("players"),
    platform:
      platformRaw === "mobile" || platformRaw === "desktop"
        ? platformRaw
        : undefined,
    q: sp.get("q") ?? undefined,
    sort:
      sortRaw === "newest" || sortRaw === "score" || sortRaw === "random"
        ? sortRaw
        : "popular",
    page: num("page") ?? 1,
    pageSize: num("pageSize") ?? 24,
  };

  try {
    const { items, total } = await listGames(filters);
    return NextResponse.json({
      items,
      total,
      page: filters.page,
      pageSize: filters.pageSize,
    });
  } catch (err) {
    console.error("[api/games] list failed:", err);
    return NextResponse.json(
      { error: "failed_to_list_games" },
      { status: 500 },
    );
  }
}
