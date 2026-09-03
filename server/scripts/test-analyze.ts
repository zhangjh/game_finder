/**
 * 小数据量冒烟测试：对 N 个 draft 游戏跑 AI 画像分析。
 * 用法（指定连接虚拟机数据库 localhost:5432）：
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/game_discovery"
 *   npx tsx scripts/test-analyze.ts [limit]
 */
import "dotenv/config";
import { runAnalyzeGames } from "@/lib/ai/job";

const limit = Number(process.argv[2] ?? "3");
console.log(`[test-analyze] limit=${limit}`);
const stats = await runAnalyzeGames(limit);
console.log("[test-analyze] stats:", JSON.stringify(stats, null, 2));
