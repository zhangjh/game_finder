import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { fetchGames } from "../api";
import { GameCard } from "../components/game-card";
import type { GameListItem } from "@game-finder/shared";

const GENRES = ["休闲", "塔防", "Roguelike", "解谜", "对战"];
const DURATIONS = [
  { value: "5", label: "5分钟内" },
  { value: "10", label: "10分钟内" },
  { value: "30", label: "30分钟内" },
];
const PLAYERS = [
  { value: "1", label: "单人" },
  { value: "2", label: "双人" },
  { value: "multi", label: "多人" },
];
const PLATFORMS = [
  { value: "mobile", label: "手机" },
  { value: "desktop", label: "电脑" },
];
const SORTS = [
  { value: "popular", label: "热门" },
  { value: "newest", label: "最新" },
  { value: "score", label: "评分" },
];

const PAGE_SIZE = 24;

export function GamesPage() {
  const [sp, setSp] = useSearchParams();
  const [games, setGames] = useState<GameListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const genre = sp.get("genre") ?? "";
  const duration = sp.get("duration") ?? "";
  const players = sp.get("players") ?? "";
  const platform = sp.get("platform") ?? "";
  const sort = sp.get("sort") ?? "popular";
  const page = Number(sp.get("page") ?? "1") || 1;

  useEffect(() => {
    setLoading(true);
    fetchGames({
      genre: genre || undefined,
      duration: duration ? Number(duration) : undefined,
      players:
        players === "multi" ? "multi" : players ? Number(players) : undefined,
      platform:
        platform === "mobile" || platform === "desktop"
          ? platform
          : undefined,
      sort: sort as "popular" | "newest" | "score",
      page,
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
  }, [genre, duration, players, platform, sort, page]);

  /** 更新单个查询参数（重置页码） */
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(sp);
    next.delete("page");
    if (value) next.set(key, value);
    else next.delete(key);
    setSp(next, { replace: false });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">全部游戏</h1>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">排序：</span>
          {SORTS.map((s) => (
            <Link
              key={s.value}
              to={`/games?${buildQuery(sp, "sort", s.value)}`}
              className={`rounded-full px-3 py-1 transition-colors ${
                sort === s.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {/* 筛选区 */}
      <div className="mt-4 space-y-3 rounded-xl border border-border bg-surface p-4 text-sm">
        <FilterRow label="分类">
          {GENRES.map((g) => (
            <Chip
              key={g}
              label={g}
              active={genre === g}
              onClick={() => setParam("genre", genre === g ? "" : g)}
            />
          ))}
        </FilterRow>
        <FilterRow label="时长">
          {DURATIONS.map((d) => (
            <Chip
              key={d.value}
              label={d.label}
              active={duration === d.value}
              onClick={() =>
                setParam("duration", duration === d.value ? "" : d.value)
              }
            />
          ))}
        </FilterRow>
        <FilterRow label="人数">
          {PLAYERS.map((p) => (
            <Chip
              key={p.value}
              label={p.label}
              active={players === p.value}
              onClick={() =>
                setParam("players", players === p.value ? "" : p.value)
              }
            />
          ))}
        </FilterRow>
        <FilterRow label="设备">
          {PLATFORMS.map((p) => (
            <Chip
              key={p.value}
              label={p.label}
              active={platform === p.value}
              onClick={() =>
                setParam("platform", platform === p.value ? "" : p.value)
              }
            />
          ))}
        </FilterRow>
      </div>

      {/* 结果 */}
      <p className="mt-4 text-sm text-muted">
        {loading
          ? "加载中…"
          : `共 ${total} 款游戏${totalPages > 1 ? ` · 第 ${page}/${totalPages} 页` : ""}`}
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
            没有符合条件的游戏，试试放宽筛选条件
          </div>
        )
      )}

      {/* 分页 */}
      {totalPages > 1 && !loading ? (
        <nav className="mt-6 flex justify-center gap-2 text-sm">
          {page > 1 && (
            <Link
              to={`/games?${buildQuery(sp, "page", String(page - 1))}`}
              className="rounded-full border border-border px-4 py-2 transition-colors hover:border-primary hover:text-primary"
            >
              上一页
            </Link>
          )}
          {page < totalPages && (
            <Link
              to={`/games?${buildQuery(sp, "page", String(page + 1))}`}
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

function buildQuery(
  sp: URLSearchParams,
  key: string,
  value: string,
): string {
  const next = new URLSearchParams(sp);
  if (key !== "page") next.delete("page");
  next.set(key, value);
  return next.toString();
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 shrink-0 text-muted">{label}</span>
      <div className="flex flex-wrap gap-2">
        {children}
      </div>
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted hover:border-primary hover:text-primary"
      }`}
    >
      {label}
    </button>
  );
}
