import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // CF Pages 是纯静态托管，SPA 路由需要回退到 index.html
  // （CF Pages 默认已做 SPA fallback，本地 preview 也默认支持）
});
