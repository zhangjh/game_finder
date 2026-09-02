import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "服务状态",
};

/** API 服务状态页（非公开前台；前台在主域 CF Pages） */
export default function StatusPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-bold">Game Discovery API</h1>
      <p className="text-sm text-muted">
        这是后端 API 与管理后台服务（部署于 VPS，api 子域）。
      </p>
      <ul className="mt-2 text-sm text-muted">
        <li>
          公开 API：<code className="text-foreground">GET /api/games</code>
        </li>
        <li>
          管理后台：<code className="text-foreground">/admin</code>（建设中，T2.3）
        </li>
      </ul>
    </main>
  );
}
