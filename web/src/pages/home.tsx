import { useEffect, useState } from "react";
import { Link } from "react-router";

import { fetchGames, fetchRecommendation } from "../api";
import { GameCard } from "../components/game-card";
import { RecommendResults } from "../components/recommend-results";
import { Seo } from "../components/seo";
import { useI18n } from "../i18n";
import { QUICK_CONDITIONS, genreLabel, type GameListItem, type RecommendResponse } from "@game-finder/shared";

/** 分类入口：genre 链接值保持 DB 中文值，仅翻译展示 */
const CATEGORIES = [
  { genre: "休闲", key: "catCasual" },
  { genre: "塔防", key: "catTowerDefense" },
  { genre: "Roguelike", key: "catRoguelike" },
  { genre: "解谜", key: "catPuzzle" },
] as const;

export function HomePage() {
  const { t, lang } = useI18n();
  const [today, setToday] = useState<GameListItem[]>([]);
  const [hot, setHot] = useState<GameListItem[]>([]);
  const [newest, setNewest] = useState<GameListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  /* ===== AI Finder 状态（M5，PRD §20）===== */
  const [query, setQuery] = useState("");
  const [recommending, setRecommending] = useState(false);
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendResponse | null>(null);

  useEffect(() => {
    Promise.all([
      fetchGames({ lang, sort: "score", pageSize: 4 }),
      fetchGames({ lang, sort: "popular", pageSize: 4 }),
      fetchGames({ lang, sort: "newest", pageSize: 4 }),
    ])
      .then(([a, b, c]) => {
        setToday(a.items);
        setHot(b.items);
        setNewest(c.items);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
  }, [lang]);

  /** 统一推荐入口：自然语言 / 快捷条件 */
  async function runRecommend(body: { input?: string; quick?: string }) {
    setRecommending(true);
    setRecommendError(null);
    // 已有结果时清掉旧结果，避免闪烁错位
    setResult(null);
    try {
      const res = await fetchRecommendation({ ...body, lang });
      setResult(res);
      // 滚动到结果区
      requestAnimationFrame(() => {
        document
          .getElementById("finder-result")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (e: unknown) {
      setRecommendError(
        e instanceof Error ? e.message : t("recommendFailed"),
      );
    } finally {
      setRecommending(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Seo
        title={t("homeSeoTitle")}
        description={t("homeSeoDesc")}
        path="/"
      />
      {/* ===== AI Game Finder（首页第一核心，PRD §20/§32）===== */}
      <section className="rounded-2xl bg-gradient-to-br from-primary/15 via-surface to-surface p-6 sm:p-10">
        <h1 className="text-center text-2xl font-bold sm:text-3xl">
          {t("heroTitle")}
        </h1>
        <p className="mt-2 text-center text-sm text-muted sm:text-base">
          {t("heroSub")}
        </p>

        <form
          className="mx-auto mt-6 flex max-w-2xl flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const q = query.trim();
            if (q) void runRecommend({ input: q });
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            placeholder={t("inputPlaceholder")}
            className="flex-1 rounded-full border border-border bg-surface px-5 py-3 text-sm outline-none transition-colors focus:border-primary"
          />
          <button
            type="submit"
            disabled={recommending || !query.trim()}
            className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {recommending ? t("aiPicking") : t("findGames")}
          </button>
        </form>

        <ul className="mt-4 flex flex-wrap justify-center gap-2">
          {QUICK_CONDITIONS.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                disabled={recommending}
                onClick={() => void runRecommend({ quick: f.id })}
                className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {f.icon} {lang === "en" ? f.labelEn : f.label}
              </button>
            </li>
          ))}
        </ul>

        {/* 推荐结果 / 加载 / 错误 */}
        <div id="finder-result">
          {recommending && (
            <div className="mt-8 animate-pulse rounded-xl border border-dashed border-border p-8 text-center text-muted">
              {t("recommending")}
            </div>
          )}
          {recommendError && (
            <div className="mt-8 rounded-xl border border-dashed border-red-300 p-6 text-center text-sm text-red-500">
              {recommendError}
              {t("tryLaterSuffix")}
            </div>
          )}
          {result && !recommending && <RecommendResults result={result} />}
        </div>
      </section>

      {error ? (
        <div className="mt-10 rounded-xl border border-dashed border-border p-10 text-center text-muted">
          {t("dataLoadFailed", { error })}
        </div>
      ) : (
        <>
          <Section
            title={t("todayPicks")}
            more={{ label: t("more"), href: "/games?sort=score" }}
            games={today}
          />
          <Section
            title={t("hotGames")}
            more={{ label: t("allHot"), href: "/games?sort=popular" }}
            games={hot}
          />
          <Section
            title={t("newestGames")}
            more={{ label: t("allNew"), href: "/games?sort=newest" }}
            games={newest}
          />
        </>
      )}

      {/* ===== 游戏分类 ===== */}
      <section className="mt-10">
        <h2 className="text-lg font-bold">{t("categories")}</h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {CATEGORIES.map((c) => (
            <li key={c.genre}>
              <Link
                to={`/games?genre=${encodeURIComponent(c.genre)}`}
                className="block rounded-xl border border-border bg-surface px-4 py-5 text-center font-medium transition-colors hover:border-primary hover:text-primary"
              >
                {genreLabel(c.genre, lang)}
              </Link>
            </li>
          ))}
          <li>
            <Link
              to="/games?players=2"
              className="block rounded-xl border border-border bg-surface px-4 py-5 text-center font-medium transition-colors hover:border-primary hover:text-primary"
            >
              {t("cat2p")}
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}

function Section({
  title,
  more,
  games,
}: {
  title: string;
  more: { label: string; href: string };
  games: GameListItem[];
}) {
  if (games.length === 0) return null;
  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        <Link to={more.href} className="text-sm text-muted hover:text-primary">
          {more.label} →
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {games.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </div>
    </section>
  );
}
