/**
 * 一键导入 Playgama 游戏目录（开发/验证用）。
 *
 * 从下载的 catalog JSON 文件（data/playgama-catalog.json）读取全部游戏，
 * 通过采集管道（adapter → pipeline）入库。
 *
 * 用法：
 *   pnpm import:playgama                 # 全量导入
 *   pnpm import:playgama -- --maxPages 1 # 仅导前 1 页（200 款）
 *
 * 幂等：按 (source_id, source_game_id) upsert，可重复执行。
 * 英文过滤：adapter 内仅保留 supportedLanguages 含 en-US 的游戏。
 */
import "dotenv/config";

import { getAdapter, syncSource } from "@/lib/games/collectors";
// @ts-expect-error — .mjs file has no type declarations
import { triggerPagesDeploy } from "./pages-deploy.mjs";

const maxPagesArg = process.argv.find((a) => a.startsWith("--maxPages="));
const maxPages = maxPagesArg ? Number(maxPagesArg.split("=")[1]) : null;

async function main() {
  const adapter = getAdapter("playgama");
  if (!adapter) {
    console.error(
      "FAIL: playgama adapter 不可用 — 请检查 PLAYGAMA_CLID 和 PLAYGAMA_CATALOG_PATH 环境变量",
    );
    process.exit(1);
  }

  console.log(`[import-playgama] starting sync (maxPages=${maxPages ?? "all"})`);
  const started = Date.now();

  const stats = await syncSource(adapter, {
    maxPages,
    pageDelayMs: 0, // 本地文件，无需延迟
  });

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `[import-playgama] done (${elapsed}s): ` +
      `fetched=${stats.fetched} 新增=${stats.inserted} 更新=${stats.updated} ` +
      `不变=${stats.unchanged} 下线=${stats.offline}` +
      (stats.error ? ` error=${stats.error}` : ""),
  );

  if (!stats.error && (stats.inserted > 0 || stats.updated > 0)) {
    await triggerPagesDeploy("import-playgama");
  }
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
