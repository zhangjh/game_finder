/**
 * 一次性回填 Playgama 代理质量分（只填空，绝不重复刷分）：
 *   - 从本地 catalog JSON 读取全量游戏，用 adapter 同款 proxyQualityScore 公式算分；
 *   - 仅更新 source_id=playgama 且 source_quality_score IS NULL 的行
 *     （已有分数的游戏如 GamePix 完全不受影响，也跳过已回填过的 playgama）；
 *   - 只改 source_quality_score，不置 needs_reanalysis / 不触发 AI 重分析。
 *
 * 幂等可重复执行。日常同步（import:playgama / sync_games 定时任务）中的
 * isChanged 守卫已保证分数相同不再写库；本脚本是**首次上分**用的低副作用通道。
 *
 * 用法：
 *   pnpm backfill:playgama -- --dry-run    # 只统计待回填数量，不改库
 *   pnpm backfill:playgama                 # 正式回填
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Client } from "pg";

import {
  proxyQualityScore,
  type RawPlaygamaHit,
} from "@/lib/games/collectors/playgama";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@postgres:5432/game_discovery";
const catalogPath =
  process.env.PLAYGAMA_CATALOG_PATH ?? "data/playgama-catalog.json";
const DRY_RUN = process.argv.includes("--dry-run");

interface CatalogJson {
  segments?: Array<{ hits?: RawPlaygamaHit[] }>;
}

async function main() {
  const data = JSON.parse(readFileSync(catalogPath, "utf8")) as CatalogJson;
  const hits = (data.segments ?? []).flatMap((seg) => seg.hits ?? []);

  const scores = new Map<string, number>();
  for (const h of hits) {
    const id = typeof h.id === "string" && h.id.length > 0 ? h.id : null;
    if (!id || scores.has(id)) continue;
    scores.set(id, proxyQualityScore(h));
  }
  console.log(`[backfill-playgama] catalog 共 ${scores.size} 款（计算代理分）`);

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const src = (
      await client.query("SELECT id FROM game_sources WHERE code = 'playgama'")
    ).rows[0];
    if (!src) throw new Error("缺少 playgama 数据源，请先执行一次同步");

    if (DRY_RUN) {
      const { rows } = await client.query(
        "SELECT count(*)::int AS n FROM games WHERE source_id = $1 AND source_quality_score IS NULL",
        [src.id],
      );
      console.log(`[backfill-playgama][dry-run] 待回填（当前无分）: ${rows[0].n} 款`);
      console.log("[backfill-playgama][dry-run] 其余已有分数或非 playgama 的游戏将被跳过");
      return;
    }

    const ids = [...scores.keys()];
    const vals = ids.map((id) => scores.get(id));

    const res = await client.query(
      `UPDATE games
       SET source_quality_score = u.score, updated_at = now()
       FROM unnest($1::text[], $2::double precision[]) AS u(game_id, score)
       WHERE games.source_id = $3 AND games.source_game_id = u.game_id
         AND games.source_quality_score IS NULL`,
      [ids, vals, src.id],
    );
    console.log(`[backfill-playgama] 回填 ${res.rowCount} 款（已有分数的已跳过）`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});