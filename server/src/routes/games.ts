import { timingSafeEqual } from "node:crypto";

import { Router, type Request } from "express";

import {
  exportSeoGames,
  listGames,
  type GameListFilters,
} from "@/lib/games/queries";

export const gamesRouter = Router();

const num = (v: string | undefined) =>
  v && /^\d+$/.test(v) ? Number(v) : undefined;

const decimal = (v: string | undefined) => {
  if (!v || !/^\d+(\.\d+)?$/.test(v)) return undefined;
  const n = Number(v);
  return n >= 0 && n <= 1 ? n : undefined;
};

function isSeoExportAuthorized(req: Request): boolean {
  const expected = process.env.SEO_EXPORT_TOKEN;
  const header = req.get("authorization");
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const actualBuffer = Buffer.from(header.slice(7));
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

gamesRouter.get("/seo/export", async (req, res) => {
  if (!isSeoExportAuthorized(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const cursor =
    num(typeof req.query.cursor === "string" ? req.query.cursor : undefined) ?? 0;
  const pageSize = num(
    typeof req.query.pageSize === "string" ? req.query.pageSize : undefined,
  ) ?? 1_000;

  try {
    res.json(await exportSeoGames(cursor, pageSize));
  } catch (err) {
    console.error("[api/games/seo/export] failed:", err);
    res.status(500).json({ error: "failed_to_export_seo_games" });
  }
});

/**
 * GET /api/games — 游戏列表（筛选/排序/分页）。
 * 参数与 @game-finder/shared GameListQuery 对齐。
 */
gamesRouter.get("/", async (req, res) => {
  const { genre, duration, players, platform, mood, q, sort, page, pageSize, minQualityScore, lang } =
    req.query;

  const filters: GameListFilters = {
    // 界面语种（T1.7）：zh=只看中文元数据游戏，en=全部（原始英文字段恒存在）
    lang: lang === "zh" || lang === "en" ? lang : undefined,
    genre: typeof genre === "string" ? genre : undefined,
    durationMax: num(typeof duration === "string" ? duration : undefined),
    players:
      players === "multi" ? "multi" : num(typeof players === "string" ? players : undefined),
    platform:
      platform === "mobile" || platform === "desktop" ? platform : undefined,
    mood: mood === "relaxing" ? mood : undefined,
    q: typeof q === "string" ? q : undefined,
    minQualityScore: decimal(
      typeof minQualityScore === "string" ? minQualityScore : undefined,
    ),
    sort:
      sort === "newest" || sort === "score" || sort === "random" || sort === "quality"
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
