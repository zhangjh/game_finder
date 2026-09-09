import { useEffect, useRef, useState } from "react";

import { trackEvent } from "../analytics/track";
import { useI18n } from "../i18n";
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
/** 启动停顿判定：超出此时间仍未收到播放器消息 → 提示用户 */
const STALL_TIMEOUT_MS = 15_000;

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
  /** 启动停顿：GamePix 播放器在移动端被广告/跟踪拦截时会永久停在加载态 */
  const [stalled, setStalled] = useState(false);
  /** 强制重新挂载 iframe（重新加载游戏） */
  const [reloadKey, setReloadKey] = useState(0);
  /** 是否收到过来自播放器（游戏源）的消息，视为已开始启动流程 */
  const bootSignaledRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  /** 存档状态：null=加载中 / {data,hasSave}=已就绪 */
  const [gameSave, setGameSave] = useState<{
    data: string | null;
    hasSave: boolean;
  } | null>(null);
  const { showToast } = useToast();
  const { t } = useI18n();

  const saveable = isGamePixEmbed(gameUrl);
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
  // 竖屏游戏在桌面端同样维持竖屏比例：否则桌面 16:9 的横屏 iframe
  // 会被游戏源判定为横屏，弹出无法关闭的"旋转设备"提示。
  // 横屏游戏保持原来的响应式比例。
  const frameAspect = portrait
    ? "aspect-[9/16]"
    : "aspect-[4/3] sm:aspect-video";

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
      showToast(t("saveFailed"), t("saveFailedSub"));
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
    bootSignaledRef.current = false;
    setStalled(false);
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
      // 收到播放器任何消息即视为已启动（结束停顿提示）
      if (!bootSignaledRef.current) {
        bootSignaledRef.current = true;
        setStalled(false);
      }
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

  // 启动停顿检测：GamePix 在移动端浏览器拦截广告/跨站跟踪时（Edge 跟踪防护、
  // 广告拦截/第三方 Cookie 隔离）会永久停在加载态。超时未收到播放器消息 →
  // 展示兜底提示（关闭拦截 / 直接打开 / 重新加载）。
  useEffect(() => {
    if (!saveable || !playing) return;
    const t = setTimeout(() => {
      if (!bootSignaledRef.current) setStalled(true);
    }, STALL_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [saveable, playing, reloadKey]);

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

  /** 停顿后重新加载：重建 iframe 并重新注入 LOAD_DATA */
  const reloadGame = () => {
    bootSignaledRef.current = false;
    setStalled(false);
    setReloadKey((k) => k + 1);
    startLoadInjection();
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
            {portrait ? t("portraitHint") : t("landscapeHint")}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => start(hasSave ? "continue" : "fresh")}
              className="rounded-full bg-primary px-8 py-3 font-medium text-primary-foreground shadow-lg transition-opacity hover:opacity-90"
            >
              {hasSave ? t("continueGame") : t("startGame")}
            </button>
            {hasSave ? (
              <button
                type="button"
                onClick={restart}
                className="rounded-full border border-white/40 px-6 py-3 text-sm font-medium text-white/90 transition-colors hover:border-white hover:text-white"
              >
                {t("restart")}
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
        <p className="font-medium">{t("playerLoadFailed")}</p>
        <p className="text-sm text-muted">{t("playerLoadFailedHint")}</p>
        <button
          type="button"
          onClick={() => start("fresh")}
          className="mt-2 rounded-full border border-border px-6 py-2 text-sm transition-colors hover:border-primary hover:text-primary"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className={`relative ${frameAspect} w-full overflow-hidden rounded-xl border border-border bg-black`}>
      <iframe
        key={reloadKey}
        ref={iframeRef}
        name={typeof window !== "undefined" ? window.location.origin : undefined}
        src={withExternalSave(gameUrl)}
        title={title}
        className="h-full w-full"
        allow="fullscreen; autoplay; gamepad; encrypted-media; clipboard-read; clipboard-write; picture-in-picture"
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
      />
      {stalled ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80 p-4 text-center text-white">
          <p className="text-sm font-semibold">{t("playerStalled")}</p>
          <p className="text-xs leading-relaxed text-white/70">
            {t("playerStalledHint")}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={reloadGame}
              className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t("reload")}
            </button>
            <button
              type="button"
              onClick={() => window.open(gameUrl, "_blank", "noopener,noreferrer")}
              className="rounded-full border border-white/50 px-5 py-2 text-sm text-white transition-colors hover:border-white"
            >
              {t("openNewTab")}
            </button>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={fullscreen ? t("exitFullscreen") : t("enterFullscreen")}
        title={fullscreen ? t("exitFullscreen") : t("enterFullscreen")}
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