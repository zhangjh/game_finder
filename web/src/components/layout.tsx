import { Outlet, useLocation } from "react-router";

import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function Layout() {
  const location = useLocation();

  // SPA 路由切换后回到顶部
  if (typeof window !== "undefined") window.scrollTo(0, 0);
  void location;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
