import { Link } from "react-router";

import { GameCard } from "../components/game-card";
import { Seo } from "../components/seo";
import { useFavorites } from "../hooks/use-favorites";

export function FavoritesPage() {
  const { list } = useFavorites();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Seo
        title="我的收藏 | 玩什么 PlayWhat"
        description="查看保存在当前浏览器中的游戏收藏。"
        path="/favorites"
        noIndex
      />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">我的收藏</h1>
        {list.length > 0 && (
          <span className="text-sm text-muted">{list.length} 款游戏</span>
        )}
      </div>

      {/* 本地存储提示 */}
      {list.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-surface p-4 text-sm text-muted">
          <span className="shrink-0 text-base">💡</span>
          <p>
            收藏数据保存在当前浏览器本地，清除浏览器缓存、使用无痕模式或更换设备后收藏将丢失。
            未来上线账号体系后可跨设备同步。
          </p>
        </div>
      )}

      {/* 收藏列表 */}
      {list.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {list.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center gap-4 rounded-xl border border-dashed border-border p-16 text-center">
          <div className="text-5xl">💔</div>
          <p className="text-muted">还没有收藏任何游戏</p>
          <p className="text-sm text-muted">
            在游戏中找到喜欢的，点一下心形按钮就能收藏到这里
          </p>
          <Link
            to="/games"
            className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            去发现游戏
          </Link>
        </div>
      )}
    </div>
  );
}
