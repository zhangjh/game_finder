import type { Metadata } from "next";
import "./globals.css";

/**
 * server 端 layout：本服务只承载 API（/api/*）与管理后台（/admin），
 * 公开前台在 web/（Cloudflare Pages SPA）。
 */
export const metadata: Metadata = {
  title: {
    default: "Game Discovery API",
    template: "%s | Game Discovery API",
  },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
