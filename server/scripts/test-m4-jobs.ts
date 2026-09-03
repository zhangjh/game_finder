/**
 * T4.2/T4.4 冒烟测试：跑 embedding 与 relation job。
 * 用法：$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/game_discovery"
 *   npx tsx scripts/test-m4-jobs.ts [embed_limit]
 */
import "dotenv/config";
import { runEmbeddingJob } from "@/lib/ai/embedding-job";
import { runRelationJob } from "@/lib/ai/relations-job";

const embedLimit = Number(process.argv[2] ?? "10");

console.log("[test-m4] embedding job start (limit=" + embedLimit + ")");
const es = await runEmbeddingJob(embedLimit);
console.log("[test-m4] embedding stats:", JSON.stringify(es));

console.log("[test-m4] relation job start");
const rs = await runRelationJob();
console.log("[test-m4] relation stats:", JSON.stringify(rs));
