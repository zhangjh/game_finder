import type { Metadata } from "next";
import Link from "next/link";

import { GameCard } from "@/components/games/game-card";
import {
  getNewestGames,
  getTopGames,
  listGames,
} from "@/lib/games/queries";

export const metadata: Metadata = {
  description:
    "告诉 AI 你现在想怎么玩，它帮你从海量网页游戏中找到最适合你的游戏。",
};

/**
 * 快捷条件 chips（PRD §21）。M5 接入 AI Finder 后直接映射为预定义 GameIntent，
 * 不走 LLM（省成本、零延迟）。
 */
const quickFilters = [
  { icon: "⚡", label: "5分钟", href: "/games?duration=5" },
  { icon: "😌", label: "放松", href: "/games?mood=relaxing" },
  { icon: "🧠", label: "烧脑", href: "/games?mood=brain_burn" },
  { icon: "👥", label: "双人", href: "/games?players=2" },
  { icon: "📱", label: "手机", href: "/games?platform=mobile" },
  { icon: "🎲", label: "随便来一个", href: "/games?sort=random" },
];

const categories = [
  { label: "休闲", href: "/games?genre=休闲" },
  { label: "塔防", href: "/games?genre=塔防" },
  { label: "Roguelike", href: "/games?genre=Roguelike" },
  { label: "解谜", href: "/games?genre=解谜" },
  { label: "双人", href: "/games?players=2" },
];

export default async function HomePage() {
  const [today, hot, newest] = await Promise.all([
    listGames({ sort: "score", pageSize: 4 }),
    getTopGames(4),
    getNewestGames(4),
  ]);

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
        <form action="/games" className="mx-auto mt-6 max-w-2xl">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="search"
              name="q"
              placeholder="我只有10分钟，想玩轻松一点的"
              className="flex-1 rounded-full border border-border bg-surface px-5 py-3 text-sm outline-none transition-colors focus:border-primary"
            />
            <button
              type="submit"
              className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              帮我找游戏
            </button>
          </div>
        </form>

        {/* 快捷条件 */}
        <ul className="mt-4 flex flex-wrap justify-center gap-2">
          {quickFilters.map((f) => (
            <li key={f.label}>
              <Link
                href={f.href}
                className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm transition-colors hover:border-primary hover:text-primary"
              >
                {f.icon} {f.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ===== 今日推荐（评分最高，M5 起由推荐 Pipeline 驱动）===== */}
      <GameSection
        title="今日推荐"
        more={{ label: "更多", href: "/games?sort=score" }}
        games={today.items}
      />

      {/* ===== 热门游戏 ===== */}
      <GameSection
        title="热门游戏"
        more={{ label: "全部热门", href: "/games?sort=popular" }}
        games={hot.items}
      />

      {/* ===== 最新游戏 ===== */}
      <GameSection
        title="最新游戏"
        more={{ label: "全部最新", href: "/games?sort=newest" }}
        games={newest.items}
      />

      {/* ===== 游戏分类 ===== */}
      <section className="mt-10">
        <h2 className="text-lg font-bold">游戏分类</h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {categories.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
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

function GameSection({
  title,
  more,
  games,
}: {
  title: string;
  more: { label: string; href: string };
  games: Awaited<ReturnType<typeof listGames>>["items"];
}) {
  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        <Link href={more.href} className="text-sm text-muted hover:text-primary">
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
