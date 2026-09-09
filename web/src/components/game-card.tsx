import { useEffect, useRef } from "react";
import { Link } from "react-router";

import { trackEvent } from "../analytics/track";
import { useI18n } from "../i18n";
import { FavoriteButton } from "./favorite-button";
import {
  displayTitle,
  parseJsonArray,
  ratingLabel,
  sessionLabel,
  type GameListItem,
} from "@game-finder/shared";

/** 是否含 CJK 字符（英文界面隐藏中文标签） */
function hasCJK(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

/**
 * 游戏卡片（PRD §23）：全站复用原子组件。
 * M6：IntersectionObserver 驱动 game_impression；click 上报 game_click。
 * T1.7：卡片文案与游戏名跟随界面语种（en 用原始英文名/时长/难度标签）。
 */
export function GameCard({
  game,
  context,
}: {
  game: GameListItem;
  /** 可选推荐上下文（recommendation_impression / click 时传入） */
  context?: { requestId?: number; rank?: number };
}) {
  const { t, lang } = useI18n();
  const tags = parseJsonArray(game.tags);
  const score = game.totalScore;
  const cardRef = useRef<HTMLAnchorElement>(null);

  // 用 ref 保存 context，避免父组件每次 render 传入新对象导致 observer 反复重建、
  // 从而重复触发 impression。
  const contextRef = useRef(context);
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  // IntersectionObserver：卡片进入视口 50% 持续 1s → game_impression
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer = setTimeout(() => {
            trackEvent({
              eventType: "game_impression",
              gameId: game.id,
              context: contextRef.current,
            });
          }, 1000);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [game.id]);

  const handleClick = () => {
    trackEvent({ eventType: "game_click", gameId: game.id, context });
  };

  // 英文界面隐藏中文标签（DB 标签为 AI 生成的中文）
  const visibleTags =
    lang === "en" ? tags.filter((tag) => !hasCJK(tag)) : tags;
  const title = displayTitle(game, lang);

  return (
    <Link
      ref={cardRef}
      to={`/game/${game.slug}`}
      onClick={handleClick}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-background">
        <img
          src={game.thumbnail ?? "/placeholder.svg"}
          alt={t("thumbnailAlt", { title })}
          loading="lazy"
          decoding="async"
          width={640}
          height={400}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <FavoriteButton game={game} variant="card" />
        {score != null && (
          <span className="absolute top-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">
            ⭐ {score.toFixed(1)}
          </span>
        )}
        {game.sourceQualityScore != null && (
          <span
            title={t("qualityBadge")}
            className="absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-xs font-medium text-white/90"
          >
            🏅 {Math.round(game.sourceQualityScore * 100)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="font-semibold leading-snug group-hover:text-primary">
          {title}
        </h3>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>
            ⏱{" "}
            {sessionLabel(
              game.sessionLengthMin,
              game.sessionLengthMax,
              lang,
            )}
          </span>
          <span>🧠 {ratingLabel(game.difficulty, lang)}</span>
          {game.multiplayer && (
            <span>👥 {t("nPlayers", { n: game.maxPlayers })}</span>
          )}
          {game.mobile && <span>📱</span>}
        </div>

        {visibleTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {visibleTags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-background px-2 py-0.5 text-xs text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <span className="mt-auto block rounded-lg bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground transition-opacity group-hover:opacity-90">
          {t("playNow")}
        </span>
      </div>
    </Link>
  );
}
