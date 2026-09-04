/**
 * 前端行为埋点（T6.2，PRD §25）。
 *
 * 核心设计：
 * - trackEvent() 入队内存 buffer，不阻塞主线程
 * - buffer 满 20 条或每 10 秒自动 flush 到 POST /api/events
 * - 页面离开（beforeunload）用 navigator.sendBeacon 兜底
 * - 游戏页计时器驱动 30s / 2min / 5min 里程碑事件
 *
 * 事件全集（PRD §25）：game_impression / game_click / game_start /
 *   game_30s / game_2min / game_5min / game_exit / game_replay /
 *   favorite / recommendation_impression / recommendation_click
 */
import { getUserId } from "./user-id";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const FLUSH_INTERVAL_MS = 10_000;
const FLUSH_BATCH_SIZE = 20;

export type EventType =
  | "game_impression"
  | "game_click"
  | "game_start"
  | "game_30s"
  | "game_2min"
  | "game_5min"
  | "game_exit"
  | "game_replay"
  | "favorite"
  | "recommendation_impression"
  | "recommendation_click";

export interface TrackEvent {
  eventType: EventType;
  gameId?: number;
  context?: Record<string, unknown>;
  sessionSeconds?: number;
}

interface PendingEvent extends TrackEvent {
  userId: string;
  timestamp: string;
}

/** 内存 buffer */
const buffer: PendingEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushing = false;

/**
 * 记录一条事件（非阻塞）。
 */
export function trackEvent(event: TrackEvent): void {
  buffer.push({
    ...event,
    userId: getUserId(),
    timestamp: new Date().toISOString(),
  });

  if (buffer.length >= FLUSH_BATCH_SIZE) {
    void flush();
  }
}

/**
 * 批量 flush buffer 到后端。
 * 用 sendBeacon + keepalive 兜底页面退出场景（已在 beforeunload 中调用）。
 */
async function flush(): Promise<void> {
  if (flushing || buffer.length === 0) return;
  flushing = true;

  const batch = buffer.splice(0, FLUSH_BATCH_SIZE);
  if (batch.length === 0) {
    flushing = false;
    return;
  }

  try {
    const body = JSON.stringify({ events: batch });

    // 优先 sendBeacon（页面退出不丢），否则 fetch
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      const sent = navigator.sendBeacon(`${BASE_URL}/api/events`, blob);
      if (sent) {
        flushing = false;
        return;
      }
    }

    await fetch(`${BASE_URL}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // 统计基础设施故障不影响用户体验，静默丢弃
  } finally {
    flushing = false;
  }
}

/**
 * 定时 flush + 页面退出兜底。
 * 调用 startTracking() 在 AnalyticsProvider mount 时初始化。
 */
let started = false;

export function startTracking(): void {
  if (started) return;
  started = true;

  flushTimer = setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      void flush();
    });
  }
}

export function stopTracking(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  started = false;
}
