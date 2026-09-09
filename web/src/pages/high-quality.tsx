import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { fetchGames } from "../api";
import { GameCard } from "../components/game-card";
import { Seo } from "../components/seo";
import { useI18n } from "../i18n";
import type { GameListItem } from "@game-finder/shared";

/** 源站原始质量分阈值：只展示 quality_score > 该值的精品 */
const MIN_QUALITY = 0.8;

const PAGE_SIZE = 24;

/**
 * 高品质精选：源站原始质量分 > 0.8 的游戏，按质量分从高到低分页浏览。
 */
export function HighQualityPage() {
  const [sp] = useSearchParams();
  const { t, lang } = useI18n();
  const [games, setGames] = useState<GameListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const page = Number(sp.get("page") ?? "1") || 1;

  useEffect(() => {
    setLoading(true);
    fetchGames({
      lang,
      minQualityScore: MIN_QUALITY,
      sort: "quality",
      page,
      pageSize: PAGE_SIZE,
    })
      .then((res) => {
        setGames(res.items);
        setTotal(res.total);
        setError(null);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "加载失败"),
      )
      .finally(() => setLoading(false));
  }, [lang, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Seo
        title={t("hqSeoTitle")}
        description={t("hqSeoDesc")}
        path="/high-quality"
        noIndex={sp.size > 0}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t("hqTitle")}</h1>
          <p className="mt-1 text-sm text-muted">
            {t("hqHint", { n: Math.round(MIN_QUALITY * 100) })}
          </p>
        </div>
        <Link
          to="/games"
          className="text-sm text-muted transition-colors hover:text-primary"
        >
          {t("allGamesArrow")}
        </Link>
      </div>

      <p className="mt-4 text-sm text-muted">
        {loading
          ? t("loading")
          : totalPages > 1
            ? t("hqCountPaged", {
                total: total.toLocaleString(),
                page,
                totalPages,
              })
            : t("hqCount", { total: total.toLocaleString() })}
      </p>

      {error ? (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center text-muted">
          {t("loadFailedWith", { error })}
        </div>
      ) : games.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {games.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      ) : (
        !loading && (
          <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center text-muted">
            {t("hqEmpty", { n: Math.round(MIN_QUALITY * 100) })}
          </div>
        )
      )}

      {totalPages > 1 && !loading ? (
        <nav className="mt-6 flex justify-center gap-2 text-sm">
          {page > 1 && (
            <Link
              to={`/high-quality?page=${page - 1}`}
              className="rounded-full border border-border px-4 py-2 transition-colors hover:border-primary hover:text-primary"
            >
              {t("prevPage")}
            </Link>
          )}
          {page < totalPages && (
            <Link
              to={`/high-quality?page=${page + 1}`}
              className="rounded-full border border-border px-4 py-2 transition-colors hover:border-primary hover:text-primary"
            >
              {t("nextPage")}
            </Link>
          )}
        </nav>
      ) : null}
    </div>
  );
}
