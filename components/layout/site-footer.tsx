import Link from "next/link";

/** 全站底栏：品牌 / 关于 / 版权占位（备案号上线时补充） */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-6 text-sm text-muted sm:flex-row sm:justify-between">
        <p>© 2026 AI Game Discovery · 让你更快找到想玩的游戏</p>
        <nav className="flex items-center gap-4">
          <Link href="/games" className="transition-colors hover:text-foreground">
            全部游戏
          </Link>
          <Link
            href="/search"
            className="transition-colors hover:text-foreground"
          >
            搜索
          </Link>
        </nav>
      </div>
    </footer>
  );
}
