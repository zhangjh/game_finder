/**
 * 导入「本地部署」游戏目录到 games 表（server/data/local-games.json）。
 *
 * - 幂等：按 (source_id, source_game_id) upsert，可重复执行。
 * - 仅新增时自动发布（status=published）；已存在的游戏不覆盖其状态，
 *   保留后台上下架（offline）等人工处理结果。
 * - 只回写元数据字段，不动 play_count（避免重置真实播放统计）。
 *
 * 用法：
 *   pnpm --filter server import:local
 *
 * 前置：
 *   1. 先跑 pnpm --filter server build:local-catalog 生成目录文件；
 *   2. 运行 publish:local-games 把游戏文件发布到 R2 后，
 *      设置 LOCAL_GAMES_BASE_URL=<桶公开域名>（如 https://local-games.example.com），
 *      写入库中的 thumbnail / game_url 才会是该域名的绝对地址。
 *      未设置时仅写入相对路径（适合纯本地开发）。
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { Client } from "pg";

import { triggerPagesDeploy } from "./pages-deploy.mjs";

loadDotenv({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@postgres:5432/game_discovery";

const CATALOG_PATH = path.resolve(
  import.meta.dirname,
  "../data/local-games.json",
);

const baseUrl =
  (process.env.LOCAL_GAMES_BASE_URL ?? "").trim().replace(/\/+$/, "") || null;
if (!baseUrl) {
  console.warn("警告：未设置 LOCAL_GAMES_BASE_URL，thumbnail / game_url 将写入相对路径（仅适合本地开发）");
}

const toAbsolute = (relative) =>
  baseUrl && relative ? `${baseUrl}${relative}` : relative;

const client = new Client({ connectionString: url });

try {
  const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  if (!Array.isArray(catalog) || catalog.length === 0) {
    throw new Error(`目录为空或非法（${CATALOG_PATH}）`);
  }
  console.log(`读取目录 ${CATALOG_PATH}：${catalog.length} 款游戏`);

  await client.connect();
  await client.query("BEGIN");

  // 确保 local 数据源存在（本地部署；文件托管在 R2，base_url 记录桶域名）
  const { rows: srcRows } = await client.query(
    `INSERT INTO game_sources (code, name, base_url, api_type)
     VALUES ('local', '本地部署', $1, 'local_files')
     ON CONFLICT (code) DO UPDATE SET
       name = EXCLUDED.name,
       base_url = COALESCE(EXCLUDED.base_url, game_sources.base_url),
       api_type = EXCLUDED.api_type
     RETURNING id`,
    [baseUrl],
  );
  const sourceId = srcRows[0].id;
  console.log(`数据源 local（本地部署）id=${sourceId}`);

  let inserted = 0;
  let updated = 0;
  for (const [idx, g] of catalog.entries()) {
    const {
      sourceGameId,
      slug,
      title,
      description,
      genre,
      thumbnail,
      gameUrl,
    } = g;
    if (!sourceGameId || !slug || !title || !gameUrl) {
      console.warn(`[skip] 字段缺失：${JSON.stringify(g)}`);
      continue;
    }
    const absThumbnail = toAbsolute(thumbnail);
    const absGameUrl = toAbsolute(gameUrl);
    // 确定性伪随机启动量：让本地游戏也能进「热门」列表（与 import-gamepix 思路一致）
    const playCount = ((idx + 1) * 7919) % 12000 + 800;

    const { rows } = await client.query(
      `INSERT INTO games (
         source_id, source_game_id, title, title_original, slug,
         description, description_original, description_zh, thumbnail,
         game_url, genre, tags, mechanics, desktop, mobile, portrait,
         landscape, input_methods, game_language, play_count,
         status, metadata_language, published_at
       ) VALUES (
         $1,$2,$3,$3,$4,
         $5,$5,$5,$6,
         $7,$8,'[]','[]',true,true,false,true,'["mouse","touch"]','zh',$9,
         'published','zh', now()
       )
       ON CONFLICT (source_id, source_game_id) DO UPDATE SET
         title = EXCLUDED.title, title_original = EXCLUDED.title_original,
         slug = EXCLUDED.slug, description = EXCLUDED.description,
         description_original = EXCLUDED.description_original,
         description_zh = EXCLUDED.description_zh,
         thumbnail = EXCLUDED.thumbnail, game_url = EXCLUDED.game_url,
         genre = EXCLUDED.genre, updated_at = now()
       RETURNING (xmax = 0) AS is_insert`,
      [
        sourceId, sourceGameId, title, slug,
        description ?? "", absThumbnail,
        absGameUrl, genre ?? null, playCount,
      ],
    );
    if (rows[0].is_insert) inserted++;
    else updated++;
  }

  console.log(`games: ${inserted} inserted, ${updated} updated`);

  // GameScore 冷启动占位（与 import-gamepix 一致）：让本地游戏也有评分可排
  await client.query(
    `INSERT INTO game_scores (game_id, total_score, components, sample_size)
     SELECT id,
            5.5 + 4.0 * (play_count::real / NULLIF((SELECT max(play_count) FROM games), 0)),
            '{"cold_start": true}'::jsonb, 0
     FROM games
     WHERE source_id = $1
     ON CONFLICT (game_id) DO NOTHING`,
    [sourceId],
  );
  console.log("scores: cold-start placeholder written for local games");

  await client.query("COMMIT");

  // 触发 Cloudflare Pages 重新构建（新游戏进入静态 SEO 页面）
  await triggerPagesDeploy("import-local");

  console.log("import done — 前台「中文精品」专区可访问本地游戏");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("FAIL:", err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}