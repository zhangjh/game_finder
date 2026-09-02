/**
 * 顶栏搜索框。M1 阶段跳转到 /search；
 * M5 接入 AI 搜索后由 AI Intent 判断走传统 FTS 还是推荐 Pipeline。
 */
export function SiteSearch() {
  return (
    <form action="/search" className="w-full max-w-md">
      <label htmlFor="site-search" className="sr-only">
        搜索游戏
      </label>
      <div className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 transition-colors focus-within:border-primary">
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
          id="site-search"
          name="q"
          type="search"
          placeholder="搜游戏、玩法或描述你的需求…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </div>
    </form>
  );
}
