import Link from "next/link";

import type { GameListItem } from "@/lib/games/queries";

/** 体验属性 → 中文标签（PRD §12 值域 1~5） */
export function ratingLabel(value: number): string {
  const labels = ["", "很简单", "简单", "普通", "困难", "很硬核"];
  return labels[value] ?? "普通";
}

export function sessionLabel(min?: number | null, max?: number | null): string {
  if (min == null || max == null) return "时长未知";
  return `${min}~${max}分钟`;
}

function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * 游戏卡片（PRD §23）：缩略图 / 名称 / 评分 / 时长 / 心情 / 难度 / 设备 / 立即玩。
 * 全站复用原子组件——首页、列表页、推荐结果、相似游戏均使用。
 */
export function GameCard({ game }: { game: GameListItem }) {
  const tags = parseJsonArray(game.tags);
  const score = game.totalScore;

  return (
    <Link
      href={`/game/${game.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      {/* 缩略图 */}
      <div className="relative aspect-[16/10] overflow-hidden bg-background">
        {/* eslint-disable-next-line @next/next/no-img-element -- M3 接入真实图源后再迁移 next/image 域名配置 */}
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

      {/* 信息区 */}
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
