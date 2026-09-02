/**
 * Seed：把 M1 的 mock 游戏与演示数据源写入数据库（幂等，可重复执行）。
 * 用法：node --env-file=.env scripts/seed.mjs（或 pnpm db:seed）
 *
 * 后续 M3 真实采集接入后，本脚本仅保留 source 注册 + 少量演示游戏，
 * 用于本地无外部依赖的开发/测试。
 */
import { Client } from "pg";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/game_discovery";

const SOURCES = [
  { code: "gamepix", name: "GamePix", baseUrl: "https://feeds.gamepix.com" },
  { code: "gamezop", name: "Gamezop", baseUrl: "https://pub.gamezop.com" },
  { code: "mock", name: "Mock 演示源", baseUrl: null },
];

const GAMES = [
  {
    source: "mock",
    sourceGameId: "mock-1",
    title: "轻量塔防",
    titleOriginal: "Tower Defense Lite",
    slug: "tower-defense-lite",
    description: "保护你的基地，抵御不断来袭的敌人。波次紧凑，上手即玩，适合碎片时间。",
    thumbnail: "/placeholder.svg",
    gameUrl: "about:blank",
    genre: "塔防",
    subGenre: "休闲策略",
    tags: ["塔防", "策略", "单机"],
    mechanics: ["resource_management", "wave_defense", "tower_upgrade"],
    difficulty: 2, cognitiveLoad: 2, complexity: 2, pace: 3, stressLevel: 2, replayability: 4,
    sessionLengthMin: 5, sessionLengthMax: 15,
    mood: ["casual", "focus"],
    singlePlayer: true, multiplayer: false, minPlayers: 1, maxPlayers: 1,
    desktop: true, mobile: true, portrait: false,
    gameLanguage: "en", playCount: 12300,
  },
  {
    source: "mock",
    sourceGameId: "mock-2",
    title: "禅意消除",
    titleOriginal: "Zen Match",
    slug: "zen-match",
    description: "慢节奏的三消游戏，没有倒计时压力。配上轻音乐，适合一天结束时放松大脑。",
    thumbnail: "/placeholder.svg",
    gameUrl: "about:blank",
    genre: "休闲",
    subGenre: "消除",
    tags: ["消除", "放松", "无压力"],
    mechanics: ["match_3", "no_timer"],
    difficulty: 1, cognitiveLoad: 1, complexity: 1, pace: 1, stressLevel: 1, replayability: 3,
    sessionLengthMin: 5, sessionLengthMax: 30,
    mood: ["relaxing", "casual"],
    singlePlayer: true, multiplayer: false, minPlayers: 1, maxPlayers: 1,
    desktop: true, mobile: true, portrait: true,
    gameLanguage: "zh", playCount: 28400,
  },
  {
    source: "mock",
    sourceGameId: "mock-3",
    title: "轻松幸存者",
    titleOriginal: "Rogue Survivor Easy",
    slug: "rogue-survivor-easy",
    description: "类 Vampire Survivors 玩法，但节奏更慢、数值更友好，一局 10 分钟。",
    thumbnail: "/placeholder.svg",
    gameUrl: "about:blank",
    genre: "Roguelike",
    subGenre: "幸存者",
    tags: ["Roguelike", "割草", "轻度"],
    mechanics: ["auto_attack", "build_crafting", "wave_survival"],
    difficulty: 2, cognitiveLoad: 2, complexity: 2, pace: 3, stressLevel: 2, replayability: 5,
    sessionLengthMin: 10, sessionLengthMax: 15,
    mood: ["casual", "exciting"],
    singlePlayer: true, multiplayer: false, minPlayers: 1, maxPlayers: 1,
    desktop: true, mobile: true, portrait: true,
    gameLanguage: "en", playCount: 19800,
  },
  {
    source: "mock",
    sourceGameId: "mock-4",
    title: "双人对战乒乓",
    titleOriginal: "PvP Pong Duo",
    slug: "pvp-pong-duo",
    description: "经典乒乓对战，同屏双人。一局一分，随时开打，适合和朋友轮流守擂。",
    thumbnail: "/placeholder.svg",
    gameUrl: "about:blank",
    genre: "对战",
    subGenre: "体育",
    tags: ["双人", "对战", "同屏"],
    mechanics: ["local_pvp", "reflex"],
    difficulty: 2, cognitiveLoad: 2, complexity: 1, pace: 4, stressLevel: 3, replayability: 4,
    sessionLengthMin: 2, sessionLengthMax: 10,
    mood: ["exciting", "competitive"],
    singlePlayer: true, multiplayer: true, minPlayers: 1, maxPlayers: 2,
    desktop: true, mobile: false, portrait: false,
    gameLanguage: "zh", playCount: 8700,
  },
  {
    source: "mock",
    sourceGameId: "mock-5",
    title: "烧脑数字谜阵",
    titleOriginal: "Deep Puzzle Grid",
    slug: "deep-puzzle-grid",
    description: "基于数独变体的逻辑谜题，难度递进。适合喜欢安静思考的玩家。",
    thumbnail: "/placeholder.svg",
    gameUrl: "about:blank",
    genre: "解谜",
    subGenre: "逻辑",
    tags: ["解谜", "逻辑", "思考"],
    mechanics: ["logic_deduction", "grid"],
    difficulty: 4, cognitiveLoad: 4, complexity: 3, pace: 1, stressLevel: 1, replayability: 4,
    sessionLengthMin: 10, sessionLengthMax: 30,
    mood: ["focus", "brain_burn"],
    singlePlayer: true, multiplayer: false, minPlayers: 1, maxPlayers: 1,
    desktop: true, mobile: true, portrait: true,
    gameLanguage: "en", playCount: 6400,
  },
  {
    source: "mock",
    sourceGameId: "mock-6",
    title: "合并农场",
    titleOriginal: "Merge Farm Idle",
    slug: "merge-farm-idle",
    description: "合成升级作物，挂机也有产出。想肝可以肝，想闲可以闲。",
    thumbnail: "/placeholder.svg",
    gameUrl: "about:blank",
    genre: "休闲",
    subGenre: "合成挂机",
    tags: ["合成", "挂机", "经营"],
    mechanics: ["merge", "idle_progression"],
    difficulty: 1, cognitiveLoad: 1, complexity: 2, pace: 2, stressLevel: 1, replayability: 4,
    sessionLengthMin: 10, sessionLengthMax: 60,
    mood: ["relaxing", "casual"],
    singlePlayer: true, multiplayer: false, minPlayers: 1, maxPlayers: 1,
    desktop: true, mobile: true, portrait: true,
    gameLanguage: "zh", playCount: 15600,
  },
];

const client = new Client({ connectionString: url });

try {
  await client.connect();
  await client.query("BEGIN");

  // 数据源 upsert
  for (const s of SOURCES) {
    await client.query(
      `INSERT INTO game_sources (code, name, base_url) VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, base_url = EXCLUDED.base_url`,
      [s.code, s.name, s.baseUrl],
    );
  }
  console.log(`sources: ${SOURCES.length} upserted`);

  // 游戏 upsert（按 source_id + source_game_id）
  let n = 0;
  for (const g of GAMES) {
    const { rows } = await client.query(
      "SELECT id FROM game_sources WHERE code = $1",
      [g.source],
    );
    const sourceId = rows[0].id;
    await client.query(
      `INSERT INTO games (
         source_id, source_game_id, title, title_original, slug,
         description, description_original, description_zh, thumbnail,
         game_url, genre, sub_genre, tags, mechanics,
         difficulty, cognitive_load, complexity, pace, stress_level, replayability,
         session_length_min, session_length_max, mood,
         single_player, multiplayer, min_players, max_players,
         desktop, mobile, portrait, game_language, play_count,
         status, metadata_language, published_at
       ) VALUES (
         $1,$2,$3,$4,$5,
         $6,$7,$6,$8,
         $9,$10,$11,$12,$13,
         $14,$15,$16,$17,$18,$19,
         $20,$21,$22,
         $23,$24,$25,$26,
         $27,$28,$29,$30,$31,
         'published','zh', now()
       )
       ON CONFLICT (source_id, source_game_id) DO UPDATE SET
         title = EXCLUDED.title, title_original = EXCLUDED.title_original,
         description = EXCLUDED.description, thumbnail = EXCLUDED.thumbnail,
         game_url = EXCLUDED.game_url, genre = EXCLUDED.genre,
         sub_genre = EXCLUDED.sub_genre, tags = EXCLUDED.tags,
         mechanics = EXCLUDED.mechanics,
         difficulty = EXCLUDED.difficulty, cognitive_load = EXCLUDED.cognitive_load,
         complexity = EXCLUDED.complexity, pace = EXCLUDED.pace,
         stress_level = EXCLUDED.stress_level, replayability = EXCLUDED.replayability,
         session_length_min = EXCLUDED.session_length_min,
         session_length_max = EXCLUDED.session_length_max,
         mood = EXCLUDED.mood, multiplayer = EXCLUDED.multiplayer,
         min_players = EXCLUDED.min_players, max_players = EXCLUDED.max_players,
         desktop = EXCLUDED.desktop, mobile = EXCLUDED.mobile,
         portrait = EXCLUDED.portrait, game_language = EXCLUDED.game_language,
         play_count = EXCLUDED.play_count, updated_at = now()`,
      [
        sourceId, g.sourceGameId, g.title, g.titleOriginal, g.slug,
        g.description, g.description, g.thumbnail,
        g.gameUrl, g.genre, g.subGenre, JSON.stringify(g.tags), JSON.stringify(g.mechanics),
        g.difficulty, g.cognitiveLoad, g.complexity, g.pace, g.stressLevel, g.replayability,
        g.sessionLengthMin, g.sessionLengthMax, JSON.stringify(g.mood),
        g.singlePlayer, g.multiplayer, g.minPlayers, g.maxPlayers,
        g.desktop, g.mobile, g.portrait, g.gameLanguage, g.playCount,
      ],
    );
    n++;
  }
  console.log(`games: ${n} upserted`);

  // GameScore 冷启动占位：playCount 归一化到 5.5~9.5 区间（M6 被
  // 真实行为数据接管）
  await client.query(`
    INSERT INTO game_scores (game_id, total_score, components, sample_size)
    SELECT id,
           5.5 + 4.0 * (play_count::real / NULLIF((SELECT max(play_count) FROM games), 0)),
           '{"cold_start": true}'::jsonb, 0
    FROM games
    WHERE source_id = (SELECT id FROM game_sources WHERE code = 'mock')
    ON CONFLICT (game_id) DO NOTHING
  `);
  console.log("scores: cold-start placeholder written");

  await client.query("COMMIT");
  console.log("seed done");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("FAIL:", err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
