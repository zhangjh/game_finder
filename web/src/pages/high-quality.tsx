import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { fetchGames } from "../api";
import { GameCard } from "../components/game-card";
import type { GameListItem } from "@game-finder/shared";

/** 源站原始质量分阈值：只展示 quality_score > 该值的精品 */
const MIN_QUALITY = 0.8;

const PAGE_SIZE = 24;

/**
 * 高品质精选：源站原始质量分 > 0.9 的游戏，按质量分从高到低分页浏览。
 */
export function HighQualityPage() {
  const [sp] = useSearchParams();
  const [games, setGames] = useState<GameListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const page = Number(sp.get("page") ?? "1") || 1;

  useEffect(() => {
    setLoading(true);
    fetchGames({
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
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">高品质精选</h1>
          <p className="mt-1 text-sm text-muted">
            质量分 &gt; {Math.round(MIN_QUALITY * 100)}的精品，按分数高到低
          </p>
        </div>
        <Link
          to="/games"
          className="text-sm text-muted transition-colors hover:text-primary"
        >
          全部游戏 →
        </Link>
      </div>

      <p className="mt-4 text-sm text-muted">
        {loading
          ? "加载中…"
          : `共 ${total.toLocaleString()} 款${totalPages > 1 ? ` · 第 ${page}/${totalPages} 页` : ""}`}
      </p>

      {error ? (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center text-muted">
          加载失败：{error}
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
            暂未发现 {Math.round(MIN_QUALITY * 100)}
            分以上的游戏，等下次采集同步后回来看看
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
              上一页
            </Link>
          )}
          {page < totalPages && (
            <Link
              to={`/high-quality?page=${page + 1}`}
              className="rounded-full border border-border px-4 py-2 transition-colors hover:border-primary hover:text-primary"
            >
              下一页
            </Link>
          )}
        </nav>
      ) : null}
    </div>
  );
}