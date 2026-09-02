import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  target: "node22",
  clean: true,
  // 全部打进单文件，包括 express/pg/drizzle/cors/dotenv/共用 TS 包，
  // 使运行镜像无需携带 node_modules，规避 pnpm 符号链接在 Docker 里失效的问题。
  noExternal: [/.*/],
});