/**
 * 反馈按钮：详情页专用，位于「分享」「收藏」旁。
 *
 * 点击弹出反馈弹窗：选择「游戏打不开/玩不了」或「游戏语言不对」
 * （英文不算语言错误），可附补充说明，提交后保存到后台反馈专区。
 */
import { useEffect, useState } from "react";

import { submitGameFeedback } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "./toast";
import type {
  GameDetail,
  GameFeedbackType,
} from "@game-finder/shared";

type FeedbackButtonProps = {
  game: GameDetail;
};

export function FeedbackButton({ game }: FeedbackButtonProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("feedbackAria")}
        className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-all hover:border-primary hover:text-primary"
      >
        <FlagIcon size={16} />
        {t("feedback")}
      </button>
      {open && (
        <FeedbackDialog
          game={game}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function FeedbackDialog({
  game,
  onClose,
}: {
  game: GameDetail;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [type, setType] = useState<GameFeedbackType | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 打开时锁定 body 滚动
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleSubmit = async () => {
    if (!type) {
      showToast(t("feedbackRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitGameFeedback(game.slug, {
        type,
        note: note.trim() || undefined,
      });
      onClose();
      if (res.alreadyReported) {
        showToast(t("feedbackAlreadyReported"));
      } else {
        showToast(t("feedbackSubmitted"), t("feedbackSubmittedSub"));
      }
    } catch {
      showToast(t("feedbackSubmitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const options: Array<{
    value: GameFeedbackType;
    title: string;
    desc: string;
  }> = [
    {
      value: "not_playable",
      title: t("feedbackTypeNotPlayable"),
      desc: t("feedbackTypeNotPlayableDesc"),
    },
    {
      value: "wrong_language",
      title: t("feedbackTypeWrongLang"),
      desc: t("feedbackTypeWrongLangDesc"),
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("feedbackDialogTitle")}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold">{t("feedbackDialogTitle")}</h2>
          <p className="mt-0.5 text-sm text-muted">{t("feedbackDialogSub")}</p>
        </div>

        <div className="space-y-3 px-5 py-4">
          {options.map((opt) => {
            const active = type === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                aria-pressed={active}
                className={`w-full rounded-xl border p-3 text-left transition-all ${
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <span className="block text-sm font-semibold">{opt.title}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {opt.desc}
                </span>
              </button>
            );
          })}

          <p className="text-xs text-muted">{t("feedbackLangHint")}</p>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={t("feedbackNotePlaceholder")}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full border border-border px-4 py-2 text-sm text-muted transition-all hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {t("feedbackCancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "…" : t("feedbackSubmit")}
          </button>
        </div>
      </div>
    </div>
  );
}

function FlagIcon({ size = 16 }: { size?: number }) {
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
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}