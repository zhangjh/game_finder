import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { fetchGames } from "../api";
import { GameCard } from "../components/game-card";
import type { GameListItem } from "@game-finder/shared";

const QUICK_FILTERS = [
  { icon: "⚡", label: "5分钟", href: "/games?duration=5" },
  { icon: "😌", label: "放松", href: "/games?mood=relaxing" },
  { icon: "🧠", label: "烧脑", href: "/games?mood=brain_burn" },
  { icon: "👥", label: "双人", href: "/games?players=2" },
  { icon: "📱", label: "手机", href: "/games?platform=mobile" },
  { icon: "🎲", label: "随便来一个", href: "/games?sort=random" },
];

const CATEGORIES = [
  { label: "休闲", href: "/games?genre=休闲" },
  { label: "塔防", href: "/games?genre=塔防" },
  { label: "Roguelike", href: "/games?genre=Roguelike" },
  { label: "解谜", href: "/games?genre=解谜" },
  { label: "双人", href: "/games?players=2" },
];

export function HomePage() {
  const navigate = useNavigate();
  const [today, setToday] = useState<GameListItem[]>([]);
  const [hot, setHot] = useState<GameListItem[]>([]);
  const [newest, setNewest] = useState<GameListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* ===== AI Game Finder（首页第一核心，PRD §32）===== */}
      <section className="rounded-2xl bg-gradient-to-br from-primary/15 via-surface to-surface p-6 sm:p-10">
        <h1 className="text-center text-2xl font-bold sm:text-3xl">
          今天想玩什么？
        </h1>
        <p className="mt-2 text-center text-sm text-muted sm:text-base">
          告诉我你的时间和状态，AI 帮你从海量网页游戏里找到最合适的。
        </p>

        {/* M5 上线前的占位表单：提交后跳转列表页 */}
        <form
          className="mx-auto mt-6 flex max-w-2xl flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const q = new FormData(e.currentTarget).get("q");
            if (typeof q === "string" && q.trim()) {
              navigate(`/search?q=${encodeURIComponent(q.trim())}`);
            }
          }}
        >
          <input
            name="q"
            type="search"
            placeholder="我只有10分钟，想玩轻松一点的"
            className="flex-1 rounded-full border border-border bg-surface px-5 py-3 text-sm outline-none transition-colors focus:border-primary"
          />
          <button
            type="submit"
            className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            帮我找游戏
          </button>
        </form>

        <ul className="mt-4 flex flex-wrap justify-center gap-2">
          {QUICK_FILTERS.map((f) => (
            <li key={f.label}>
              <Link
                to={f.href}
                className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm transition-colors hover:border-primary hover:text-primary"
              >
                {f.icon} {f.label}
              </Link>
            </li>
          ))}
        </ul>
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
