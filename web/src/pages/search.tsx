import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { fetchGames } from "../api";
import { GameCard } from "../components/game-card";
import type { GameListItem } from "@game-finder/shared";

export function SearchPage() {
  const [sp] = useSearchParams();
  const q = (sp.get("q") ?? "").trim();

  const [results, setResults] = useState<GameListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = q
      ? `「${q}」搜索结果 | AI Game Discovery`
      : "搜索 | AI Game Discovery";
    if (!q) {
      setResults([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    fetchGames({ q })
      .then((res) => {
        setResults(res.items);
        setTotal(res.total);
        setError(null);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "加载失败"),
      )
      .finally(() => setLoading(false));
  }, [q]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-xl font-bold">
        {q ? (
          <>
            「{q}」的搜索结果
            <span className="ml-2 text-sm font-normal text-muted">
              {loading ? "搜索中…" : `${total} 款`}
            </span>
          </>
        ) : (
          "搜索游戏"
        )}
      </h1>

      {error ? (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center text-muted">
          搜索失败：{error}（请确认后端 API 已启动）
        </div>
      ) : null}

      {q && !loading && results.length === 0 && !error ? (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center text-muted">
          没有找到「{q}」相关游戏。试试其他关键词，或
          <Link to="/games" className="text-primary hover:underline">
            浏览全部游戏
          </Link>
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
