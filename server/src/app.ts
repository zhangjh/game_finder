import express from "express";

import { corsApi } from "./middleware/cors";
import { adminRouter } from "./routes/admin";
import { gameBySlugRouter } from "./routes/gameBySlug";
import { gameSimilarRouter } from "./routes/gameSimilar";
import { gamesRouter } from "./routes/games";
import { healthRouter } from "./routes/health";
import { recommendRouter } from "./routes/recommend";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  // 健康检查（不鉴权、不走 CORS）
  app.use(healthRouter);

  // 业务 API（仅此段应用 CORS，与旧 proxy.ts matcher 一致）
  const api = express.Router();
  api.use(corsApi);
  api.use("/games", gamesRouter);
  api.use("/games", gameBySlugRouter);
  api.use("/games", gameSimilarRouter);
  api.use("/recommend", recommendRouter);
  // 管理后台 API（ADMIN_PASSWORD cookie 会话，见 routes/admin.ts）
  api.use("/admin", adminRouter);
  app.use("/api", api);

  // 未匹配 → 404
  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  return app;
}
