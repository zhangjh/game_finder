/**
 * 游戏健康巡检（T3.6，PRD §34）。
 *
 * 每次巡检一批"最久未检查"的活跃游戏：
 * - game_url HTTP 可达性 → 失败累计 health_fail_count，成功清零
 * - thumbnail 可达性 → 仅统计（CDN 抖动不该下线可玩的游戏）
 * - published 且连续失败 ≥ 阈值 → 自动下线（offline）
 *   draft/pending 只累计失败数，不自动下线（未上前台，且 M4 质检会看）
 * - 非 http(s) URL（about:blank / 相对路径）跳过，不计数
 *
 * 并发受限 + 单请求超时，避免打爆源站或被源站限流。
 */
import { asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { games } from "@/lib/db/schema";

const CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 10_000;
/** HEAD 被部分 CDN 拒绝（405/501），视为"可达" */
const HEAD_OK_STATUSES = new Set([405, 501]);

export interface HealthCheckOptions {
  /** 本次巡检条数上限（默认 200） */
  limit?: number;
  /** published 连续失败多少次后自动下线（默认 3） */
  offlineThreshold?: number;
}

export interface HealthCheckStats {
  checked: number;
  ok: number;
  gameUrlFail: number;
  thumbnailFail: number;
  skipped: number;
  offlined: number;
  error?: string;
}

async function urlOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "follow",
    });
    return res.ok || HEAD_OK_STATUSES.has(res.status);
  } catch {
    return false;
  }
}

export async function runHealthCheck(
  options: HealthCheckOptions = {},
): Promise<HealthCheckStats> {
  const limit = Math.min(2000, Math.max(1, options.limit ?? 200));
  const threshold = Math.max(1, options.offlineThreshold ?? 3);
  const stats: HealthCheckStats = {
    checked: 0,
    ok: 0,
    gameUrlFail: 0,
    thumbnailFail: 0,
    skipped: 0,
    offlined: 0,
  };

  try {
    // 最久未检查优先（nulls first），保证全量轮转覆盖
    const targets = await db
      .select({
        id: games.id,
        status: games.status,
        gameUrl: games.gameUrl,
        thumbnail: games.thumbnail,
        healthFailCount: games.healthFailCount,
      })
      .from(games)
      .where(inArray(games.status, ["draft", "pending", "published"]))
      .orderBy(sql`${games.healthCheckedAt} asc nulls first`, asc(games.id))
      .limit(limit);

    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (g) => {
          stats.checked++;

          // 本地占位/mock 数据（about:blank、相对路径）跳过
          if (!/^https?:\/\//.test(g.gameUrl)) {
            stats.skipped++;
            await db
              .update(games)
              .set({ healthCheckedAt: new Date() })
              .where(eq(games.id, g.id));
            return;
          }

          const [gameOk, thumbOk] = await Promise.all([
            urlOk(g.gameUrl),
            g.thumbnail && /^https?:\/\//.test(g.thumbnail)
              ? urlOk(g.thumbnail)
              : Promise.resolve(true),
          ]);

          if (!thumbOk) stats.thumbnailFail++;

          if (gameOk) {
            stats.ok++;
            await db
              .update(games)
              .set({ healthCheckedAt: new Date(), healthFailCount: 0 })
              .where(eq(games.id, g.id));
            return;
          }

          stats.gameUrlFail++;
          const failCount = g.healthFailCount + 1;
          const shouldOffline = g.status === "published" && failCount >= threshold;
          await db
            .update(games)
            .set({
              healthCheckedAt: new Date(),
              healthFailCount: failCount,
              ...(shouldOffline ? { status: "offline" as const } : {}),
            })
            .where(eq(games.id, g.id));
          if (shouldOffline) stats.offlined++;
        }),
      );
    }
  } catch (err) {
    stats.error = err instanceof Error ? err.message : String(err);
  }

  return stats;
}
