import { Link } from "react-router";

import { GameCard } from "../components/game-card";
import { Seo } from "../components/seo";
import { useI18n } from "../i18n";
import { useFavorites } from "../hooks/use-favorites";

export function FavoritesPage() {
  const { list } = useFavorites();
  const { t } = useI18n();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Seo
        title={t("favSeoTitle")}
        description={t("favSeoDesc")}
        path="/favorites"
        noIndex
      />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("favTitle")}</h1>
        {list.length > 0 && (
          <span className="text-sm text-muted">
            {t("favCount", { n: list.length })}
          </span>
        )}
      </div>

      {/* 本地存储提示 */}
      {list.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-surface p-4 text-sm text-muted">
          <span className="shrink-0 text-base">💡</span>
          <p>{t("favLocalHint")}</p>
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
          <p className="text-muted">{t("favEmptyTitle")}</p>
          <p className="text-sm text-muted">{t("favEmptyHint")}</p>
          <Link
            to="/games"
            className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t("favDiscover")}
          </Link>
        </div>
      )}
    </div>
  );
}
