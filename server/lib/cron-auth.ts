/**
 * Cron 鉴权（T3.6）：/api/cron/* 共用的 Express 中间件。
 *
 * 按优先级：x-cron-secret 头 / Authorization Bearer / ?secret= 参数。
 * 生产必须配置 CRON_SECRET；本地 dev 未配置时放行。
 */
import type { NextFunction, Request, Response } from "express";

export function requireCronSecret(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      next();
      return;
    }
    res.status(401).json({ error: "cron_disabled" });
    return;
  }
  const provided =
    (req.headers["x-cron-secret"] as string | undefined) ??
    req.headers.authorization?.replace(/^Bearer\s+/i, "") ??
    (typeof req.query.secret === "string" ? req.query.secret : undefined);
  if (provided !== secret) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}
