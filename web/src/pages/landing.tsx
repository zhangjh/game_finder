import { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router";

import { fetchGames } from "../api";
import { GameCard } from "../components/game-card";
import { Seo } from "../components/seo";
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
  }, [config, page, selectedSort]);

  if (!config) return <NotFoundPage />;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const featured = games.slice(0, 4);
  const list = games.slice(4);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Seo
        title={config.title}
        description={config.description}
        path={config.path}
        noIndex={location.search.length > 0}
      />

      <header className="max-w-3xl">
        <p className="text-sm font-medium text-primary">AI 场景选游</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{config.heading}</h1>
        {config.intro.map((paragraph) => (
          <p key={paragraph} className="mt-3 leading-7 text-muted">{paragraph}</p>
        ))}
      </header>

      <section className="mt-6 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-semibold">当前筛选</h2>
          {config.filterLabels.map((label) => (
            <span key={label} className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
              {label}
            </span>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">调整排序：</span>
          {[
            ["score", "推荐"],
            ["popular", "热门"],
            ["newest", "最新"],
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
        <h2 className="font-bold">AI 如何挑选</h2>
        <p className="mt-2 leading-7 text-muted">{config.aiExplanation}</p>
      </section>

      {featured.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold">优先推荐</h2>
          <p className="mt-1 text-sm text-muted">先满足场景硬条件，再比较体验画像与真实游玩反馈。</p>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {featured.map((game) => (
              <div key={game.id} className="flex flex-col gap-2">
                <GameCard game={game} />
                <p className="text-xs leading-5 text-muted">{recommendationReason(game)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {(list.length > 0 || featured.length === 0) && (
        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold">游戏列表</h2>
              <p className="mt-1 text-sm text-muted">
                {loading
                  ? "加载中…"
                  : `共 ${total.toLocaleString()} 款 · 第 ${page}/${totalPages} 页`}
              </p>
            </div>
            <Link to="/games" className="text-sm text-muted hover:text-primary">
              全部游戏 →
            </Link>
          </div>
          {error ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-muted">
              加载失败：{error}
            </div>
          ) : list.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {list.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          ) : !loading ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-muted">
              当前没有符合全部条件的已发布游戏，请稍后再来查看。
            </div>
          ) : null}
        </section>
      )}

      {totalPages > 1 && !loading && (
        <nav className="mt-6 flex justify-center gap-2 text-sm" aria-label="分页">
          {page > 1 && (
            <Link className="rounded-full border border-border px-4 py-2" to={`${config.path}?sort=${selectedSort}&page=${page - 1}`}>
              上一页
            </Link>
          )}
          {page < totalPages && (
            <Link className="rounded-full border border-border px-4 py-2" to={`${config.path}?sort=${selectedSort}&page=${page + 1}`}>
              下一页
            </Link>
          )}
        </nav>
      )}

      <section className="mt-10 border-t border-border pt-6">
        <h2 className="text-lg font-bold">相关游戏需求</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {config.relatedPaths.map((path) => {
            const related = SEO_LANDING_PAGES.find((pageConfig) => pageConfig.path === path);
            return related ? (
              <Link key={path} to={path} className="rounded-full border border-border px-4 py-2 text-sm hover:border-primary hover:text-primary">
                {related.heading}
              </Link>
            ) : null;
          })}
        </div>
      </section>
    </div>
  );
}

function recommendationReason(game: GameListItem): string {
  const duration = sessionLabel(game.sessionLengthMin, game.sessionLengthMax);
  const device = game.mobile ? "支持手机" : "适合电脑";
  return `推荐理由：${duration}，${device}，难度 ${game.difficulty}/5。`;
}
