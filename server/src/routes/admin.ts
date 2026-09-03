import { Router } from "express";

import {
  clearSessionCookie,
  isAdminAuthed,
  issueSessionCookie,
  requireAdmin,
  verifyPassword,
} from "@/lib/admin-auth";
import {
  adminDismissDuplicate,
  adminGetGame,
  adminListDuplicates,
  adminListGames,
  adminListSources,
  adminMergeDuplicate,
  adminOverview,
  adminSetGameStatus,
  type AdminGameStatus,
} from "@/lib/games/admin-queries";

/**
 * /api/admin/* — 管理后台 API（T2.3，PRD §36）。
 * Cookie 会话（ADMIN_PASSWORD 登录），供主域 SPA 的隐藏 /admin 路由调用。
 */
export const adminRouter = Router();

const isDev = process.env.NODE_ENV !== "production";

/** POST /api/admin/login {password} → 会话 cookie */
adminRouter.post("/login", (req, res) => {
  const { password } = (req.body ?? {}) as { password?: string };
  if (typeof password !== "string" || !verifyPassword(password)) {
    // 统一错误信息，不泄露"未配置密码"等内部状态
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }
  issueSessionCookie(res, isDev);
  res.json({ ok: true });
});

adminRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

/** GET /api/admin/session — 前端探测登录态（不 401，返回布尔） */
adminRouter.get("/session", (req, res) => {
  res.json({ authed: isAdminAuthed(req) });
});

// ===== 以下全部需要登录 =====
adminRouter.use(requireAdmin);

adminRouter.get("/overview", async (_req, res) => {
  res.json(await adminOverview());
});

const STATUSES: AdminGameStatus[] = ["draft", "pending", "published", "offline"];

adminRouter.get("/games", async (req, res) => {
  const sp = req.query;
  const status =
    typeof sp.status === "string" && STATUSES.includes(sp.status as AdminGameStatus)
      ? (sp.status as AdminGameStatus)
      : undefined;
  res.json(
    await adminListGames({
      status,
      sourceCode: typeof sp.source === "string" ? sp.source : undefined,
      q: typeof sp.q === "string" ? sp.q : undefined,
      sort:
        sp.sort === "oldest" || sp.sort === "play_count" || sp.sort === "title"
          ? sp.sort
          : "newest",
      page: typeof sp.page === "string" && /^\d+$/.test(sp.page) ? Number(sp.page) : 1,
      pageSize:
        typeof sp.pageSize === "string" && /^\d+$/.test(sp.pageSize)
          ? Number(sp.pageSize)
          : 30,
    }),
  );
});

adminRouter.get("/games/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const game = await adminGetGame(id);
  if (!game) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(game);
});

/** POST /api/admin/games/:id/status {status} — 上下架 */
adminRouter.post("/games/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const { status } = (req.body ?? {}) as { status?: string };
  if (!Number.isInteger(id) || !STATUSES.includes(status as AdminGameStatus)) {
    res.status(400).json({ error: "invalid_params" });
    return;
  }
  const updated = await adminSetGameStatus(id, status as AdminGameStatus);
  if (!updated) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(updated);
});

adminRouter.get("/sources", async (_req, res) => {
  res.json(await adminListSources());
});

adminRouter.get("/duplicates", async (req, res) => {
  const status =
    typeof req.query.status === "string" ? req.query.status : "pending";
  const page =
    typeof req.query.page === "string" && /^\d+$/.test(req.query.page)
      ? Number(req.query.page)
      : 1;
  res.json(await adminListDuplicates(status, page));
});

/** POST /api/admin/duplicates/:id/merge {keep: "keep"|"dup"} */
adminRouter.post("/duplicates/:id/merge", async (req, res) => {
  const id = Number(req.params.id);
  const { keep } = (req.body ?? {}) as { keep?: string };
  if (!Number.isInteger(id) || (keep !== "keep" && keep !== "dup")) {
    res.status(400).json({ error: "invalid_params" });
    return;
  }
  const result = await adminMergeDuplicate(
    id,
    keep === "keep" ? "game_id" : "duplicate_of_game_id",
  );
  if (!result) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(result);
});

adminRouter.post("/duplicates/:id/dismiss", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const result = await adminDismissDuplicate(id);
  if (!result) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(result);
});
