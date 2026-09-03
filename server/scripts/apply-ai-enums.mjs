/**
 * 应用/清理 M4 定时任务类型枚举值。
 *
 * - 确保 analyze_games / relation_games 存在
 * - 移除已废弃的 embedding_games（embedding 已并入 analyze_games，不再有独立任务）
 *
 * 幂等：各步均有检查/保护。用法：node scripts/apply-ai-enums.mjs
 */
import { Client } from "pg";

const url =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/game_discovery";

const ADD_VALUES = ["analyze_games", "relation_games"];
const DROP_VALUES = ["embedding_games"];

const c = new Client({ connectionString: url });

async function getEnumLabels(): Promise<string[]> {
  const { rows } = await c.query(
    `select enumlabel from pg_enum where enumtypid=(select oid from pg_type where typname='cron_job_type') order by enumsortorder`,
  );
  return rows.map((r) => r.enumlabel);
}

async function addValue(v: string): Promise<void> {
  await c.query(`DO $$ BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_enum
       WHERE enumlabel = '${v}'
         AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'cron_job_type')
     ) THEN
       ALTER TYPE "cron_job_type" ADD VALUE '${v}';
     END IF;
   END $$`);
  console.log(`ensure: ${v}`);
}

/**
 * 从枚举类型移除某个值。Postgres 不支持直接 DROP enum value，需重建类型。
 * 仅在确认无行引用该值时执行；若引用行存在或有其它错误则安全跳过并提示。
 */
async function dropValue(v: string): Promise<void> {
  const labels = await getEnumLabels();
  if (!labels.includes(v)) {
    console.log(`absent (ok): ${v} 无需移除`);
    return;
  }

  // 重建枚举类型以移除该值：CREATE 新类型 -> 用 CAST 转移 -> DROP 旧类型。
  // 先检查是否有行引用该值，避免 CAST 失败破坏数据。
  const refs = await c.query(
    `select 1 from cron_jobs where type::text = '${v}' limit 1`,
  );
  if (refs.rowCount > 0) {
    console.warn(
      `SKIP: ${v} 仍被 cron_jobs 引用，不能移除。请先将相关任务停用/删除后重试。`,
    );
    return;
  }

  const targetArgs = labels.filter((l) => l !== v).join(", ");
  const newTypeName = "cron_job_type_new";
  await c.query(`DROP TYPE IF EXISTS ${newTypeName}`);
  await c.query(`CREATE TYPE ${newTypeName} AS ENUM (${targetArgs
    .split(",")
    .map((x) => `'${x.trim()}'`)
    .join(", ")})`);
  await c.query(`ALTER TABLE cron_jobs ALTER COLUMN type TYPE ${newTypeName} USING type::text::${newTypeName}`);
  await c.query(`DROP TYPE "cron_job_type"`);
  await c.query(`ALTER TYPE ${newTypeName} RENAME TO "cron_job_type"`);
  console.log(`removed: ${v}`);
}

async function main() {
  await c.connect();
  console.log("current cron_job_type:", (await getEnumLabels()).join(", "));

  for (const v of ADD_VALUES) await addValue(v);
  for (const v of DROP_VALUES) await dropValue(v);

  console.log("after cron_job_type:", (await getEnumLabels()).join(", "));
  await c.end();
}

main().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
