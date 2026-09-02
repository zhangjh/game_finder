import { useEffect, useRef, useState } from "react";

/**
 * 游戏启动区（PRD §31）：点击后加载 iframe，含失败重试态。
 * M6 将在此挂 behavior 埋点（start / 30s / 2min / 5min / exit）。
 */
export function GamePlayer({
  gameUrl,
  title,
  portrait,
}: {
  gameUrl: string;
  title: string;
  portrait: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const start = () => {
    setFailed(false);
    setPlaying(true);
  };

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      // 真实源上线后的加载超时兜底（M3 接真源后校准）
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
