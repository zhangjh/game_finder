import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AI Game Discovery — 告诉我你想怎么玩",
    template: "%s | AI Game Discovery",
  },
  description:
    "告诉 AI 你现在想怎么玩，它帮你从海量网页游戏中找到最适合你的游戏。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
