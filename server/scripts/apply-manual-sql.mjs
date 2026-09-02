/**
 * 应用 drizzle/manual/ 下的手动补充 SQL（CHECK 约束、HNSW 索引等
 * drizzle-kit 无法生成的部分）。所有语句均幂等（IF NOT EXISTS / ADD
 * CONSTRAINT 前置存在性检查），可随 db:migrate 重复执行。
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/game_discovery";

const dir = path.resolve("drizzle/manual");
const client = new Client({ connectionString: url });

try {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  await client.connect();
  for (const f of files) {
    const sql = await readFile(path.join(dir, f), "utf8");
    await client.query(sql);
    console.log(`applied: ${f}`);
  }
} catch (err) {
  // ADD CONSTRAINT 无 IF NOT EXISTS 支持（PG 17 前），重复执行时忽略已存在错误
  if (!err.message?.includes("already exists")) {
    console.error("FAIL:", err.message);
    process.exit(1);
  }
  console.log("skipped: constraints already exist");
} finally {
  await client.end().catch(() => {});
}
