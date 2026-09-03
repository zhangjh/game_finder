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
import {
  adminCreateCronJob,
  adminDeleteCronJob,
  adminListCronJobRuns,
  adminListCronJobs,
  adminSetCronJobStatus,
  adminTriggerCronJob,
  adminUpdateCronJob,
  type CronJobType,
  type CronJobUpdate,
} from "@/lib/games/cron-admin-queries";

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

// ===== 定时任务管理（T3.6 应用内调度） =====

const CRON_JOB_TYPES: CronJobType[] = [
  "sync_games",
  "health_check",
  "detect_duplicates",
];
const CRON_JOB_STATUSES = ["enabled", "disabled"] as const;

/** GET /api/admin/cron-jobs — 任务列表 */
adminRouter.get("/cron-jobs", async (_req, res) => {
  const jobs = await adminListCronJobs();
  res.json({
    items: jobs.map((j) => ({
      ...j,
      params: j.params as Record<string, unknown> | null,
    })),
  });
});

/** GET /api/admin/cron-jobs/:id — 单个任务 */
adminRouter.get("/cron-jobs/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const job = await adminListCronJobs().then((jobs) =>
    jobs.find((j) => j.id === id),
  );
  if (!job) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ ...job, params: job.params as Record<string, unknown> | null });
});

/** POST /api/admin/cron-jobs — 新建任务 */
adminRouter.post("/cron-jobs", async (req, res) => {
  const body = (req.body ?? {}) as {
    type?: string;
    name?: string;
    description?: string;
    schedule?: string;
    status?: string;
    params?: Record<string, unknown>;
  };
  if (
    !body.type ||
    !CRON_JOB_TYPES.includes(body.type as CronJobType) ||
    typeof body.name !== "string" ||
    typeof body.schedule !== "string"
  ) {
    res.status(400).json({ error: "invalid_params" });
    return;
  }
  try {
    const job = await adminCreateCronJob({
      type: body.type as CronJobType,
      name: body.name,
      description: body.description,
      schedule: body.schedule,
      status:
        body.status === "disabled"
          ? "disabled"
          : "enabled",
      params: body.params,
    });
    res.status(201).json(job);
  } catch (err) {
    if (err instanceof Error && err.message === "invalid_cron") {
      res.status(400).json({ error: "invalid_cron" });
      return;
    }
    throw err;
  }
});

/** PUT /api/admin/cron-jobs/:id — 更新任务 */
adminRouter.put("/cron-jobs/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const body = (req.body ?? {}) as CronJobUpdate;
  try {
    const job = await adminUpdateCronJob(id, body);
    if (!job) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(job);
  } catch (err) {
    if (err instanceof Error && err.message === "invalid_cron") {
      res.status(400).json({ error: "invalid_cron" });
      return;
    }
    throw err;
  }
});

/** POST /api/admin/cron-jobs/:id/status — 启停 */
adminRouter.post("/cron-jobs/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const { status } = (req.body ?? {}) as { status?: string };
  if (
    !Number.isInteger(id) ||
    !CRON_JOB_STATUSES.includes(status as (typeof CRON_JOB_STATUSES)[number])
  ) {
    res.status(400).json({ error: "invalid_params" });
    return;
  }
  const job = await adminSetCronJobStatus(
    id,
    status as "enabled" | "disabled",
  );
  if (!job) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(job);
});

/** POST /api/admin/cron-jobs/:id/trigger — 手动立即执行 */
adminRouter.post("/cron-jobs/:id/trigger", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const result = await adminTriggerCronJob(id);
    if (!result) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(result);
  } catch (err) {
    // 已在运行时提前返回 409，前端据此禁用/提示，避免重复点击叠加
    const code =
      err instanceof Error ? (err as Error & { code?: string }).code : undefined;
    if (code === "job_already_running") {
      res.status(409).json({ error: "job_already_running" });
      return;
    }
    throw err;
  }
});

/** GET /api/admin/cron-jobs/:id/runs — 最近运行记录 */
adminRouter.get("/cron-jobs/:id/runs", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const limit =
    typeof req.query.limit === "string" && /^\d+$/.test(req.query.limit)
      ? Number(req.query.limit)
      : 20;
  res.json({ items: await adminListCronJobRuns(id, limit) });
});

/** DELETE /api/admin/cron-jobs/:id — 删除任务 */
adminRouter.delete("/cron-jobs/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const result = await adminDeleteCronJob(id);
  if (!result) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ ok: true });
});
