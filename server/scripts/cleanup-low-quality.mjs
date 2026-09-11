/**
 * 按源站质量分批量下架外部来源游戏。默认仅预览，显式传 --apply 才会写库。
 * 本地来源和 source_quality_score 为 NULL 的游戏始终排除。
 *
 * 用法：
 *   pnpm cleanup:quality
 *   pnpm cleanup:quality -- --source gamepix --threshold 0.2
 *   pnpm cleanup:quality -- --source all --threshold 0.2 --apply
 */
import { Client } from "pg";

import { triggerPagesDeploy } from "./pages-deploy.mjs";

const DEFAULT_THRESHOLD = 0.2;
const MAX_APPLY_THRESHOLD = 0.2;
const MAX_IMPACT = 0.15;
const ALLOWED_SOURCES = new Set(["all", "gamepix", "playgama"]);

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@postgres:5432/game_discovery";

const argValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  const assignment = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return assignment ? assignment.slice(name.length + 1) : fallback;
};

const parseRatio = (name, fallback) => {
  const raw = argValue(name, String(fallback));
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} 必须是 0~1 之间的数字，40 分应写成 0.40`);
  }
  return value;
};

const readConfig = () => {
  const source = argValue("--source", "all").toLowerCase();
  const threshold = parseRatio("--threshold", DEFAULT_THRESHOLD);
  const apply = process.argv.includes("--apply");
  const force = process.argv.includes("--force");

  if (!ALLOWED_SOURCES.has(source)) {
    throw new Error("--source 只允许 all、gamepix 或 playgama；local 不允许批量下架");
  }
  if (apply && process.argv.includes("--dry-run")) {
    throw new Error("--apply 与 --dry-run 不能同时使用");
  }
  if (apply && threshold > MAX_APPLY_THRESHOLD) {
    throw new Error(
      `正式下架阈值最高为 ${MAX_APPLY_THRESHOLD}；更高阈值只能预览，避免跨来源误杀`,
    );
  }

  return { source, threshold, apply, force };
};

const client = new Client({ connectionString: url });
let transactionStarted = false;

try {
  const { source, threshold, apply, force } = readConfig();
  await client.connect();

  if (apply) {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    transactionStarted = true;
  }

  const summaryResult = await client.query(
    `SELECT s.code AS source,
            COUNT(*)::int AS published,
            COUNT(g.source_quality_score)::int AS scored,
            COUNT(*) FILTER (
              WHERE g.source_quality_score IS NOT NULL
                AND g.source_quality_score < $2
            )::int AS candidates,
            COUNT(*) FILTER (WHERE g.source_quality_score IS NULL)::int AS missing_score,
            ROUND(AVG(g.source_quality_score)::numeric, 3) AS average_score,
            ROUND((percentile_cont(0.5) WITHIN GROUP (
              ORDER BY g.source_quality_score
            ))::numeric, 3) AS median_score
       FROM games g
       JOIN game_sources s ON s.id = g.source_id
      WHERE g.status = 'published'
        AND s.code IN ('gamepix', 'playgama')
        AND ($1 = 'all' OR s.code = $1)
      GROUP BY s.code
      ORDER BY s.code`,
    [source, threshold],
  );

  const summary = summaryResult.rows.map((row) => {
    const published = Number(row.published);
    const scored = Number(row.scored);
    const candidates = Number(row.candidates);
    const impact = scored === 0 ? 0 : candidates / scored;
    return {
      source: row.source,
      published,
      scored,
      missingScore: Number(row.missing_score),
      candidates,
      impact,
      impactOfScored: `${(impact * 100).toFixed(1)}%`,
      averageScore: row.average_score === null ? null : Number(row.average_score),
      medianScore: row.median_score === null ? null : Number(row.median_score),
    };
  });

  console.log(
    `[cleanup] mode=${apply ? "apply" : "dry-run"} source=${source} ` +
      `threshold=${threshold} maxImpact=${MAX_IMPACT}`,
  );
  console.table(
    summary.map(({ impact: _impact, ...row }) => row),
  );

  const scored = summary.reduce((sum, row) => sum + row.scored, 0);
  const candidates = summary.reduce((sum, row) => sum + row.candidates, 0);
  const impact = scored === 0 ? 0 : candidates / scored;
  console.log(
    `[cleanup] 候选=${candidates} / 有评分已发布=${scored}，总影响比例=${(impact * 100).toFixed(1)}%`,
  );

  if (!apply) {
    console.log("[cleanup] dry-run 完成；确认结果后添加 --apply 执行下架");
  } else {
    const unsafeSources = summary.filter((row) => row.impact > MAX_IMPACT);
    if (unsafeSources.length > 0 && !force) {
      throw new Error(
        `${unsafeSources.map((row) => `${row.source}=${row.impactOfScored}`).join(", ")} ` +
          `超过单来源 ${(MAX_IMPACT * 100).toFixed(0)}% 保护线；确认无误后添加 --force`,
      );
    }

    const result = await client.query(
      `UPDATE games g
          SET status = 'offline', updated_at = now()
         FROM game_sources s
        WHERE s.id = g.source_id
          AND g.status = 'published'
          AND g.source_quality_score IS NOT NULL
          AND g.source_quality_score < $2
          AND s.code IN ('gamepix', 'playgama')
          AND ($1 = 'all' OR s.code = $1)
        RETURNING g.id`,
      [source, threshold],
    );
    await client.query("COMMIT");
    transactionStarted = false;

    console.log(`[cleanup] 已下架 ${result.rowCount} 款低质量游戏`);
    await triggerPagesDeploy("cleanup-low-quality");
  }
} catch (err) {
  if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
