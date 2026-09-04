/**
 * Analytics 上下文提供者（T6.2）。
 *
 * 在 App 最外层包裹，初始化埋点系统（定时 flush + 页面退出兜底）。
 * 并提供 getUserId() 给子组件读取当前匿名用户 ID。
 */
import { createContext, type ReactNode, useContext, useEffect } from "react";

import { getUserId } from "./user-id";
import { startTracking, stopTracking } from "./track";

interface AnalyticsContextValue {
  userId: string;
}

const AnalyticsContext = createContext<AnalyticsContextValue>({ userId: "" });

export function useAnalytics() {
  return useContext(AnalyticsContext);
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
    </AnalyticsContext.Provider>
  );
}
