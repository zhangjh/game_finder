/**
 * 管理后台（T2.3，PRD §36）：隐藏路由 /admin，不进导航/footer。
 * 密码登录（ADMIN_PASSWORD → Express cookie 会话）。
 * 子页：仪表盘 / 游戏列表（上下架）/ 数据源 / 疑似重复处理。
 */
import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";

import { adminCheckSession } from "../../admin-api";
import { AdminCronJobsPage } from "./cron-jobs";
import { AdminDuplicatesPage } from "./duplicates";
import { AdminGamesPage } from "./games";
import { AdminLoginPage } from "./login";
import { AdminSourcesPage } from "./sources";
import { AdminOverviewPage } from "./overview";

export function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    adminCheckSession().then(setAuthed);
  }, []);

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
        检查登录状态…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {authed ? <AdminShell onLogout={setAuthed} /> : <AdminLoginPage onSuccess={() => setAuthed(true)} />}
    </div>
  );
}

const NAV = [
  { path: "/admin", label: "仪表盘" },
  { path: "/admin/games", label: "游戏" },
  { path: "/admin/sources", label: "数据源" },
  { path: "/admin/duplicates", label: "重复处理" },
  { path: "/admin/cron-jobs", label: "定时任务" },
];

function AdminShell({ onLogout }: { onLogout: (authed: boolean) => void }) {
  const navigate = useNavigate();
  const location = useLocation();

  const logout = useCallback(async () => {
    const { adminLogout } = await import("../../admin-api");
    await adminLogout().catch(() => {});
    onLogout(false);
    navigate("/admin");
  }, [navigate, onLogout]);

  return (
    <div>
      <header className="border-b border-neutral-800 bg-neutral-900">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <span className="font-bold">GameFinder Admin</span>
          <nav className="flex gap-4 text-sm">
            {NAV.map((n) => (
              <a
                key={n.path}
                href={n.path}
                className={
                  location.pathname === n.path
                    ? "text-white"
                    : "text-neutral-400 hover:text-neutral-200"
                }
              >
                {n.label}
              </a>
            ))}
          </nav>
          <button
            onClick={logout}
            className="ml-auto rounded border border-neutral-700 px-3 py-1 text-sm text-neutral-400 hover:text-white"
          >
            退出
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route index element={<AdminOverviewPage />} />
          <Route path="games" element={<AdminGamesPage />} />
          <Route path="sources" element={<AdminSourcesPage />} />
          <Route path="duplicates" element={<AdminDuplicatesPage />} />
          <Route path="cron-jobs" element={<AdminCronJobsPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
}
