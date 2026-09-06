/**
 * 收藏按钮：可复用于详情页和卡片。
 *
 * 两种模式：
 * - "detail"：文字按钮，用于详情页标题旁
 * - "card"：浮层圆形图标，用于卡片缩略图左上角
 */
import { useFavorites } from "../hooks/use-favorites";
import { useToast } from "./toast";
import { trackEvent } from "../analytics/track";
import type { GameDetail, GameListItem } from "@game-finder/shared";

type FavoriteButtonProps = {
  game: GameDetail | GameListItem;
  variant: "detail" | "card";
};

export function FavoriteButton({ game, variant }: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const { showToast } = useToast();
  const favorited = isFavorite(game.id);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { added } = toggleFavorite(game);
    trackEvent({
      eventType: "favorite",
      gameId: game.id,
      context: { action: added ? "add" : "remove" },
    });
    if (added) {
      showToast("已收藏", "收藏仅保存在当前浏览器，清理缓存或换设备后会丢失");
    } else {
      showToast("已取消收藏");
    }
  };

  if (variant === "card") {
    return (
      <button
        type="button"
        onClick={handleToggle}
        aria-label={favorited ? "取消收藏" : "收藏"}
        className={`absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full backdrop-blur transition-all ${
          favorited
            ? "bg-primary text-primary-foreground"
            : "bg-black/50 text-white hover:bg-black/70"
        }`}
      >
        <HeartIcon filled={favorited} size={16} />
      </button>
    );
  }

  // detail variant
  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
        favorited
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted hover:border-primary hover:text-primary"
      }`}
    >
      <HeartIcon filled={favorited} size={16} />
      {favorited ? "已收藏" : "收藏"}
    </button>
  );
}

function HeartIcon({ filled, size = 16 }: { filled: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
    </svg>
  );
}
