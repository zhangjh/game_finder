import { Link } from "react-router";

import {
  parseJsonArray,
  ratingLabel,
  sessionLabel,
  type GameListItem,
} from "@game-finder/shared";

/** 游戏卡片（PRD §23）：全站复用原子组件 */
export function GameCard({ game }: { game: GameListItem }) {
  const tags = parseJsonArray(game.tags);
  const score = game.totalScore;

  return (
    <Link
      to={`/game/${game.slug}`}
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
