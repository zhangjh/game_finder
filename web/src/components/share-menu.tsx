/**
 * 分享菜单（DANTE-7，T9.4 分享链路）。
 *
 * 一个弹层菜单，提供带 UTM 的渠道分享：
 *   - 微信 / 小红书 / B站 / 通用复制：复制带 utm_* 参数的详情页链接
 *   - 生成海报：canvas 海报 + 二维码，保存/分享图片
 *
 * 分享行为统一埋点：eventType=share，context 记录渠道与 slug，
 * 便于渠道看板核对分享→落地→启动的转化。
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

import { trackEvent } from "../analytics/track";
import { appendUtm } from "../analytics/utm";
import { useI18n, type I18nKey } from "../i18n";
import { SharePosterModal } from "./share-poster";
import { useToast } from "./toast";

export interface ShareChannel {
  id: string;
  key: I18nKey;
  icon: ReactNode;
  /** 指定渠道的 UTM（source 必填） */
  utm?: { source: string; medium?: string };
  hintKey?: I18nKey;
}

const CHANNELS: ShareChannel[] = [
  {
    id: "wechat",
    key: "shareChannelWechat",
    icon: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8.69 4C4.99 4 2 6.84 2 10.34c0 2 .96 3.8 2.55 5.03l-.68 2.06 2.42-1.32c.78.2 1.53.34 2.4.34h.84c-.1-.5-.16-1-.16-1.53 0-3.3 2.94-5.55 6.3-5.55h.55C15.6 6.07 12.4 4 8.7 4.01Zm-2 3.62c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1Zm6.8 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1Z" />
        <path d="M21.5 13.24c0-2.74-2.77-4.55-5.52-4.55-3 0-5.44 2.02-5.44 4.67s2.44 4.66 5.44 4.66c.66 0 1.28-.11 1.87-.3l1.96 1.03-.55-1.66C21.02 16.36 21.5 14.92 21.5 13.24Zm-7.34-1.2a.91.91 0 1 1 .9-.9.9.9 0 0 1-.9.9Zm3.2 0a.91.91 0 1 1 .9-.9.9.9 0 0 1-.9.9Z" />
      </svg>
    ),
    utm: { source: "wechat", medium: "article" },
    hintKey: "shareWechatHint",
  },
  {
    id: "xiaohongshu",
    key: "shareChannelXiaohongshu",
    icon: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <circle cx="12" cy="13" r="2.5" />
        <path d="M10.5 15.5 9.5 21" />
        <path d="M13.5 15.5 14.5 21" />
      </svg>
    ),
    utm: { source: "xiaohongshu", medium: "post" },
    hintKey: "shareXiaohongshuHint",
  },
  {
    id: "bilibili",
    key: "shareChannelBilibili",
    icon: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="7" width="18" height="13" rx="2.5" />
        <path d="M9 7V4" />
        <path d="M15 7V4" />
        <path d="M7 11.5h4" />
        <path d="M13 11.5h4" />
      </svg>
    ),
    utm: { source: "bilibili", medium: "video" },
    hintKey: "shareBilibiliHint",
  },
  {
    id: "link",
    key: "shareChannelLink",
    icon: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
    utm: { source: "link", medium: "post" },
  },
  {
    id: "poster",
    key: "shareChannelPoster",
    icon: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </svg>
    ),
  },
];

export interface ShareTarget {
  slug: string;
  title: string;
  titleOriginal?: string;
  description: string;
  thumbnail?: string | null;
  gameId?: number;
}

type ShareMenuProps = {
  target: ShareTarget;
  /** 触发按钮内容（默认分享按钮） */
  trigger?: ReactNode;
  triggerClassName?: string;
  /** 菜单对齐方向 */
  align?: "left" | "right";
};

export function ShareMenu({ target, trigger, triggerClassName, align = "left" }: ShareMenuProps) {
  const { t, lang } = useI18n();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [posterOpen, setPosterOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const defaultChannel = CHANNELS.find((c) => c.id === "wechat");

  /** 渠道标识（展示 + 埋点） */
  const channelLabel = (c: ShareChannel) =>
    c.id === "link" ? `${t("shareChannelLink")} / ${t("shareSystem")}` : t(c.key);

  const buildUrl = (c: ShareChannel) =>
    appendUtm(`/game/${target.slug}`, c.utm ?? { source: "link", medium: "post" });

  const copyToClipboard = async (text: string): Promise<boolean> => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        /* fallthrough */
      }
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  const reportShare = (channel: string, url?: string) => {
    trackEvent({
      eventType: "share",
      gameId: target.gameId,
      context: { method: "channel", channel, slug: target.slug, url },
    });
  };

  const handleChannel = async (c: ShareChannel) => {
    if (c.id === "poster") {
      setPosterOpen(true);
      setOpen(false);
      return;
    }
    const url = buildUrl(c);
    const ok = await copyToClipboard(url);
    if (ok) {
      reportShare(c.id, url);
      showToast(t("copiedToast"), c.hintKey ? t(c.hintKey) : t("copiedToastSub"));
      setOpen(false);
    } else {
      showToast(t("copyFailed"));
    }
  };

  const shareTitle = lang === "en" ? target.titleOriginal || target.title : target.title;

  const triggerNode = trigger ?? (
    <span className="flex items-center gap-1.5">
      <ShareGlyph size={16} />
      {t("share")}
    </span>
  );

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("shareAria")}
        aria-expanded={open}
        className={
          triggerClassName ??
          "flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-all hover:border-primary hover:text-primary"
        }
      >
        {triggerNode}
      </button>

      {open && (
        <div
          className={`absolute z-30 mt-2 w-56 rounded-xl border border-border bg-surface p-1.5 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
          role="menu"
        >
          <p className="px-3 py-1.5 text-xs font-medium text-muted">
            {t("shareMenu")} · {shareTitle}
          </p>
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="menuitem"
              onClick={() => handleChannel(c)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-primary/10"
            >
              <span className="text-primary">{c.icon}</span>
              <span className="flex-1">{channelLabel(c)}</span>
              {c.id === "wechat" && (
                <span className="shrink-0 text-xs text-muted">
                  {t("shareViaWechatTag")}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {posterOpen && (
        <SharePosterModal
          target={target}
          url={buildUrl(defaultChannel!)}
          onClose={() => setPosterOpen(false)}
        />
      )}
    </div>
  );
}

export function ShareGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.59 13.51 6.83 3.98" />
      <path d="m15.41 6.51-6.82 3.98" />
    </svg>
  );
}

/** 推荐卡片/列表的小型分享入口（避免弹菜单遮挡） */
export function MiniShareButton({ target }: { target: ShareTarget }) {
  const { t } = useI18n();
  return (
    <ShareMenu
      target={target}
      align="right"
      trigger={
        <span className="flex items-center gap-1">
          <ShareGlyph size={13} />
          <span className="text-xs">{t("share")}</span>
        </span>
      }
      triggerClassName="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-primary hover:text-primary"
    />
  );
}