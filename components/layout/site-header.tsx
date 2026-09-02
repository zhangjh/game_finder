import Link from "next/link";

import { SiteSearch } from "./site-search";

/**
 * 全站顶栏：Logo / 搜索框 / 分类入口。
 * 移动端优先：分类导航在窄屏折叠为横向滚动。
 */
export function SiteHeader() {
  const categories = [
    { label: "休闲", href: "/games?genre=casual" },
    { label: "塔防", href: "/games?genre=tower-defense" },
    { label: "Roguelike", href: "/games?genre=roguelike" },
    { label: "解谜", href: "/games?genre=puzzle" },
    { label: "双人", href: "/games?players=2" },
    { label: "5分钟", href: "/games?duration=5" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            AI
          </span>
          <span className="hidden text-base font-semibold sm:block">
            Game Discovery
          </span>
        </Link>

        <div className="flex flex-1 justify-center">
          <SiteSearch />
        </div>
      </div>

      <nav className="border-t border-border/60">
        <ul className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2 text-sm text-muted">
          {categories.map((c) => (
            <li key={c.href} className="shrink-0">
              <Link
                href={c.href}
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
