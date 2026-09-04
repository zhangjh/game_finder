/**
 * POST /api/events — 行为事件批量上报（T6.2，PRD §25）。
 *
 * 前端 AnalyticsProvider 定期 / 页面离开时 flush 到此端点。
 * 无鉴权（匿名统计，Cookie UUID 即身份），限频由前端控制。
 */
import { Router } from "express";

import { ingestEvents, type RawEvent } from "@/lib/analytics/event-ingest";

export const eventsRouter = Router();

eventsRouter.post("/", async (req, res) => {
  const body = req.body as { events?: unknown };
  if (!Array.isArray(body.events)) {
    res.status(400).json({ error: "events_array_required" });
    return;
  }

  const result = await ingestEvents(body.events as RawEvent[]);
  res.json(result);
});
