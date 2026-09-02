import { NextResponse } from "next/server";

import { getGameBySlug, getSimilarGames } from "@/lib/games/queries";

/** GET /api/games/[slug]/similar — 相似游戏（PRD §27；M4 换 game_relations） */
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
    const items = await getSimilarGames(game.id, 4);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[api/games/:slug/similar] failed:", err);
    return NextResponse.json(
      { error: "failed_to_get_similar_games" },
      { status: 500 },
    );
  }
}
