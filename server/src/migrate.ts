/**
 * 应用内数据库迁移（docker compose 启动时自动执行，免手工跑 drizzle-kit）。
 *
 * 等价于 `drizzle-kit migrate && node scripts/apply-manual-sql.mjs`：
 * 1. 按 drizzle/meta/_journal.json 顺序执行 drizzle/*.sql（记录表
 *    drizzle.__drizzle_migrations 与 drizzle-kit 完全兼容，已用过
 *    drizzle-kit migrate 的库可直接接续，按已记录条数断点续跑）
 * 2. 执行 drizzle/manual/*.sql（幂等：IF NOT EXISTS / DO 块检查）
 *
 * 失败抛错 → index.ts 退出进程 → Docker restart 策略重试。
 * SQL 文件从 cwd/drizzle 运行时读取（容器 WORKDIR=/app，本地 dev 为 server/）。
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { Client } from "pg";

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

async function readSqlFile(base: string, file: string): Promise<string> {
  return readFile(path.join(base, file), "utf8");
}

/** 执行 drizzle 主迁移（journal 顺序，断点续跑） */
async function applyCoreMigrations(client: Client, dir: string): Promise<number> {
  // 与 drizzle-kit 相同的记录表结构（兼容已有库）
  await client.query(
    `CREATE SCHEMA IF NOT EXISTS "drizzle"`,
  );
  await client.query(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      "id" SERIAL PRIMARY KEY,
      "hash" text NOT NULL,
      "created_at" numeric
    )`,
  );

  const journal = JSON.parse(
    await readSqlFile(dir, "meta/_journal.json"),
  ) as { entries: JournalEntry[] };

  const { rows } = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM "drizzle"."__drizzle_migrations"`,
  );
  const applied = Number(rows[0]?.n ?? 0);

  let ran = 0;
  for (let i = applied; i < journal.entries.length; i++) {
    const entry = journal.entries[i];
    const sql = await readSqlFile(dir, `${entry.tag}.sql`);
    // pg simple query 协议支持多语句；文件内 "--> statement-breakpoint" 为合法注释
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
         VALUES ($1, $2)`,
        [createHash("sha256").update(sql).digest("hex"), entry.when],
      );
      await client.query("COMMIT");
      ran++;
      console.log(`[migrate] applied: ${entry.tag}.sql`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }
  return ran;
}

/** 执行 manual/ 下幂等补充 SQL（enum 扩展、CHECK、HNSW 索引等） */
async function applyManualSql(client: Client, dir: string): Promise<void> {
  const manualDir = path.join(dir, "manual");
  const files = (await readdir(manualDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = await readFile(path.join(manualDir, f), "utf8");
    try {
      await client.query(sql);
      console.log(`[migrate] applied: manual/${f}`);
    } catch (err) {
      // 兼容 apply-manual-sql.mjs 的行为：已存在类错误视为跳过
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists")) {
        console.log(`[migrate] skipped: manual/${f} (already exists)`);
        continue;
      }
      throw err;
    }
  }
}

/** 启动时自动迁移。drizzle 目录从 cwd 解析（容器 WORKDIR=/app；本地 dev 为 server/） */
export async function runMigrations(): Promise<void> {
  const url =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@postgres:5432/game_discovery";
  const dir = path.resolve(process.cwd(), "drizzle");

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const ran = await applyCoreMigrations(client, dir);
    if (ran === 0) console.log("[migrate] schema up-to-date");
    await applyManualSql(client, dir);
  } finally {
    await client.end().catch(() => {});
  }
}
