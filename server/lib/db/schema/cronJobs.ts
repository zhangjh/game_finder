import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * 定时任务（T3.6 应用内调度版）。
 *
 * 替代 VPS OS crontab：应用进程内用 node-cron 维护调度，
 * 管理后台可读启停 / 编辑计划 / 手动触发 / 查看最近运行记录，
 * 避免部署时手动配置 crontab、也无需公开 /api/cron 端口。
 */
export const cronJobStatusEnum = pgEnum("cron_job_status", ["enabled", "disabled"]);

export const cronJobTypeEnum = pgEnum("cron_job_type", [
  "sync_games",
  "health_check",
  "detect_duplicates",
  "analyze_games",
  "relation_games",
  "compute_scores",
]);

export const cronJobs = pgTable(
  "cron_jobs",
  {
    id: serial("id").primaryKey(),
    /** sync_games / health_check / detect_duplicates */
    type: cronJobTypeEnum("type").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Cron 表达式（5 段：分 时 日 月 周） */
    schedule: text("schedule").notNull(),
    status: cronJobStatusEnum("status").notNull().default("enabled"),
    /** 触发时的附加参数（JSON，如 { source: "gamepix", limit: 500 }） */
    params: jsonb("params"),
    /** 上一次实际执行结果摘要 */
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastRunStatus: text("last_run_status"),
    lastRunDurationMs: integer("last_run_duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("cron_jobs_type_idx").on(t.type)],
);

export const cronJobRuns = pgTable(
  "cron_job_runs",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => cronJobs.id, { onDelete: "cascade" }),
    /** ok / error */
    status: text("status").notNull(),
    /** 触发方式：schedule / manual */
    trigger: text("trigger").notNull().default("schedule"),
    /** 运行结果统计 JSON */
    result: jsonb("result"),
    error: text("error"),
    durationMs: integer("duration_ms"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("cron_job_runs_job_idx").on(t.jobId),
    index("cron_job_runs_started_idx").on(t.startedAt),
  ],
);
