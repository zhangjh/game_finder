import { Router } from "express";

export const healthRouter = Router();

/**
 * GET /healthz — 健康检查。
 * 供 Docker healthcheck / 负载均衡检测服务存活。
 */
healthRouter.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});
