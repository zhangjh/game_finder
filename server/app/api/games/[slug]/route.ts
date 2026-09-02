import { NextResponse } from "next/server";

import { getGameBySlug } from "@/lib/games/queries";

/** GET /api/games/[slug] — 游戏详情 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  try {
    const game = await getGameBySlug(slug);
    if (!game) {
      return NextResponse.json({ error: "game_not_found" }, { status: 404 });
    }
    return NextResponse.json(game);
  } catch (err) {
    console.error("[api/games/:slug] detail failed:", err);
    return NextResponse.json(
      { error: "failed_to_get_game" },
      { status: 500 },
    );
  }
}
