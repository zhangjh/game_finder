/**
 * 批量清洗低质量游戏（一次性运维脚本，可重复执行）：
 *   1.（仅 GamePix）遍历 feed 全量（order=quality，96/页），按 source_game_id
 *      回填 source_quality_score（0~1 官方质量分）。
 *      Playgama 无需此步：其代理质量分由采集 adapter 计算（backfill-playgama-quality.ts
 *      或同步时写入）。
 *   2. 将 source_quality_score < 阈值（默认 0.2，只清"极渣尾部"）的已发布游戏批量
 *      下架（status=offline），前台不可见；之后质量重新 > 阈值时，
 *      同步管道会按 isChanged 复活/更新。
 *
 * 阈值说明：
 * - GamePix quality_score 在全库接近均匀分布（中位数 ~0.58），
 *   0.8 会把 85%+ 目录全下架，正常只清底部垃圾（<0.2 ≈ 8%）。
 * - Playgama 代理分（adapter 合成，0~1）中位数 ~0.45，bottom 10% ≤ 0.20，
 *   同样用默认阈值 0.2 即可对齐。
 *
 * 用法：
 *   pnpm cleanup:quality                      # GamePix 全量回填 + 下架极渣（阈值 0.2）
 *   pnpm cleanup:quality -- -s playgama       # playgama 只下架极渣（分数已在库，不回填）
 *   pnpm cleanup:quality -- --dry-run         # 只打印将下架的量，不落库
 *   pnpm cleanup:quality -- --threshold=0.5   # 自定义阈值（也支持空格形式 --threshold 0.5）
 */
import { Client } from "pg";

import { triggerPagesDeploy } from "./pages-deploy.mjs";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@postgres:5432/game_discovery";

const SID = process.env.GAMEPIX_SID ?? "7E317";
const FEED = `https://feeds.gamepix.com/v2/json?sid=${SID}&pagination=96&order=quality`;

/** 同时支持 `--name value`（空格）与 `--name=value`（等号）两种写法 */
const argValue = (name, fallback) => {
  const i = process.argv.indexOf(name);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : fallback;
};

const SOURCE = argValue("--source", "gamepix");
const THRESHOLD = Number(argValue("--threshold", "0.2")) || 0.2;
const DRY_RUN = process.argv.includes("--dry-run");

const asQualityScore = (v) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(1, Math.max(0, v))
    : null;

const client = new Client({ connectionString: url });

try {
  await client.connect();

  const src = (
    await client.query("SELECT id FROM game_sources WHERE code = $1", [SOURCE])
  ).rows[0];
  if (!src) throw new Error(`缺少 ${SOURCE} 数据源，请先跑 pnpm db:seed / 同步任务`);

  console.log(`[cleanup] 数据源=${SOURCE} 阈值=${THRESHOLD} dry_run=${DRY_RUN}`);

  if (SOURCE === "gamepix") {
    // 仅 GamePix 需要先从 feed 拉官方质量分回填（playgama 的由 adapter 在采集时写入）
    const byId = new Map();
    let page = 1;
    for (;;) {
      const res = await fetch(`${FEED}&page=${page}`, {
        headers: { "User-Agent": "GameFinderBot/0.1 (+cleanup)" },
      });
      if (res.status === 400) break; // 越过末页（实测 400 表示页越界）
      if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      if (items.length === 0) break;
      for (const g of items) {
        const q = asQualityScore(g.quality_score);
        if (q != null) byId.set(String(g.id), q);
      }
      if (!data.next_url) break;
      page++;
    }
    console.log(`[cleanup] feed 共 ${page} 页，收集到 ${byId.size} 个质量分`);

    const ids = [...byId.keys()];
    if (ids.length === 0) {
      console.log("[cleanup] feed 无任何质量分，退出");
      process.exit(0);
    }

    const scores = ids.map((id) => byId.get(id));
    const backfill = await client.query(
      `UPDATE games
       SET source_quality_score = u.score, updated_at = now()
       FROM unnest($1::text[], $2::double precision[]) AS u(game_id, score)
       WHERE games.source_id = $3 AND games.source_game_id = u.game_id
         AND games.source_quality_score IS DISTINCT FROM u.score`,
      [ids, scores, src.id],
    );
    console.log(`[cleanup] 回填质量分：${backfill.rowCount} 行更新`);
  }

  await client.query("BEGIN");

  if (DRY_RUN) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM games
       WHERE source_id = $1 AND status = 'published'
         AND source_quality_score IS NOT NULL AND source_quality_score < $2`,
      [src.id, THRESHOLD],
    );
    console.log(`[cleanup][dry-run] 将被下架的低质游戏：${rows[0].n} 款（未实际下架）`);
  } else {
    const offlined = await client.query(
      `UPDATE games SET status = 'offline', updated_at = now()
       WHERE source_id = $1 AND status = 'published'
         AND source_quality_score IS NOT NULL AND source_quality_score < $2`,
      [src.id, THRESHOLD],
    );
    console.log(`[cleanup] 已下架低质游戏：${offlined.rowCount} 款`);
  }

  await client.query("COMMIT");
  await triggerPagesDeploy("cleanup-low-quality");
  console.log("[cleanup] 完成");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}