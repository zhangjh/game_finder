/**
 * 批量清洗低质量 GamePix 游戏（一次性运维脚本，可重复执行）：
 *   1. 遍历 GamePix feed 全量（order=quality，96/页），按 source_game_id
 *      回填 source_quality_score（0~1 官方质量分）。
 *   2. 将 quality_score < 阈值（默认 0.8）的已发布游戏批量下架（status=offline），
 *      前台不可见；之后 feed 质量提升重新 > 阈值时，同步管道会按 isChanged 复活/更新。
 *
 * 用法：
 *   pnpm cleanup:quality                       # 全量回填 + 下架低质（阈值 0.8）
 *   pnpm cleanup:quality -- --dry-run          # 只回填并打印将下架的量，不落库
 *   pnpm cleanup:quality -- --threshold 0.7    # 自定义阈值
 */
import { Client } from "pg";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@postgres:5432/game_discovery";

const SID = process.env.GAMEPIX_SID ?? "7E317";
const FEED = `https://feeds.gamepix.com/v2/json?sid=${SID}&pagination=96&order=quality`;

const thresholdArg = process.argv.find((a) => a.startsWith("--threshold="));
const THRESHOLD = Number(thresholdArg?.split("=")[1]) || 0.8;
const DRY_RUN = process.argv.includes("--dry-run");

const asQualityScore = (v) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(1, Math.max(0, v))
    : null;

const client = new Client({ connectionString: url });

try {
  await client.connect();

  const src = (
    await client.query("SELECT id FROM game_sources WHERE code = 'gamepix'")
  ).rows[0];
  if (!src) throw new Error("缺少 gamepix 数据源，请先跑 pnpm db:seed / 同步任务");

  console.log(`[cleanup] 拉取 GamePix feed 回填质量分（阈值 ${THRESHOLD}, dry_run=${DRY_RUN}）`);

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
  const scores = ids.map((id) => byId.get(id));

  if (ids.length === 0) {
    console.log("[cleanup] feed 无任何质量分，退出");
    process.exit(0);
  }

  await client.query("BEGIN");

  const backfill = await client.query(
    `UPDATE games
     SET source_quality_score = u.score, updated_at = now()
     FROM unnest($1::text[], $2::double precision[]) AS u(game_id, score)
     WHERE games.source_id = $3 AND games.source_game_id = u.game_id
       AND games.source_quality_score IS DISTINCT FROM u.score`,
    [ids, scores, src.id],
  );
  console.log(`[cleanup] 回填质量分：${backfill.rowCount} 行更新`);

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
  console.log("[cleanup] 完成");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("FAIL:", err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}