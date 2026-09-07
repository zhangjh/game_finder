import { useEffect, useRef, useState } from "react";

import { trackEvent } from "../analytics/track";
import {
  clearGameSave,
  fetchGameSave,
  isGamePixEmbed,
  putGameSave,
  withExternalSave,
} from "../api";
import { useToast } from "./toast";

/** LOAD_DATA 注入循环节奏：每 400ms 一次，收到执行回执即停 */
const LOAD_POST_INTERVAL_MS = 400;
/** 最久持续注入 16s，避免游戏/广告异常导致无限循环 */
const LOAD_MAX_POSTS = 40;
/** SAVE_DATA 落库防抖：设置后 1s 内在有更新则刷新计时 */
const SAVE_DEBOUNCE_MS = 1_000;

/**
 * 游戏启动区（PRD §31）：点击后加载 iframe，含失败重试态。
 * M6：挂 behavior 埋点（start / 30s / 2min / 5min / exit）。
 * M6.5：GamePix 源走 official externalSave 协议——启动前注入 LOAD_DATA
 *（续玩存档 / "{}"），接收 SAVE_DATA 防抖落库。
 */
export function GamePlayer({
  gameId,
  slug,
  gameUrl,
  title,
  portrait,
  poster,
}: {
  gameId: number;
  slug: string;
  gameUrl: string;
  title: string;
  portrait: boolean;
  /** 未开始前的封面/截图，铺满整个游戏区 */
  poster?: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  /** 存档状态：null=加载中 / {data,hasSave}=已就绪 */
  const [gameSave, setGameSave] = useState<{
    data: string | null;
    hasSave: boolean;
  } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { showToast } = useToast();

  const saveable = isGamePixEmbed(gameUrl);
  /** 调试开关：URL 带 ?noSandbox=1 时去掉 iframe sandbox，用于真机 A/B */
  const debugNoSandbox =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("noSandbox");
  /** GamePix 播放器 origin（postMessage targetOrigin / 来源校验） */
  const gameOrigin = (() => {
    try {
      return new URL(gameUrl).origin;
    } catch {
      return "https://gamepix.com";
    }
  })();
  /** 本次会话要注入的 LOAD_DATA payload（continue=存档 / 否则 "{}"） */
  const loadPayloadRef = useRef<string>("{}");
  const pendingSaveRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 移动端若沿用 16:9 会让 iframe 高度过矮：游戏源（GamePix）的
  // 开始按钮被压缩到点不动、Cookie 提示条直接盖在按钮上（实测）。
  // 按游戏方向给更高的比例，sm 及以上维持 16:9。
  const frameAspect = portrait ? "aspect-[9/16] sm:aspect-video" : "aspect-[4/3] sm:aspect-video";

  // 会话计时器引用
  const startRef = useRef<number>(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // 本次页面已开始的会话数（>1 视为重玩）
  const sessionCountRef = useRef(0);

  const clearTimers = () => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  };

  const flushSave = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const p = pendingSaveRef.current;
    if (p == null) return;
    pendingSaveRef.current = null;
    void putGameSave(slug, p).catch(() => {
      showToast("存档保存失败", "请检查网络后重试");
    });
  };

  const stopLoadLoop = () => {
    if (loadTimerRef.current) {
      clearInterval(loadTimerRef.current);
      loadTimerRef.current = null;
    }
  };

  /** 仅 GamePix：注入 LOAD_DATA 直到播放器回执（幂等，可安全重复发送） */
  const startLoadInjection = () => {
    if (!saveable) return;
    stopLoadLoop();
    const payload = loadPayloadRef.current;
    let posts = 0;
    loadTimerRef.current = setInterval(() => {
      const target = iframeRef.current;
      if (!target?.contentWindow) return;
      target.contentWindow.postMessage(
        { type: "LOAD_DATA", payload },
        gameOrigin,
      );
      posts += 1;
      if (posts >= LOAD_MAX_POSTS) stopLoadLoop();
    }, LOAD_POST_INTERVAL_MS);
  };

  const start = (mode: "continue" | "fresh") => {
    setFailed(false);
    setPlaying(true);
    startRef.current = Date.now();
    sessionCountRef.current += 1;

    if (mode === "continue") {
      loadPayloadRef.current = gameSave?.data ?? "{}";
    } else {
      loadPayloadRef.current = "{}";
    }
    startLoadInjection();

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

  /** 「重新开始」：先清档，再以空档开始本局 */
  const restart = () => {
    setGameSave({ data: null, hasSave: false });
    void clearGameSave(slug).catch(() => {});
    start("fresh");
  };

  // 加载续玩存档（GamePix 源）
  useEffect(() => {
    if (!saveable) {
      setGameSave({ data: null, hasSave: false });
      return;
    }
    let cancelled = false;
    fetchGameSave(slug)
      .then((r) => {
        if (!cancelled) setGameSave({ data: r.data, hasSave: r.saved });
      })
      .catch(() => {
        if (!cancelled) setGameSave({ data: null, hasSave: false });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, saveable]);

  // 接收 SAVE_DATA（GamePix 播放器→本站），防抖落库
  useEffect(() => {
    if (!saveable || !playing) return;

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== gameOrigin) return;
      const d = e.data as {
        type?: string;
        payload?: { key?: unknown; value?: unknown };
        object?: unknown;
      } | null;
      if (!d || d.type !== "SAVE_DATA") return;
      const value = d.payload?.value;
      if (typeof value !== "string" || value.length === 0) return;

      pendingSaveRef.current = value;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      flushSave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveable, playing, slug]);

  // 退出时上报 game_exit（含会话时长）
  useEffect(() => {
    if (!playing) return;

    const handleExit = () => {
      clearTimers();
      stopLoadLoop();
      flushSave();
      const sessionSeconds = (Date.now() - startRef.current) / 1000;
      trackEvent({ eventType: "game_exit", gameId, sessionSeconds });
    };

    // 页面离开兜底并清掉未落库的存档
    window.addEventListener("beforeunload", handleExit);
    return () => {
      window.removeEventListener("beforeunload", handleExit);
      handleExit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, gameId, slug]);

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

  // 全屏播放：播放区右上角提供全屏/还原按钮。
  // 移动端全屏后 iframe 填满真机屏幕，游戏源（GamePix）按真实屏幕渲染，
  // 与上面"移动端方向比例适配"互为补充。
  useEffect(() => {
    const onFullscreenChange = () =>
      setFullscreen(document.fullscreenElement != null);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else if (iframeRef.current) {
      void iframeRef.current.requestFullscreen().catch(() => {});
    }
  };

  if (!playing && !failed) {
    const hasSave = saveable && !!gameSave?.hasSave;
    return (
      <div className={`relative ${frameAspect} w-full overflow-hidden rounded-xl border border-border bg-surface`}>
        {poster ? (
          <>
            <img
              src={poster}
              alt={title}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-black/35" />
          </>
        ) : null}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <p
            className={`text-sm drop-shadow ${poster ? "text-white/90" : "text-muted"}`}
          >
            {portrait ? "建议竖屏体验" : "建议横屏 / 桌面体验"}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => start(hasSave ? "continue" : "fresh")}
              className="rounded-full bg-primary px-8 py-3 font-medium text-primary-foreground shadow-lg transition-opacity hover:opacity-90"
            >
              {hasSave ? "▶ 继续游戏" : "▶ 开始游戏"}
            </button>
            {hasSave ? (
              <button
                type="button"
                onClick={restart}
                className="rounded-full border border-white/40 px-6 py-3 text-sm font-medium text-white/90 transition-colors hover:border-white hover:text-white"
              >
                重新开始
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className={`flex ${frameAspect} w-full flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface text-center`}>
        <p className="font-medium">游戏加载失败</p>
        <p className="text-sm text-muted">可能是网络波动或游戏源暂时不可用</p>
        <button
          type="button"
          onClick={() => start("fresh")}
          className="mt-2 rounded-full border border-border px-6 py-2 text-sm transition-colors hover:border-primary hover:text-primary"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className={`relative ${frameAspect} w-full overflow-hidden rounded-xl border border-border bg-black`}>
      <iframe
        ref={iframeRef}
        name={typeof window !== "undefined" ? window.location.origin : undefined}
        src={withExternalSave(gameUrl)}
        title={title}
        className="h-full w-full"
        allow="fullscreen; autoplay; gamepad; encrypted-media; clipboard-read; clipboard-write; picture-in-picture"
        {...(!debugNoSandbox && {
          sandbox:
            "allow-scripts allow-same-origin allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation",
        })}
      />
      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={fullscreen ? "退出全屏" : "进入全屏"}
        title={fullscreen ? "退出全屏" : "进入全屏"}
        className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/70"
      >
        {fullscreen ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        )}
      </button>
    </div>
  );
}