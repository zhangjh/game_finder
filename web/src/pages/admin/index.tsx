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
import { AdminFeedbackPage } from "./feedback";
import { AdminGamesPage } from "./games";
import { AdminLoginPage } from "./login";
import { AdminOverviewPage } from "./overview";
import { AdminSourcesPage } from "./sources";
import { AdminAnalyticsPage } from "./analytics";

export function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    adminCheckSession().then(setAuthed);
  }, []);

  // 未登录/登录中状态下的标签页标题（登录成功后由 AdminShell 接管）
  useEffect(() => {
    if (authed) return;
    document.title = authed === null ? "检查登录状态 | GameFinder Admin" : "登录 | GameFinder Admin";
  }, [authed]);

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
  { path: "/admin/feedback", label: "用户反馈" },
  { path: "/admin/sources", label: "数据源" },
  { path: "/admin/duplicates", label: "重复处理" },
  { path: "/admin/cron-jobs", label: "定时任务" },
  { path: "/admin/analytics", label: "数据看板" },
];

const PAGE_TITLES: Record<string, string> = {
  "/admin": "仪表盘 | GameFinder Admin",
  "/admin/games": "游戏管理 | GameFinder Admin",
  "/admin/feedback": "用户反馈 | GameFinder Admin",
  "/admin/sources": "数据源 | GameFinder Admin",
  "/admin/duplicates": "重复处理 | GameFinder Admin",
  "/admin/cron-jobs": "定时任务 | GameFinder Admin",
  "/admin/analytics": "数据看板 | GameFinder Admin",
};

function AdminShell({ onLogout }: { onLogout: (authed: boolean) => void }) {
  const navigate = useNavigate();
  const location = useLocation();

  // 管理后台不走 Seo 组件，按路由设置浏览器标签页标题（避免残留前台页面标题）
  useEffect(() => {
    document.title = PAGE_TITLES[location.pathname] ?? "管理后台 | GameFinder Admin";
  }, [location.pathname]);

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
          <Route path="feedback" element={<AdminFeedbackPage />} />
          <Route path="sources" element={<AdminSourcesPage />} />
          <Route path="duplicates" element={<AdminDuplicatesPage />} />
          <Route path="cron-jobs" element={<AdminCronJobsPage />} />
          <Route path="analytics" element={<AdminAnalyticsPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
}
