import type { Metadata } from "next";

import { GameCard } from "@/components/games/game-card";
import { mockGames } from "@/lib/games/mock-data";

export const metadata: Metadata = {
  title: "搜索",
  description: "搜索网页游戏，或直接描述你的需求。",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const sp = await searchParams;
  const raw = sp.q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

  // M1：简单的标题/标签/描述包含匹配；M5 起接入 FTS + AI Intent 双路
  const results = q
    ? mockGames.filter((g) =>
        [g.title, g.titleOriginal, g.description, ...g.tags, g.genre]
          .join("\n")
          .toLowerCase()
          .includes(q.toLowerCase()),
      )
    : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-xl font-bold">
        {q ? (
          <>
            「{q}」的搜索结果
            <span className="ml-2 text-sm font-normal text-muted">
              {results.length} 款
            </span>
          </>
        ) : (
          "搜索游戏"
        )}
      </h1>

      <form action="/search" className="mt-4 flex gap-3">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="游戏名、玩法关键词，或描述你的需求…"
          className="flex-1 rounded-full border border-border bg-surface px-5 py-2.5 text-sm outline-none transition-colors focus:border-primary"
        />
        <button
          type="submit"
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          搜索
        </button>
      </form>

      {q && results.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center text-muted">
          没有找到「{q}」相关游戏。试试其他关键词，或
          <a href="/games" className="text-primary hover:underline">
            浏览全部游戏
          </a>
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {results.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      ) : null}

      {!q ? (
        <p className="mt-8 text-center text-sm text-muted">
          提示：M5 版本起，你可以直接输入「我只有10分钟，想玩轻松的」这类自然语言需求
        </p>
      ) : null}
    </div>
  );
}
