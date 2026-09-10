/**
 * Seed：注册数据源（幂等，可重复执行）。
 * 用法：node --env-file=.env scripts/seed.mjs（或 pnpm db:seed）
 *
 * 注意：不再写入任何 mock 游戏。真实游戏通过 `pnpm import:gamepix` 从
 * GamePix feed 导入（见 scripts/import-gamepix.mjs）。
 */
import { Client } from "pg";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@postgres:5432/game_discovery";

const SOURCES = [
  { code: "gamepix", name: "GamePix", baseUrl: "https://feeds.gamepix.com" },
  { code: "gamezop", name: "Gamezop", baseUrl: "https://pub.gamezop.com" },
  { code: "playgama", name: "Playgama", baseUrl: "https://playgama.com" },
  {
    code: "local",
    name: "本地部署",
    baseUrl: null,
    apiType: "local_files",
  },
];

const client = new Client({ connectionString: url });

try {
  await client.connect();
  await client.query("BEGIN");

  for (const s of SOURCES) {
    await client.query(
      `INSERT INTO game_sources (code, name, base_url, api_type) VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, base_url = EXCLUDED.base_url, api_type = EXCLUDED.api_type`,
      [s.code, s.name, s.baseUrl ?? null, s.apiType ?? "json_feed"],
    );
  }
  console.log(`sources: ${SOURCES.length} upserted`);

  await client.query("COMMIT");
  console.log("seed done");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("FAIL:", err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
