import { Link, useNavigate } from "react-router";

const CATEGORIES = [
  { label: "休闲", href: "/games?genre=休闲" },
  { label: "塔防", href: "/games?genre=塔防" },
  { label: "Roguelike", href: "/games?genre=Roguelike" },
  { label: "解谜", href: "/games?genre=解谜" },
  { label: "双人", href: "/games?players=2" },
  { label: "5分钟", href: "/games?duration=5" },
];

export function SiteHeader() {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            AI
          </span>
          <span className="hidden text-base font-semibold sm:block">
            Game Discovery
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
