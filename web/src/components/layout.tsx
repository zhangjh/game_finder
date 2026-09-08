import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";

import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { ToastProvider } from "./toast";

export function Layout() {
  const location = useLocation();

  // SPA 路由切换后回到顶部
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname, location.search]);

  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="flex-1">
          <Outlet />
        </main>
        <SiteFooter />
      </div>
    </ToastProvider>
  );
}
