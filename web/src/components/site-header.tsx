import { Link, useNavigate } from "react-router";

import { useFavorites } from "../hooks/use-favorites";

const CATEGORIES = [
  { label: "高品质", href: "/high-quality" },
  { label: "休闲", href: "/games?genre=休闲" },
  { label: "塔防", href: "/games?genre=塔防" },
  { label: "Roguelike", href: "/games?genre=Roguelike" },
  { label: "解谜", href: "/games?genre=解谜" },
  { label: "双人", href: "/games?players=2" },
  { label: "5分钟", href: "/games?duration=5" },
];

export function SiteHeader() {
  const navigate = useNavigate();
  const { count } = useFavorites();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            玩
          </span>
          <span className="hidden text-base font-semibold sm:block">
            玩什么
          </span>
        </Link>

        <form
          className="flex flex-1 justify-center"
          onSubmit={(e) => {
            e.preventDefault();
            const q = new FormData(e.currentTarget).get("q");
            if (typeof q === "string" && q.trim()) {
              navigate(`/search?q=${encodeURIComponent(q.trim())}`);
            }
          }}
        >
          <div className="flex w-full max-w-md items-center gap-2 rounded-full border border-border bg-background px-4 py-2 transition-colors focus-within:border-primary">
            <svg
              className="h-4 w-4 shrink-0 text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-4.35-4.35M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"
              />
            </svg>
            <input
              name="q"
              type="search"
              placeholder="搜游戏、玩法或描述你的需求…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
        </form>

        {/* 收藏入口 */}
        <Link
          to="/favorites"
          className="relative flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-2 text-sm transition-colors hover:border-primary hover:text-primary"
          title="我的收藏"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
          </svg>
          <span className="hidden sm:inline">收藏</span>
          {count > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Link>
      </div>

      <nav className="border-t border-border/60">
        <ul className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2 text-sm text-muted">
          {CATEGORIES.map((c) => (
            <li key={c.href} className="shrink-0">
              <Link
                to={c.href}
                className="rounded-full px-3 py-1 transition-colors hover:bg-background hover:text-foreground"
              >
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
