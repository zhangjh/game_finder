import { useEffect, useRef } from "react";
import { Link } from "react-router";

import { trackEvent } from "../analytics/track";
import {
  parseJsonArray,
  ratingLabel,
  sessionLabel,
  type GameListItem,
} from "@game-finder/shared";

/**
 * 游戏卡片（PRD §23）：全站复用原子组件。
 * M6：IntersectionObserver 驱动 game_impression；click 上报 game_click。
 */
export function GameCard({
  game,
  context,
}: {
  game: GameListItem;
  /** 可选推荐上下文（recommendation_impression / click 时传入） */
  context?: { requestId?: number; rank?: number };
}) {
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
          alt={`${game.title}缩略图`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {score != null && (
          <span className="absolute top-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">
            ⭐ {score.toFixed(1)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="font-semibold leading-snug group-hover:text-primary">
          {game.title}
        </h3>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>
            ⏱ {sessionLabel(game.sessionLengthMin, game.sessionLengthMax)}
          </span>
          <span>🧠 {ratingLabel(game.difficulty)}</span>
          {game.multiplayer && <span>👥 {game.maxPlayers}人</span>}
          {game.mobile && <span>📱</span>}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
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
          立即玩
        </span>
      </div>
    </Link>
  );
}
