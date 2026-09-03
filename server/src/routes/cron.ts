import { Router } from "express";

import { requireCronSecret } from "@/lib/cron-auth";
import { allAdapters, getAdapter, syncSource } from "@/lib/games/collectors";
import { detectDuplicates } from "@/lib/games/duplicates";
import { runHealthCheck } from "@/lib/games/health-check";

/**
 * /api/cron/* — 定时任务入口（T3.6，CRON_SECRET 鉴权）。
 *
 * POST|GET /api/cron/sync-games?source=&maxPages=   游戏同步
 * POST|GET /api/cron/health-check?limit=&threshold= 健康巡检
 * POST|GET /api/cron/detect-duplicates?threshold=   重复检测
 */
export const cronRouter = Router();

cronRouter.use(requireCronSecret);

const intParam = (v: unknown): number | undefined =>
  typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined;

cronRouter.all("/sync-games", async (req, res) => {
  const sourceParam =
    typeof req.query.source === "string" ? req.query.source : undefined;
  const maxPages = intParam(req.query.maxPages) ?? null;

  const adapters = sourceParam
    ? [getAdapter(sourceParam)].filter((a) => a !== null)
    : allAdapters();
  if (adapters.length === 0) {
    res.status(404).json({ error: "unknown_source", source: sourceParam });
    return;
  }

  const results = [];
  for (const adapter of adapters) {
    console.log(`[sync-games] start: ${adapter.code}`);
    const stats = await syncSource(adapter, { maxPages, pageDelayMs: 150 });
    console.log(`[sync-games] done: ${adapter.code}`, stats);
    results.push(stats);
  }

  res.status(results.some((r) => r.error) ? 500 : 200).json({ results });
});

cronRouter.all("/health-check", async (req, res) => {
  const stats = await runHealthCheck({
    limit: intParam(req.query.limit),
    offlineThreshold: intParam(req.query.threshold),
  });
  console.log("[health-check]", stats);
  res.status(stats.error ? 500 : 200).json(stats);
});

cronRouter.all("/detect-duplicates", async (req, res) => {
  const t =
    typeof req.query.threshold === "string" &&
    /^\d+(\.\d+)?$/.test(req.query.threshold)
      ? Number(req.query.threshold)
      : undefined;
  const stats = await detectDuplicates({ titleThreshold: t });
  console.log("[detect-duplicates]", stats);
  res.status(stats.error ? 500 : 200).json(stats);
});
