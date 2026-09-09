/**
 * 分享按钮：详情页专用。
 *
 * 优先调用 navigator.share 唤起系统分享面板（移动端体验最佳）；
 * 桌面浏览器或不支持 Web Share API 时，回退到复制当前 URL 到剪贴板，
 * 并用 Toast 给出明确反馈。用户在原生面板点“取消”不视为失败。
 */
import { useState } from "react";

import { trackEvent } from "../analytics/track";
import { useI18n } from "../i18n";
import { useToast } from "./toast";
import type { GameDetail } from "@game-finder/shared";

type ShareButtonProps = {
  game: GameDetail;
};

type ShareMethod = "native" | "clipboard" | "fallback";

export function ShareButton({ game }: ShareButtonProps) {
  const { t, lang } = useI18n();
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const shareUrl =
    typeof window !== "undefined" ? window.location.href : `/game/${game.slug}`;
  // 英文界面优先原始英文描述（T1.7）
  const shareDescription =
    lang === "en"
      ? (game.descriptionOriginal || game.description).slice(0, 60)
      : game.description.slice(0, 60);
  const shareTitle = lang === "en" ? game.titleOriginal || game.title : game.title;
  const shareText = t("shareText", {
    title: shareTitle,
    desc: shareDescription,
  }) + (shareDescription.length > 60 ? "…" : "");

  const handleShare = async () => {
    // 1) Web Share API：移动端 / 部分桌面浏览器（Safari、Edge）
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        reportShare("native");
        return;
      } catch (err) {
        // 用户主动取消分享面板不算失败，静默返回
        if ((err as { name?: string })?.name === "AbortError") return;
        // 其它错误降级到复制
      }
    }

    // 2) Clipboard API：现代浏览器 https / localhost
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard?.writeText
    ) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        reportShare("clipboard");
        flashCopied();
        return;
      } catch {
        // 继续降级
      }
    }

    // 3) execCommand 兜底：老浏览器 / 非安全上下文
    try {
      const ta = document.createElement("textarea");
      ta.value = shareUrl;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) {
        reportShare("fallback");
        flashCopied();
      } else {
        showToast(t("copyFailed"));
      }
    } catch {
      showToast(t("copyFailed"));
    }
  };

  const reportShare = (method: ShareMethod) => {
    trackEvent({
      eventType: "share",
      gameId: game.id,
      context: { method, slug: game.slug },
    });
  };

  const flashCopied = () => {
    setCopied(true);
    showToast(t("copiedToast"), t("copiedToastSub"));
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={t("shareAria")}
      className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
        copied
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted hover:border-primary hover:text-primary"
      }`}
    >
      <ShareIcon copied={copied} size={16} />
      {copied ? t("copied") : t("share")}
    </button>
  );
}

function ShareIcon({ copied, size = 16 }: { copied: boolean; size?: number }) {
  if (copied) {
    // 复制成功后短暂显示对勾
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
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
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
