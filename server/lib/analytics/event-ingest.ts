/**
 * 批量事件写入（T6.2）。
 *
 * 前端通过 sendBeacon / fetch 批量上报行为事件，
 * 本模块做校验 + 批量插入 user_events 表。
 *
 * 事件类型（PRD §25）：game_impression / game_click / game_start /
 *   game_30s / game_2min / game_5min / game_exit / game_replay /
 *   favorite / recommendation_impression / recommendation_click
 */
import { db } from "@/lib/db";
import { games, userEvents } from "@/lib/db/schema";
import { inArray, sql } from "drizzle-orm";

export const VALID_EVENT_TYPES = [
  "game_impression",
  "game_click",
  "game_start",
  "game_30s",
  "game_2min",
  "game_5min",
  "game_exit",
  "game_replay",
  "favorite",
  "recommendation_impression",
  "recommendation_click",
] as const;

export type ValidEventType = (typeof VALID_EVENT_TYPES)[number];

export interface RawEvent {
  /** 匿名用户 ID（Cookie UUID） */
  userId: string;
  /** 事件类型 */
  eventType: string;
  /** 游戏 ID（部分事件如 recommendation_impression 可不传） */
  gameId?: number;
  /** 推荐上下文（request_id + 排名，用于归因） */
  context?: Record<string, unknown>;
  /** 会话时长秒（仅 game_exit 等携带） */
  sessionSeconds?: number;
  /** 事件时间戳（前端传 ISO 字符串，缺省用 now） */
  timestamp?: string;
}

interface IngestResult {
  accepted: number;
  rejected: number;
}

/**
 * 批量写入事件（单次最多 100 条，前端按窗口期批量上报）。
 * 校验失败的条目静默跳过（统计基础设施不应阻塞前端）。
 */
export async function ingestEvents(raw: RawEvent[]): Promise<IngestResult> {
  if (!raw || raw.length === 0) return { accepted: 0, rejected: 0 };
  const batch = raw.slice(0, 100);

  const validTypes = new Set<string>(VALID_EVENT_TYPES);
  const rows: {
    userId: string;
    eventType: ValidEventType;
    gameId: number | null;
    context: Record<string, unknown> | null;
    sessionSeconds: number | null;
    createdAt: Date;
  }[] = [];
  let rejected = 0;

  for (const e of batch) {
    if (
      !e.userId ||
      typeof e.userId !== "string" ||
      !validTypes.has(e.eventType)
    ) {
      rejected++;
      continue;
    }
    rows.push({
      userId: e.userId,
      eventType: e.eventType as ValidEventType,
      gameId: typeof e.gameId === "number" ? e.gameId : null,
      context: e.context && typeof e.context === "object" ? e.context : null,
      sessionSeconds:
        typeof e.sessionSeconds === "number" ? Math.round(e.sessionSeconds) : null,
      createdAt: e.timestamp ? new Date(e.timestamp) : new Date(),
    });
  }

  if (rows.length === 0) return { accepted: 0, rejected };

  try {
    await db.insert(userEvents).values(rows);

    // 增量更新 play_count：game_start 事件 +1
    const startGameIds = [
      ...new Set(
        rows
          .filter((r) => r.eventType === "game_start" && r.gameId != null)
          .map((r) => r.gameId!),
      ),
    ];
    if (startGameIds.length > 0) {
      await db
        .update(games)
        .set({
          playCount: sql`${games.playCount} + 1`,
          updatedAt: new Date(),
        })
        .where(inArray(games.id, startGameIds));
    }

    return { accepted: rows.length, rejected };
  } catch (err) {
    console.error("[event-ingest] batch insert failed:", err);
    return { accepted: 0, rejected: batch.length };
  }
}
