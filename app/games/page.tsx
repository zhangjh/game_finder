import type { Metadata } from "next";
import Link from "next/link";

import { GameCard } from "@/components/games/game-card";
import { mockGames, type GameCardData } from "@/lib/games/mock-data";

export const metadata: Metadata = {
  title: "全部游戏",
  description: "按分类、难度、时长、人数、设备筛选网页游戏。",
};

/** 筛选维度定义（PRD §33）——值与 mock 数据字段对齐，M2 起由 DB 枚举驱动 */
const GENRES = ["休闲", "塔防", "Roguelike", "解谜", "对战"] as const;
const DURATIONS = [
  { value: "5", label: "5分钟内" },
  { value: "10", label: "10分钟内" },
  { value: "30", label: "30分钟内" },
] as const;
const PLAYERS = [
  { value: "1", label: "单人" },
  { value: "2", label: "双人" },
  { value: "multi", label: "多人" },
] as const;
const PLATFORMS = [
  { value: "mobile", label: "手机" },
  { value: "desktop", label: "电脑" },
] as const;
const SORTS = [
  { value: "popular", label: "热门" },
  { value: "newest", label: "最新" },
  { value: "score", label: "评分" },
] as const;

type SearchParams = { [key: string]: string | string[] | undefined };

function pick(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function filterGames(sp: SearchParams): GameCardData[] {
  let games = [...mockGames];

  const genre = pick(sp, "genre");
  if (genre) games = games.filter((g) => g.genre === genre);

  const duration = pick(sp, "duration");
  if (duration) {
    const max = Number(duration);
    games = games.filter((g) => g.sessionLengthMin <= max);
  }

  const players = pick(sp, "players");
  if (players === "multi") games = games.filter((g) => g.multiplayer);
  else if (players)
    games = games.filter(
      (g) => g.players.min <= Number(players) && g.players.max >= Number(players),
    );

  const platform = pick(sp, "platform");
  if (platform === "mobile") games = games.filter((g) => g.mobile);
  else if (platform === "desktop") games = games.filter((g) => g.desktop);

  const sort = pick(sp, "sort") ?? "popular";
  switch (sort) {
    case "newest":
      games.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
      break;
    case "score":
      games.sort((a, b) => b.score - a.score);
      break;
    case "random":
      games.sort(() => Math.random() - 0.5);
      break;
    default:
      games.sort((a, b) => b.plays - a.plays);
  }

  return games;
}

/** 构造保留其他参数、替换单个参数的 URL */
function buildHref(
  sp: SearchParams,
  key: string,
  value: string | undefined,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val && k !== key) params.set(k, val);
  }
  if (value) params.set(key, value);
  const qs = params.toString();
  return qs ? `/games?${qs}` : "/games";
}

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const games = filterGames(sp);
  const currentSort = pick(sp, "sort") ?? "popular";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">全部游戏</h1>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">排序：</span>
          {SORTS.map((s) => (
            <Link
              key={s.value}
              href={buildHref(sp, "sort", s.value)}
              className={`rounded-full px-3 py-1 transition-colors ${
                currentSort === s.value
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
        <FilterRow label="分类" param="genre" current={pick(sp, "genre")} sp={sp}>
          {GENRES.map((g) => (
            <FilterChip
              key={g}
              href={buildHref(sp, "genre", pick(sp, "genre") === g ? undefined : g)}
              active={pick(sp, "genre") === g}
              label={g}
            />
          ))}
        </FilterRow>
        <FilterRow label="时长" param="duration" current={pick(sp, "duration")} sp={sp}>
          {DURATIONS.map((d) => (
            <FilterChip
              key={d.value}
              href={buildHref(
                sp,
                "duration",
                pick(sp, "duration") === d.value ? undefined : d.value,
              )}
              active={pick(sp, "duration") === d.value}
              label={d.label}
            />
          ))}
        </FilterRow>
        <FilterRow label="人数" param="players" current={pick(sp, "players")} sp={sp}>
          {PLAYERS.map((p) => (
            <FilterChip
              key={p.value}
              href={buildHref(
                sp,
                "players",
                pick(sp, "players") === p.value ? undefined : p.value,
              )}
              active={pick(sp, "players") === p.value}
              label={p.label}
            />
          ))}
        </FilterRow>
        <FilterRow label="设备" param="platform" current={pick(sp, "platform")} sp={sp}>
          {PLATFORMS.map((p) => (
            <FilterChip
              key={p.value}
              href={buildHref(
                sp,
                "platform",
                pick(sp, "platform") === p.value ? undefined : p.value,
              )}
              active={pick(sp, "platform") === p.value}
              label={p.label}
            />
          ))}
        </FilterRow>
      </div>

      {/* 结果 */}
      <p className="mt-4 text-sm text-muted">共 {games.length} 款游戏</p>
      {games.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {games.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center text-muted">
          没有符合条件的游戏，试试放宽筛选条件
        </div>
      )}
    </div>
  );
}

function FilterRow({
  label,
  param,
  current,
  sp,
  children,
}: {
  label: string;
  param: string;
  current?: string;
  sp: SearchParams;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 shrink-0 text-muted">{label}</span>
      <div className="flex flex-wrap gap-2">
        <FilterChip
          href={buildHref(sp, param, undefined)}
          label="全部"
          active={!current}
        />
        {children}
      </div>
    </div>
  );
}

function FilterChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted hover:border-primary hover:text-primary"
      }`}
    >
      {label}
    </Link>
  );
}
