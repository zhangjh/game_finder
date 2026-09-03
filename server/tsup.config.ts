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
  // ESM 单文件里被 esbuild 保留下来的动态 require（如 dotenv/pg 内嵌的
  // require("fs")/require("path") 等内置模块调用）在 Node 的纯 ESM 作用域中
  // 没有原生 require。用 createRequire 注入一个 module 级的 require，
  // 使打包产物里的 __require 垫片能正常解析 Node 内置模块。
  banner: () => ({
    js: `import { createRequire as __createRequire } from "module";\nconst require = __createRequire(import.meta.url);`,
  }),
});