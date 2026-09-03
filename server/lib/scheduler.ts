/**
 * 应用内定时调度器（替换 VPS OS crontab）。
 *
 * - 任务配置保存在 cron_jobs 表，管理后台可读启停/编辑/手动触发
 * - 用 node-cron 在进程内维护 ScheduledTask，时钟触发后直接执行任务函数
 *   （不经过 /api/cron HTTP 端点，避免依赖回环 + 减少一层鉴权）
 * - 每次执行把结果写入 cron_job_runs，供管理后台查看运行历史
 * - 服务器启动时 initScheduler() 装载；Admin 改配置后 reloadCronJob() 增量应用
 */
import cron, { type ScheduledTask } from "node-cron";

import { db } from "@/lib/db";
import { cronJobRuns, cronJobs } from "@/lib/db/schema";
import { allAdapters, getAdapter, syncSource } from "@/lib/games/collectors";
import { detectDuplicates } from "@/lib/games/duplicates";
import { runHealthCheck } from "@/lib/games/health-check";
import { eq, sql } from "drizzle-orm";

/** 已注册的 node-cron 任务：cronJobs.id → ScheduledTask */
const tasks = new Map<number, ScheduledTask>();

/** 任务类型 → 执行函数。返回一个统计/结果对象，用于记录。 */
type JobRunner = (params: Record<string, unknown>) => Promise<Record<string, unknown>>;

const RUNNERS: Record<string, JobRunner> = {
  sync_games: async (params) => {
    const sourceParam = typeof params.source === "string" ? params.source : undefined;
    const maxPages =
      typeof params.maxPages === "number"
        ? params.maxPages
        : typeof params.maxPages === "string" && /^\d+$/.test(params.maxPages)
          ? Number(params.maxPages)
          : null;

    const adapters = sourceParam
      ? [getAdapter(sourceParam)].filter((a) => a !== null)
      : allAdapters();
    if (adapters.length === 0) {
      // 把"配置缺失"的真实原因暴露出来，避免误导性的 unknown_source。
      // 未指定 source 时默认按 gamepix 提示，便于运营定位（如 GAMEPIX_SID 未设置）。
      const hint = sourceParam
        ? `未知数据源: ${sourceParam}`
        : `没有可用的数据源 adapter（可能是 GAMEPIX_SID 等环境变量未配置，或全部 adapter 创建失败）`;
      throw new Error(`unknown_source — ${hint}`);
    }

    const results: Record<string, unknown>[] = [];
    for (const adapter of adapters) {
      const stats = await syncSource(adapter, { maxPages, pageDelayMs: 150 });
      results.push(stats as unknown as Record<string, unknown>);
    }
    return { results };
  },
  health_check: async (params) => {
    const limit =
      typeof params.limit === "number"
        ? params.limit
        : typeof params.limit === "string" && /^\d+$/.test(params.limit)
          ? Number(params.limit)
          : undefined;
    const threshold =
      typeof params.threshold === "number"
        ? params.threshold
        : typeof params.threshold === "string" && /^\d+$/.test(params.threshold)
          ? Number(params.threshold)
          : undefined;
    const stats = await runHealthCheck({ limit, offlineThreshold: threshold });
    if (stats.error) throw new Error(stats.error);
    return stats as unknown as Record<string, unknown>;
  },
  detect_duplicates: async (params) => {
    const t =
      typeof params.threshold === "number"
        ? params.threshold
        : typeof params.threshold === "string" &&
            /^\d+(\.\d+)?$/.test(params.threshold)
          ? Number(params.threshold)
          : undefined;
    const stats = await detectDuplicates({ titleThreshold: t });
    if (stats.error) throw new Error(stats.error);
    return stats as unknown as Record<string, unknown>;
  },
};

const DEFAULT_PARAMS: Record<string, Record<string, unknown>> = {
  sync_games: {},
  health_check: { limit: 500 },
  detect_duplicates: {},
};

export const DEFAULT_JOBS: {
  type: "sync_games" | "health_check" | "detect_duplicates";
  name: string;
  description: string;
  schedule: string;
  params: Record<string, unknown>;
}[] = [
  {
    type: "sync_games",
    name: "游戏源同步",
    description: "从各数据源（如 GamePix）全量拉取游戏并入库/下架（每 6 小时）",
    schedule: "0 */6 * * *",
    params: {},
  },
  {
    type: "health_check",
    name: "健康巡检",
    description: "校验游戏 URL 可达性，连续失败自动下线（每日 04:00）",
    schedule: "0 4 * * *",
    params: { limit: 500 },
  },
  {
    type: "detect_duplicates",
    name: "重复检测",
    description: "检测跨源疑似重复游戏，写入人工处理队列（每日 05:00）",
    schedule: "0 5 * * *",
    params: {},
  },
];

/** 幂等写入默认任务（仅在首次启动且表空时 seed） */
export async function seedCronJobsIfEmpty(): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cronJobs);
  if ((count ?? 0) > 0) return;

  await db.insert(cronJobs).values(
    DEFAULT_JOBS.map((j) => ({
      type: j.type,
      name: j.name,
      description: j.description,
      schedule: j.schedule,
      params: j.params as never,
    })),
  );
}

/** 执行一次任务（触发来源 trigger: "schedule" | "manual"） */
export async function runCronJob(
  jobId: number,
  trigger: "schedule" | "manual" = "schedule",
): Promise<Record<string, unknown>> {
  const rows = await db
    .select()
    .from(cronJobs)
    .where(eq(cronJobs.id, jobId))
    .limit(1);
  const job = rows[0];
  if (!job) throw new Error("job_not_found");

  const params = (job.params ?? DEFAULT_PARAMS[job.type] ?? {}) as Record<
    string,
    unknown
  >;
  const runner = RUNNERS[job.type];
  if (!runner) throw new Error(`no_runner:${job.type}`);
  if (job.status !== "enabled" && trigger !== "manual") {
    throw new Error("job_disabled");
  }

  const startedAt = new Date();
  const runRow = await db
    .insert(cronJobRuns)
    .values({
      jobId,
      trigger,
      status: "running",
      startedAt,
    })
    .returning({ id: cronJobRuns.id });
  const runId = runRow[0].id;

  let result: Record<string, unknown> = {};
  let status = "ok";
  let errorMsg: string | null = null;
  const started = Date.now();
  try {
    result = await runner(params);
    // 检查 runner 结果中是否内嵌 error（如 pipeline "error" 字段）
    const nestedError = String(result.error ?? "") || null;
    if (nestedError) {
      status = "error";
      errorMsg = nestedError;
    }
  } catch (err) {
    status = "error";
    errorMsg = err instanceof Error ? err.message : String(err);
  }
  const durationMs = Date.now() - started;

  await db
    .update(cronJobRuns)
    .set({
      status,
      result: status === "ok" ? (result as never) : null,
      error: errorMsg,
      durationMs: Math.round(durationMs),
      finishedAt: new Date(),
    })
    .where(eq(cronJobRuns.id, runId));

  await db
    .update(cronJobs)
    .set({
      lastRunAt: new Date(),
      lastRunStatus: status,
      lastRunDurationMs: Math.round(durationMs),
      updatedAt: new Date(),
    })
    .where(eq(cronJobs.id, jobId));

  return { runId, jobId, status, durationMs };
}

/** 注册/更新单个任务的调度（新增或 schedule/status 变化时调用） */
export async function reloadCronJob(jobId: number): Promise<void> {
  const existing = tasks.get(jobId);
  if (existing) {
    existing.destroy();
    tasks.delete(jobId);
  }

  const rows = await db
    .select()
    .from(cronJobs)
    .where(eq(cronJobs.id, jobId))
    .limit(1);
  const job = rows[0];
  if (!job || job.status !== "enabled") return;

  if (!cron.validate(job.schedule)) {
    console.error(`[scheduler] invalid cron "${job.schedule}" for job ${jobId}`);
    return;
  }

  const task = cron.schedule(
    job.schedule,
    () => {
      runCronJob(jobId, "schedule")
        .then((r) => console.log(`[scheduler] job ${job.type} -> ${r.status}`))
        .catch((err) =>
          console.error(`[scheduler] job ${job.type} failed:`, err),
        );
    },
    { noOverlap: true, name: `cron-job-${jobId}` },
  );
  task.start();
  tasks.set(jobId, task);
}

/** 启动：seed 默认任务 → 注册所有 enabled 任务 */
export async function initScheduler(): Promise<void> {
  try {
    await seedCronJobsIfEmpty();
    const rows = await db
      .select()
      .from(cronJobs)
      .where(eq(cronJobs.status, "enabled"));
    for (const job of rows) await reloadCronJob(job.id);
    console.log(`[scheduler] initialized ${rows.length} job(s)`);
  } catch (err) {
    console.error("[scheduler] init failed:", err);
  }
}

/** 停止所有调度（进程退出 / 测试） */
export async function stopScheduler(): Promise<void> {
  for (const [id, task] of tasks) {
    task.destroy();
    tasks.delete(id);
  }
  await cron.shutdown(2000).catch(() => {});
}
