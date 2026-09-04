import { useEffect, useState } from "react";
import { Link } from "react-router";

import { fetchGames, fetchRecommendation } from "../api";
import { GameCard } from "../components/game-card";
import { RecommendResults } from "../components/recommend-results";
import type { GameListItem, RecommendResponse } from "@game-finder/shared";

/** 快捷 chips（PRD §20.1）：预定义 intent 走 API，不走 LLM */
const QUICK_FILTERS = [
  { id: "5min", icon: "⚡", label: "5分钟" },
  { id: "relax", icon: "😌", label: "放松" },
  { id: "brain", icon: "🧠", label: "烧脑" },
  { id: "2p", icon: "👥", label: "双人" },
  { id: "mobile", icon: "📱", label: "手机" },
  { id: "random", icon: "🎲", label: "随便来一个" },
];

const CATEGORIES = [
  { label: "休闲", href: "/games?genre=休闲" },
  { label: "塔防", href: "/games?genre=塔防" },
  { label: "Roguelike", href: "/games?genre=Roguelike" },
  { label: "解谜", href: "/games?genre=解谜" },
  { label: "双人", href: "/games?players=2" },
];

export function HomePage() {
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
      fetchGames({ sort: "score", pageSize: 4 }),
      fetchGames({ sort: "popular", pageSize: 4 }),
      fetchGames({ sort: "newest", pageSize: 4 }),
    ])
      .then(([a, b, c]) => {
        setToday(a.items);
        setHot(b.items);
        setNewest(c.items);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "加载失败"),
      );
  }, []);

  /** 统一推荐入口：自然语言 / 快捷条件 */
  async function runRecommend(body: { input?: string; quick?: string }) {
    setRecommending(true);
    setRecommendError(null);
    // 已有结果时清掉旧结果，避免闪烁错位
    setResult(null);
    try {
      const res = await fetchRecommendation(body);
      setResult(res);
      // 滚动到结果区
      requestAnimationFrame(() => {
        document
          .getElementById("finder-result")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (e: unknown) {
      setRecommendError(e instanceof Error ? e.message : "推荐失败");
    } finally {
      setRecommending(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* ===== AI Game Finder（首页第一核心，PRD §20/§32）===== */}
      <section className="rounded-2xl bg-gradient-to-br from-primary/15 via-surface to-surface p-6 sm:p-10">
        <h1 className="text-center text-2xl font-bold sm:text-3xl">
          今天想玩什么？
        </h1>
        <p className="mt-2 text-center text-sm text-muted sm:text-base">
          告诉我你的时间和状态，AI 帮你从海量网页游戏里找到最合适的。
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
            placeholder="我只有10分钟，想玩轻松一点的"
            className="flex-1 rounded-full border border-border bg-surface px-5 py-3 text-sm outline-none transition-colors focus:border-primary"
          />
          <button
            type="submit"
            disabled={recommending || !query.trim()}
            className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {recommending ? "AI 挑选中…" : "帮我找游戏"}
          </button>
        </form>

        <ul className="mt-4 flex flex-wrap justify-center gap-2">
          {QUICK_FILTERS.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                disabled={recommending}
                onClick={() => void runRecommend({ quick: f.id })}
                className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {f.icon} {f.label}
              </button>
            </li>
          ))}
        </ul>

        {/* 推荐结果 / 加载 / 错误 */}
        <div id="finder-result">
          {recommending && (
            <div className="mt-8 animate-pulse rounded-xl border border-dashed border-border p-8 text-center text-muted">
              正在理解你的需求并挑选游戏…
            </div>
          )}
          {recommendError && (
            <div className="mt-8 rounded-xl border border-dashed border-red-300 p-6 text-center text-sm text-red-500">
              {recommendError}，请稍后再试
            </div>
          )}
          {result && !recommending && <RecommendResults result={result} />}
        </div>
      </section>

      {error ? (
        <div className="mt-10 rounded-xl border border-dashed border-border p-10 text-center text-muted">
          数据加载失败：{error}（请确认后端 API 已启动）
        </div>
      ) : (
        <>
          <Section
            title="今日推荐"
            more={{ label: "更多", href: "/games?sort=score" }}
            games={today}
          />
          <Section
            title="热门游戏"
            more={{ label: "全部热门", href: "/games?sort=popular" }}
            games={hot}
          />
          <Section
            title="最新游戏"
            more={{ label: "全部最新", href: "/games?sort=newest" }}
            games={newest}
          />
        </>
      )}

      {/* ===== 游戏分类 ===== */}
      <section className="mt-10">
        <h2 className="text-lg font-bold">游戏分类</h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {CATEGORIES.map((c) => (
            <li key={c.href}>
              <Link
                to={c.href}
                className="block rounded-xl border border-border bg-surface px-4 py-5 text-center font-medium transition-colors hover:border-primary hover:text-primary"
              >
                {c.label}
              </Link>
            </li>
          ))}
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
