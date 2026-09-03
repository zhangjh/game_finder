/**
 * 应用内定时调度器（替换 VPS OS crontab）。
 *
 * - 任务配置保存在 cron_jobs 表，管理后台可读启停/编辑/手动触发
 * - 用 node-cron 在进程内维护 ScheduledTask，时钟触发后直接执行任务函数
 * - 每次执行把结果写入 cron_job_runs，供管理后台查看运行历史
 * - 进程内 runningJobs 跟踪正在运行的任务，防止手动/定时重复并发执行
 * - 服务器启动时 initScheduler() 装载；Admin 改配置后 reloadCronJob() 增量应用
 * - 运行进度直接 console 打到容器日志
 */
import cron, { type ScheduledTask } from "node-cron";

import { db } from "@/lib/db";
import { cronJobRuns, cronJobs } from "@/lib/db/schema";
import { runAnalyzeGames } from "@/lib/ai/job";
import { runRelationJob } from "@/lib/ai/relations-job";
import { allAdapters, getAdapter, syncSource } from "@/lib/games/collectors";
import { detectDuplicates } from "@/lib/games/duplicates";
import { runHealthCheck } from "@/lib/games/health-check";
import { eq, sql } from "drizzle-orm";

/** 已注册的 node-cron 任务：cronJobs.id → ScheduledTask */
const tasks = new Map<number, ScheduledTask>();

/** 正在运行的任务：cronJobs.id → 当前 runId（进程内防重复标记） */
const runningJobs = new Map<number, number>();

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
      console.log(`[scheduler] sync ${adapter.code}: start`);
      const started = Date.now();
      const stats = await syncSource(adapter, { maxPages, pageDelayMs: 150 });
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      const err = (stats as unknown as { error?: unknown }).error;
      if (err) {
        console.error(`[scheduler] sync ${adapter.code} failed:`, err);
      } else {
        console.log(
          `[scheduler] sync ${adapter.code} done (${elapsed}s): ` +
            `fetched=${stats.fetched} 新增=${stats.inserted} 更新=${stats.updated} ` +
            `不变=${stats.unchanged} 下线=${stats.offline}`,
        );
      }
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
    console.log(`[scheduler] health-check: start (limit=${limit ?? 200}, threshold=${threshold ?? 3})`);
    const stats = await runHealthCheck({ limit, offlineThreshold: threshold });
    if (stats.error) throw new Error(stats.error);
    console.log(
      `[scheduler] health-check done: 检查=${stats.checked} 正常=${stats.ok} ` +
        `游戏URL失败=${stats.gameUrlFail} 缩略图失败=${stats.thumbnailFail} ` +
        `跳过=${stats.skipped} 自动下线=${stats.offlined}`,
    );
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
    console.log(`[scheduler] detect-duplicates: start (threshold=${t ?? 0.85})`);
    const stats = await detectDuplicates({ titleThreshold: t });
    if (stats.error) throw new Error(stats.error);
    console.log(
      `[scheduler] detect-duplicates done: slug对=${stats.slugPairs} 标题对=${stats.titlePairs} ` +
        `新增疑似=${stats.inserted} 待处理总数=${stats.pendingTotal}`,
    );
    return stats as unknown as Record<string, unknown>;
  },
  analyze_games: async (params) => {
    const limit =
      typeof params.limit === "number"
        ? params.limit
        : typeof params.limit === "string" && /^\d+$/.test(params.limit)
          ? Number(params.limit)
          : undefined;
    console.log(`[scheduler] analyze-games: start (limit=${limit ?? 20})`);
    const stats = await runAnalyzeGames(limit);
    if (stats.error) throw new Error(stats.error);
    console.log(
      `[scheduler] analyze-games done: 扫描=${stats.scanned} 分析=${stats.analyzed} ` +
        `发布=${stats.published} 质检不过=${stats.pending} 失败=${stats.failed} ` +
        `(embedding 新增=${stats.embedded} 跳过=${stats.embedSkipped})`,
    );
    return stats as unknown as Record<string, unknown>;
  },
  relation_games: async () => {
    console.log(`[scheduler] relation-games: start`);
    const stats = await runRelationJob();
    if (stats.error) throw new Error(stats.error);
    console.log(
      `[scheduler] relation-games done: 游戏=${stats.games} 关系=${stats.relationsWritten}`,
    );
    return stats as unknown as Record<string, unknown>;
  },
};

const DEFAULT_PARAMS: Record<string, Record<string, unknown>> = {
  sync_games: {},
  health_check: { limit: 500 },
  detect_duplicates: {},
  analyze_games: { limit: 20 },
  relation_games: {},
};

export const DEFAULT_JOBS: {
  type:
    | "sync_games"
    | "health_check"
    | "detect_duplicates"
    | "analyze_games"
    | "relation_games";
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
  {
    type: "analyze_games",
    name: "AI 画像分析",
    description: "分析 draft 游戏生成中文画像并发布（附 embedding），发布后即时生成向量；重分析 published+needsReanalysis（每 30 分钟）",
    schedule: "*/30 * * * *",
    params: { limit: 20 },
  },
  {
    type: "relation_games",
    name: "相似游戏预计算",
    description: "重建已发布游戏 Top-K 相似关系 game_relations（每日 06:00）",
    schedule: "0 6 * * *",
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

/** 该 job 是否正在运行（进程内 Map + DB running 记录双判断，防进程重启丢状态） */
export async function isJobRunning(jobId: number): Promise<boolean> {
  if (runningJobs.has(jobId)) return true;
  const rows = await db
    .select({ id: cronJobRuns.id })
    .from(cronJobRuns)
    .where(
      sql`${cronJobRuns.jobId} = ${jobId} and ${cronJobRuns.status} = 'running' and ${cronJobRuns.finishedAt} is null`,
    )
    .limit(1);
  return rows.length > 0;
}

/** 执行一次任务（触发来源 trigger: "schedule" | "manual"） */
export async function runCronJob(
  jobId: number,
  trigger: "schedule" | "manual" = "schedule",
): Promise<Record<string, unknown>> {
  // 防重复：同一任务已在运行（无论定时还是手动触发）时拒绝并发，
  // 避免 sync 这类耗时长任务被反复点"立即执行"而并发叠加。
  if (await isJobRunning(jobId)) {
    const err = new Error("job_already_running") as Error & { code: string };
    err.code = "job_already_running";
    throw err;
  }

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
  runningJobs.set(jobId, runId);

  let result: Record<string, unknown> = {};
  let status = "ok";
  let errorMsg: string | null = null;
  const started = Date.now();
  try {
    console.log(`[scheduler] run ${runId} job ${job.name} (${trigger}) start`);
    result = await runner(params);
    // 检查 runner 结果中是否内嵌 error（如 pipeline "error" 字段）
    const nestedError = String(result.error ?? "") || null;
    if (nestedError) {
      status = "error";
      errorMsg = nestedError;
      console.error(`[scheduler] run ${runId} job ${job.name} error:`, nestedError);
    } else {
      console.log(`[scheduler] run ${runId} job ${job.name} ok`);
    }
  } catch (err) {
    status = "error";
    errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[scheduler] run ${runId} job ${job.name} failed:`, err);
  } finally {
    runningJobs.delete(jobId);
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

/** 当前正在运行的任务 id → runId（供管理后台展示"执行中"状态） */
export function getRunningJobs(): ReadonlyMap<number, number> {
  return runningJobs;
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
