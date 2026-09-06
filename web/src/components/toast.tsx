/**
 * 轻量 Toast 组件：收藏操作反馈 + 本地存储失效提示。
 *
 * 用法：
 *   const { showToast } = useToast();
 *   showToast("已收藏");
 *
 * 在 Layout 中挂载一次 <ToastProvider />，子组件通过 useToast() 调用。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ToastData {
  id: number;
  message: string;
  /** 可选副标题（用于 tips 提示） */
  subMessage?: string;
}

interface ToastContextValue {
  showToast: (message: string, subMessage?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback(
    (message: string, subMessage?: string) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, subMessage }]);
    },
    [],
  );

  // 自动消失（3.5 秒）
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 3500),
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast 容器 */}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-sm flex-col rounded-xl border border-border bg-surface px-4 py-3 shadow-lg"
            role="status"
          >
            <span className="text-sm font-medium">{t.message}</span>
            {t.subMessage && (
              <span className="mt-0.5 text-xs text-muted">{t.subMessage}</span>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
