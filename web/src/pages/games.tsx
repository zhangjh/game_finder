import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { fetchGames } from "../api";
import { GameCard } from "../components/game-card";
import { Seo } from "../components/seo";
import { useI18n } from "../i18n";
import { genreLabel, type GameListItem } from "@game-finder/shared";

/** 筛选值恒为 DB 中文 genre 值（服务端按中文值过滤），label 跟随界面语种 */
const GENRES = ["休闲", "塔防", "Roguelike", "解谜", "对战"];
const DURATIONS = ["5", "10", "30"];
const PLAYERS = ["1", "2", "multi"];
const PLATFORMS = ["mobile", "desktop"];
const SORTS = ["popular", "newest", "score"] as const;

const PAGE_SIZE = 24;

export function GamesPage() {
  const { t, lang } = useI18n();
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
      lang,
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
        setError(e instanceof Error ? e.message : t("loadFailed")),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, genre, duration, players, platform, sort, page]);

  /** 更新单个查询参数（重置页码） */
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(sp);
    next.delete("page");
    if (value) next.set(key, value);
    else next.delete(key);
    setSp(next, { replace: false });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const durationLabel = (value: string) => t("withinMin", { n: value });
  const playersLabel = (value: string) =>
    value === "1"
      ? t("singlePlayer")
      : value === "2"
        ? t("twoPlayer")
        : t("multiPlayer");
  const platformLabel = (value: string) =>
    value === "mobile" ? t("mobile") : t("desktop");
  const sortLabel = (value: string) =>
    value === "popular"
      ? t("sortPopular")
      : value === "newest"
        ? t("sortNewest")
        : t("sortScore");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Seo
        title={t("gamesSeoTitle")}
        description={t("gamesSeoDesc")}
        path="/games"
        noIndex={sp.size > 0}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t("allGames")}</h1>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">{t("sortBy")}</span>
          {SORTS.map((s) => (
            <Link
              key={s}
              to={`/games?${buildQuery(sp, "sort", s)}`}
              className={`rounded-full px-3 py-1 transition-colors ${
                sort === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {sortLabel(s)}
            </Link>
          ))}
        </div>
      </div>

      {/* 筛选区 */}
      <div className="mt-4 space-y-3 rounded-xl border border-border bg-surface p-4 text-sm">
        <FilterRow label={t("filterGenre")}>
          {GENRES.map((g) => (
            <Chip
              key={g}
              label={genreLabel(g, lang)}
              active={genre === g}
              onClick={() => setParam("genre", genre === g ? "" : g)}
            />
          ))}
        </FilterRow>
        <FilterRow label={t("filterDuration")}>
          {DURATIONS.map((d) => (
            <Chip
              key={d}
              label={durationLabel(d)}
              active={duration === d}
              onClick={() =>
                setParam("duration", duration === d ? "" : d)
              }
            />
          ))}
        </FilterRow>
        <FilterRow label={t("filterPlayers")}>
          {PLAYERS.map((p) => (
            <Chip
              key={p}
              label={playersLabel(p)}
              active={players === p}
              onClick={() =>
                setParam("players", players === p ? "" : p)
              }
            />
          ))}
        </FilterRow>
        <FilterRow label={t("filterPlatform")}>
          {PLATFORMS.map((p) => (
            <Chip
              key={p}
              label={platformLabel(p)}
              active={platform === p}
              onClick={() =>
                setParam("platform", platform === p ? "" : p)
              }
            />
          ))}
        </FilterRow>
      </div>

      {/* 结果 */}
      <p className="mt-4 text-sm text-muted">
        {loading
          ? t("loading")
          : totalPages > 1
            ? t("countGamesPaged", { total, page, totalPages })
            : t("countGames", { total })}
      </p>

      {error ? (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center text-muted">
          {t("loadFailedWith", { error })}
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
            {t("noMatch")}
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
              {t("prevPage")}
            </Link>
          )}
          {page < totalPages && (
            <Link
              to={`/games?${buildQuery(sp, "page", String(page + 1))}`}
              className="rounded-full border border-border px-4 py-2 transition-colors hover:border-primary hover:text-primary"
            >
              {t("nextPage")}
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
