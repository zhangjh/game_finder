import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiBaseUrl = process.env.VITE_API_BASE_URL ?? env.VITE_API_BASE_URL;
  if (command === "build" && !apiBaseUrl) {
    throw new Error("VITE_API_BASE_URL is required for production builds");
  }

  return {
    plugins: [react(), tailwindcss()],
    // Cloudflare Pages 由 build:seo 生成全部已知 SPA 路径和 404.html。
  };
});
