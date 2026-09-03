/**
 * 定时任务管理查询层（T3.6 应用内调度）。
 * 基于 cron_jobs / cron_job_runs 表，供管理后台 /api/admin/cron-jobs/* 使用。
 */
import { and, desc, eq } from "drizzle-orm";
import cron from "node-cron";
import type { SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { cronJobRuns, cronJobs } from "@/lib/db/schema";
import {
  getRunningJobs,
  isJobRunning,
  reloadCronJob,
  runCronJob,
  seedCronJobsIfEmpty,
} from "@/lib/scheduler";

export type CronJobType = "sync_games" | "health_check" | "detect_duplicates";

export interface CronJobUpdate {
  name?: string;
  description?: string | null;
  schedule?: string;
  status?: "enabled" | "disabled";
  params?: Record<string, unknown>;
}

export async function adminListCronJobs() {
  await seedCronJobsIfEmpty();
  const rows = await db.select().from(cronJobs).orderBy(desc(cronJobs.id));
  const running = getRunningJobs();
  return Promise.all(
    rows.map(async (j) => ({
      ...j,
      running: running.has(j.id) || (await isJobRunning(j.id)),
      runningRunId: running.get(j.id) ?? null,
    })),
  );
}

export async function adminGetCronJob(id: number) {
  const rows = await db
    .select()
    .from(cronJobs)
    .where(eq(cronJobs.id, id))
    .limit(1);
  return rows[0];
}

/** 新增任务（返回后自动注册调度） */
export async function adminCreateCronJob(input: {
  type: CronJobType;
  name: string;
  description?: string;
  schedule: string;
  status?: "enabled" | "disabled";
  params?: Record<string, unknown>;
}) {
  if (!cron.validate(input.schedule)) throw new Error("invalid_cron");
  const inserted = await db
    .insert(cronJobs)
    .values({
      type: input.type,
      name: input.name,
      description: input.description ?? null,
      schedule: input.schedule,
      status: input.status ?? "enabled",
      params: (input.params ?? null) as never,
    })
    .returning();
  await reloadCronJob(inserted[0].id);
  return inserted[0];
}

/** 更新任务（改动后重新注册调度） */
export async function adminUpdateCronJob(id: number, input: CronJobUpdate) {
  const current = await adminGetCronJob(id);
  if (!current) return undefined;

  const newSchedule = input.schedule ?? current.schedule;
  if (!cron.validate(newSchedule)) throw new Error("invalid_cron");

  const patch: Record<string, unknown> = {
    schedule: newSchedule,
    updatedAt: new Date(),
  };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.params !== undefined) patch.params = input.params as never;
  if (input.status !== undefined) patch.status = input.status;

  const updated = await db
    .update(cronJobs)
    .set(patch as never)
    .where(eq(cronJobs.id, id))
    .returning();
  if (updated.length > 0) await reloadCronJob(id);
  return updated[0];
}

/** 切换启停（enabled/disabled，改动后重新/取消注册） */
export async function adminSetCronJobStatus(
  id: number,
  status: "enabled" | "disabled",
) {
  const updated = await db
    .update(cronJobs)
    .set({ status, updatedAt: new Date() })
    .where(eq(cronJobs.id, id))
    .returning();
  if (updated.length > 0) await reloadCronJob(id);
  return updated[0];
}

/** 删除任务（同时取消调度、级联删运行记录） */
export async function adminDeleteCronJob(id: number) {
  const deleted = await db
    .delete(cronJobs)
    .where(eq(cronJobs.id, id))
    .returning({ id: cronJobs.id });
  if (deleted.length > 0) await reloadCronJob(id);
  return deleted[0];
}

/** 手动立即触发（无论 enabled/disabled）；已在运行时抛 job_already_running */
export async function adminTriggerCronJob(id: number) {
  const job = await adminGetCronJob(id);
  if (!job) return undefined;
  return runCronJob(id, "manual");
}

/** 最近运行记录（默认最近 20 条） */
export async function adminListCronJobRuns(jobId?: number, limit = 20) {
  const limitC = Math.min(100, Math.max(1, limit));
  const conds: SQL[] = [];
  if (jobId !== undefined) conds.push(eq(cronJobRuns.jobId, jobId));

  return db
    .select()
    .from(cronJobRuns)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(cronJobRuns.startedAt))
    .limit(limitC);
}
