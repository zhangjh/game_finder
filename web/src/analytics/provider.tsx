/**
 * Analytics 上下文提供者（T6.2）。
 *
 * 在 App 最外层包裹，初始化埋点系统（定时 flush + 页面退出兜底）。
 * 并提供 getUserId() 给子组件读取当前匿名用户 ID。
 * 同时监听路由变化上报 page_view（DANTE-7 流量看板）。
 */
import { createContext, type ReactNode, useContext, useEffect } from "react";
import { useLocation } from "react-router";

import { getUserId } from "./user-id";
import { initUtmTracking } from "./utm";
import { startTracking, stopTracking, trackPageView } from "./track";

interface AnalyticsContextValue {
  userId: string;
}

const AnalyticsContext = createContext<AnalyticsContextValue>({ userId: "" });

export function useAnalytics() {
  return useContext(AnalyticsContext);
}

/** 路由变化 → page_view（带会话 UTM）。挂在 AnalyticsProvider 内部以使用 useLocation。 */
function PageViewTracker() {
  const location = useLocation();
  useEffect(() => {
    initUtmTracking();
  }, []);
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);
  return null;
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    startTracking();
    return () => stopTracking();
  }, []);

  const userId = getUserId();

  return (
    <AnalyticsContext.Provider value={{ userId }}>
      {children}
      <PageViewTracker />
    </AnalyticsContext.Provider>
  );
}
