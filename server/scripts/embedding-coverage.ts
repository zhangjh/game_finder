import "dotenv/config";
import { sql } from "drizzle-orm";

import { db, pool } from "@/lib/db";

const percent = (embedded: number, total: number) =>
  total === 0 ? 0 : Number(((embedded / total) * 100).toFixed(1));

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL 未配置，无法统计 embedding 覆盖率");
  }

  const [totalsResult, modelsResult] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE g.status = 'published')::int AS published_count,
        COUNT(ge.game_id) FILTER (WHERE g.status = 'published')::int AS published_embedded_count,
        COUNT(*) FILTER (
          WHERE g.status = 'published' AND g.metadata_language = 'zh'
        )::int AS published_zh_count,
        COUNT(ge.game_id) FILTER (
          WHERE g.status = 'published' AND g.metadata_language = 'zh'
        )::int AS published_zh_embedded_count
      FROM games g
      LEFT JOIN game_embeddings ge ON ge.game_id = g.id
    `),
    db.execute(sql`
      SELECT ge.model, COUNT(*)::int AS game_count
      FROM game_embeddings ge
      JOIN games g ON g.id = ge.game_id
      WHERE g.status = 'published'
      GROUP BY ge.model
      ORDER BY game_count DESC, ge.model ASC
    `),
  ]);

  const totals = totalsResult.rows[0] as Record<string, unknown>;
  const published = Number(totals.published_count ?? 0);
  const publishedEmbedded = Number(totals.published_embedded_count ?? 0);
  const publishedZh = Number(totals.published_zh_count ?? 0);
  const publishedZhEmbedded = Number(
    totals.published_zh_embedded_count ?? 0,
  );

  console.log(
    JSON.stringify(
      {
        configuredModel: process.env.EMBEDDING_MODEL ?? null,
        published: {
          total: published,
          embedded: publishedEmbedded,
          missing: published - publishedEmbedded,
          coveragePercent: percent(publishedEmbedded, published),
        },
        publishedZh: {
          total: publishedZh,
          embedded: publishedZhEmbedded,
          missing: publishedZh - publishedZhEmbedded,
          coveragePercent: percent(publishedZhEmbedded, publishedZh),
        },
        modelDistribution: modelsResult.rows.map((row) => ({
          model: row.model,
          games: Number(row.game_count),
        })),
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error && err.cause instanceof Error
    ? `: ${err.cause.message}`
    : "";
  console.error(`[embedding-coverage] failed: ${message}${cause}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
