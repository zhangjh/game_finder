import { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router";

import { fetchGames } from "../api";
import { GameCard } from "../components/game-card";
import { Seo } from "../components/seo";
import { useI18n, type UiLang } from "../i18n";
import { NotFoundPage } from "./not-found";
import {
  SEO_LANDING_PAGES,
  getSeoLandingPage,
  sessionLabel,
  type GameListItem,
} from "@game-finder/shared";

const PAGE_SIZE = 24;

export function LandingPage() {
  const { landingSlug = "" } = useParams();
  const config = getSeoLandingPage(landingSlug);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t, lang } = useI18n();
  const [games, setGames] = useState<GameListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const sort = searchParams.get("sort");
  const selectedSort =
    sort === "popular" || sort === "newest" || sort === "score" ? sort : "score";

  useEffect(() => {
    if (!config) return;
    let active = true;
    setLoading(true);
    setGames([]);
    setTotal(0);
    setError(null);
    void fetchGames({
      ...config.filters,
      lang,
      sort: selectedSort,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        if (!active) return;
        setGames(result.items);
        setTotal(result.total);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "加载失败");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [config, lang, page, selectedSort]);

  if (!config) return <NotFoundPage />;

  // 界面语种 → 落地页文案（T1.7）：英文用 shared 内置的 en 版本
  const content = lang === "en" ? config.en : config;
  const { title, description, heading, intro, filterLabels, aiExplanation } =
    content;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const featured = games.slice(0, 4);
  const list = games.slice(4);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Seo
        title={title}
        description={description}
        path={config.path}
        noIndex={location.search.length > 0}
      />

      <header className="max-w-3xl">
        <p className="text-sm font-medium text-primary">{t("aiPicksBadge")}</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{heading}</h1>
        {intro.map((paragraph) => (
          <p key={paragraph} className="mt-3 leading-7 text-muted">{paragraph}</p>
        ))}
      </header>

      <section className="mt-6 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-semibold">{t("currentFilters")}</h2>
          {filterLabels.map((label) => (
            <span key={label} className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
              {label}
            </span>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{t("adjustSort")}</span>
          {[
            ["score", lang === "en" ? "Recommended" : "推荐"],
            ["popular", t("sortPopular")],
            ["newest", t("sortNewest")],
          ].map(([value, label]) => (
            <Link
              key={value}
              to={`${config.path}?sort=${value}`}
              className={`rounded-full border px-3 py-1 ${
                selectedSort === value
                  ? "border-primary text-primary"
                  : "border-border text-muted hover:border-primary"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-xl bg-primary/10 p-5">
        <h2 className="font-bold">{t("howAiPicks")}</h2>
        <p className="mt-2 leading-7 text-muted">{aiExplanation}</p>
      </section>

      {featured.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold">{t("featured")}</h2>
          <p className="mt-1 text-sm text-muted">{t("featuredHint")}</p>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {featured.map((game) => (
              <div key={game.id} className="flex flex-col gap-2">
                <GameCard game={game} />
                <p className="text-xs leading-5 text-muted">{recommendationReason(game, lang, t)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {(list.length > 0 || featured.length === 0) && (
        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold">{t("listTitle")}</h2>
              <p className="mt-1 text-sm text-muted">
                {loading
                  ? t("loading")
                  : t("countPaged", {
                      total: total.toLocaleString(),
                      page,
                      totalPages,
                    })}
              </p>
            </div>
            <Link to="/games" className="text-sm text-muted hover:text-primary">
              {t("allGamesArrow")}
            </Link>
          </div>
          {error ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-muted">
              {t("loadFailedWith", { error })}
            </div>
          ) : list.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {list.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          ) : !loading ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-muted">
              {t("landingEmpty")}
            </div>
          ) : null}
        </section>
      )}

      {totalPages > 1 && !loading && (
        <nav className="mt-6 flex justify-center gap-2 text-sm" aria-label={t("prevPage") + "/" + t("nextPage")}>
          {page > 1 && (
            <Link className="rounded-full border border-border px-4 py-2" to={`${config.path}?sort=${selectedSort}&page=${page - 1}`}>
              {t("prevPage")}
            </Link>
          )}
          {page < totalPages && (
            <Link className="rounded-full border border-border px-4 py-2" to={`${config.path}?sort=${selectedSort}&page=${page + 1}`}>
              {t("nextPage")}
            </Link>
          )}
        </nav>
      )}

      <section className="mt-10 border-t border-border pt-6">
        <h2 className="text-lg font-bold">{t("relatedNeeds")}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {config.relatedPaths.map((path) => {
            const related = SEO_LANDING_PAGES.find((pageConfig) => pageConfig.path === path);
            return related ? (
              <Link key={path} to={path} className="rounded-full border border-border px-4 py-2 text-sm hover:border-primary hover:text-primary">
                {lang === "en" ? related.en.heading : related.heading}
              </Link>
            ) : null;
          })}
        </div>
      </section>
    </div>
  );
}

function recommendationReason(
  game: GameListItem,
  lang: UiLang,
  t: (key: "recommendReason" | "reasonMobile" | "reasonDesktop", params?: Record<string, string | number>) => string,
): string {
  const duration = sessionLabel(game.sessionLengthMin, game.sessionLengthMax, lang);
  const device = game.mobile ? t("reasonMobile") : t("reasonDesktop");
  return t("recommendReason", { duration, device, difficulty: game.difficulty });
}
