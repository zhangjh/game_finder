/**
 * 疑似重复游戏检测（T3.7，PRD §34 "重复游戏 → Merge"）。
 *
 * 两路检测（结果写入 suspected_duplicates，pending 等人工处理）：
 * 1. slug 规范化（去非字母数字后小写）完全一致 —— 跨源同一游戏的最强信号
 * 2. 标题 trigram 相似度 > 阈值 —— 同 genre 且首字母相同桶内比对，
 *    避免全表 O(n²) 交叉（pg_trgm 扩展已在 T0.2 启用）
 *
 * 幂等：唯一约束 (game_id, duplicate_of_game_id) + ON CONFLICT DO NOTHING；
 * merged/dismissed 的历史结论不会被重复上报覆盖。
 */
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export interface DuplicateDetectOptions {
  /** 标题相似度阈值 0~1（默认 0.85，偏保守少误报） */
  titleThreshold?: number;
}

export interface DuplicateDetectStats {
  slugPairs: number;
  titlePairs: number;
  /** 本次新写入的疑似对（不含已存在的） */
  inserted: number;
  pendingTotal: number;
  error?: string;
}

export async function detectDuplicates(
  options: DuplicateDetectOptions = {},
): Promise<DuplicateDetectStats> {
  const threshold = Math.min(1, Math.max(0.5, options.titleThreshold ?? 0.85));
  const stats: DuplicateDetectStats = {
    slugPairs: 0,
    titlePairs: 0,
    inserted: 0,
    pendingTotal: 0,
  };

  try {
    // 路径 1：slug 规范化一致
    const slugRows = await db.execute(sql`
      with norm as (
        select id, regexp_replace(lower(slug), '[^a-z0-9]', '', 'g') as nslug
        from games
        where status <> 'offline'
      )
      insert into suspected_duplicates (game_id, duplicate_of_game_id, similarity, reason)
      select a.id, b.id, 1.0, 'slug'
      from norm a
      join norm b on a.nslug = b.nslug and a.id < b.id
      on conflict (game_id, duplicate_of_game_id) do nothing
      returning 1
    `);
    stats.slugPairs = slugRows.rowCount ?? 0;

    // 路径 2：标题 trigram 相似度（同 genre + 首字母桶内比对）
    const titleRows = await db.execute(sql`
      with pairs as (
        select a.id as aid, b.id as bid,
               similarity(a.title_original, b.title_original) as sim
        from games a
        join games b
          on a.id < b.id
         and a.genre = b.genre
         and left(a.title_original, 1) = left(b.title_original, 1)
        where a.status <> 'offline' and b.status <> 'offline'
      )
      insert into suspected_duplicates (game_id, duplicate_of_game_id, similarity, reason)
      select aid, bid, sim, 'title'
      from pairs
      where sim > ${threshold}
      on conflict (game_id, duplicate_of_game_id) do nothing
      returning 1
    `);
    stats.titlePairs = titleRows.rowCount ?? 0;

    stats.inserted = stats.slugPairs + stats.titlePairs;

    const pending = await db.execute(
      sql`select count(*)::int as n from suspected_duplicates where status = 'pending'`,
    );
    stats.pendingTotal =
      (pending.rows[0] as { n: number } | undefined)?.n ?? 0;
  } catch (err) {
    stats.error = err instanceof Error ? err.message : String(err);
  }

  return stats;
}
