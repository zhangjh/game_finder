import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

/**
 * 进程级连接池单例。
 *
 * Next.js dev 模式下模块会被 HMR 反复重新加载，
 * 挂在 globalThis 上避免每次热更新都新建连接池。
 */
const globalForDb = globalThis as unknown as {
  pgPool?: Pool;
};

export const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/game_discovery",
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
}

export const db = drizzle(pool, { schema });

export type Db = typeof db;
