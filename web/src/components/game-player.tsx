import { useEffect, useRef, useState } from "react";

import { trackEvent } from "../analytics/track";

/**
 * 游戏启动区（PRD §31）：点击后加载 iframe，含失败重试态。
 * M6：挂 behavior 埋点（start / 30s / 2min / 5min / exit）。
 */
export function GamePlayer({
  gameId,
  gameUrl,
  title,
  portrait,
}: {
  gameId: number;
  gameUrl: string;
  title: string;
  portrait: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 会话计时器引用
  const startRef = useRef<number>(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // 本次页面已开始的会话数（>1 视为重玩）
  const sessionCountRef = useRef(0);

  const clearTimers = () => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  };

  const start = () => {
    setFailed(false);
    setPlaying(true);
    startRef.current = Date.now();
    sessionCountRef.current += 1;

    // 再次开始（同一页面已玩过）→ 同时上报 replay
    trackEvent({ eventType: "game_start", gameId });
    if (sessionCountRef.current > 1) {
      trackEvent({ eventType: "game_replay", gameId });
    }

    // 30s / 2min / 5min 里程碑事件
    timersRef.current = [
      setTimeout(() => trackEvent({ eventType: "game_30s", gameId }), 30_000),
      setTimeout(() => trackEvent({ eventType: "game_2min", gameId }), 120_000),
      setTimeout(() => trackEvent({ eventType: "game_5min", gameId }), 300_000),
    ];
  };

  // 退出时上报 game_exit（含会话时长）
  useEffect(() => {
    if (!playing) return;

    const handleExit = () => {
      clearTimers();
      const sessionSeconds = (Date.now() - startRef.current) / 1000;
      trackEvent({ eventType: "game_exit", gameId, sessionSeconds });
    };

    // 页面离开兜底
    window.addEventListener("beforeunload", handleExit);
    return () => {
      window.removeEventListener("beforeunload", handleExit);
      handleExit();
    };
  }, [playing, gameId]);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (iframeRef.current && !iframeRef.current.contentWindow) {
        setFailed(true);
        setPlaying(false);
      }
    }, 15_000);
    return () => clearTimeout(t);
  }, [playing]);

  if (!playing && !failed) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 rounded-xl border border-border bg-surface">
        <p className="text-sm text-muted">
          {portrait ? "建议竖屏体验" : "建议横屏 / 桌面体验"}
        </p>
        <button
          type="button"
          onClick={start}
          className="rounded-full bg-primary px-8 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          ▶ 开始游戏
        </button>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface text-center">
        <p className="font-medium">游戏加载失败</p>
        <p className="text-sm text-muted">可能是网络波动或游戏源暂时不可用</p>
        <button
          type="button"
          onClick={start}
          className="mt-2 rounded-full border border-border px-6 py-2 text-sm transition-colors hover:border-primary hover:text-primary"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
      <iframe
        ref={iframeRef}
        src={gameUrl}
        title={title}
        className="h-full w-full"
        allow="fullscreen; autoplay; gamepad"
        sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups"
      />
    </div>
  );
}
