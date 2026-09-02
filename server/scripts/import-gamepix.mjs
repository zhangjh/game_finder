/**
 * 一键导入 GamePix 真实游戏（开发/验证用）。
 * 从你的 GamePix feed（见 dashboard）拉取前 N 个游戏，映射到 games 表并发布。
 * 关键：game_url 使用 GamePix 的 embed 链接，使前台「开始游戏」真正加载游戏。
 *
 * 用法：
 *   pnpm import:gamepix                 # 默认 24 款
 *   pnpm import:gamepix -- --limit 48   # 拉取 48 款
 *
 * 说明：本脚本是 M3 采集器（lib/games/collectors/）正式落地前的快速闭环。
 * 体验属性（difficulty 等）暂用默认值填充，待 M4 AI 画像接管。
 * 幂等：按 (source_id, source_game_id) upsert，可重复执行。
 */
import { Client } from "pg";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/game_discovery";

const FEED_BASE = "https://feeds.gamepix.com/v2/json?sid=7E317&pagination=12";

// 默认导入数量（feed 每页最多 12，反正我们只取前 limit 个）
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = Number(limitArg?.split("=")[1]) || 24;

// GamePix category → 站点中文 genre（对应前台筛选标签）。
// 未匹配到的落入「休闲」（网页休闲游戏绝大多数）。
const GENRE_MAP = {
  "match-3": "休闲",
  puzzle: "解谜",
  "hyper-casual": "休闲",
  arcade: "休闲",
  "clicker": "休闲",
  "building": "经营",
  "simulation": "经营",
  "strategy": "策略",
  "tower-defense": "塔防",
  racing: "竞速",
  sports: "体育",
  action: "动作",
  adventure: "冒险",
  card: "卡牌",
  board: "棋牌",
  io: "对战",
  "multiplayer": "对战",
  "defense": "塔防",
  "farming": "经营",
  "idle": "经营",
  "shooting": "动作",
  "girl": "休闲",
  "cooking": "经营",
  "dressup": "休闲",
  "jump": "休闲",
  "runner": "休闲",
  "skill": "休闲",
  "memory": "休闲",
  "word": "休闲",
  "quiz": "休闲",
  "math": "休闲",
};

const client = new Client({ connectionString: url });

/** 从 feed 拉取一页 */
async function fetchPage(page) {
  const res = await fetch(`${FEED_BASE}&page=${page}`);
  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
  return res.json();
}

/** 由 namespace 生成 URL 安全的 slug */
function slugify(ns) {
  return ns.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

try {
  await client.connect();

  // 拿到 gamepix source 行
  const src = (
    await client.query("SELECT id FROM game_sources WHERE code = 'gamepix'")
  ).rows[0];
  if (!src) {
    // 兜底：注册 gamepix 数据源（seed 里已注册，这里防御一下）
    const { rows } = await client.query(
      `INSERT INTO game_sources (code, name, base_url)
       VALUES ('gamepix', 'GamePix', 'https://feeds.gamepix.com')
       ON CONFLICT (code) DO NOTHING RETURNING id`,
    );
    if (rows.length === 0) throw new Error("缺少 gamepix 数据源，请先跑 pnpm db:seed");
    src = rows[0];
  }
  const sourceId = src.id;

  // 逐页拉取直到凑够 limit（或读完 feed）
  const games = [];
  let page = 1;
  while (games.length < LIMIT) {
    const data = await fetchPage(page);
    const items = data.items ?? [];
    if (items.length === 0) break;
    for (const g of items) {
      games.push(g);
      if (games.length >= LIMIT) break;
    }
    if (!data.next_url) break;
    page++;
  }

  console.log(`fetched ${games.length} games from GamePix feed`);

  // feed 中一个 namespace 可能出现多次（不同 game id），按 namespace 去重避免 slug 冲突
  const seen = new Set();
  const unique = games.filter((g) => {
    const ns = g.namespace || g.id;
    if (seen.has(ns)) return false;
    seen.add(ns);
    return true;
  });

  await client.query("BEGIN");

  let inserted = 0;
  let updated = 0;
  for (const g of unique) {
    const ns = g.namespace || g.id;
    const slug = slugify(ns);
    const originalTitle = g.title ?? ns;
    const portrait = g.orientation === "portrait" ? true : g.orientation === "all" ? false : false;
    const landscape = g.orientation === "landscape" ? true : g.orientation !== "portrait";
    // 竖屏游戏更适合手机，横屏/自适应更适合电脑；保守起见两者都开，便于筛选
    const mobile = true;
    const desktop = true;

    // playCount：演示用确定性伪随机（来源 quality_score），让真游戏能进「热门」
    const playCount = Math.round((g.quality_score ?? 0.9) * 20000);

    const { rows } = await client.query(
      `INSERT INTO games (
         source_id, source_game_id, title, title_original, slug,
         description, description_original, description_zh, thumbnail,
         game_url, genre, tags, mechanics, difficulty, cognitive_load,
         complexity, pace, stress_level, replayability,
         desktop, mobile, portrait, landscape, game_language, play_count,
         status, metadata_language, published_at
       ) VALUES (
         $1,$2,$3,$4,$5,
         $6,$6,'',$7,
         $8,$9,$10,$11,3,3,3,3,3,3,
         $13,$12,$14,$15,'en',$16,
         'published','en', now()
       )
       ON CONFLICT (source_id, source_game_id) DO UPDATE SET
         title = EXCLUDED.title, title_original = EXCLUDED.title_original,
         slug = EXCLUDED.slug, description = EXCLUDED.description,
         thumbnail = EXCLUDED.thumbnail, game_url = EXCLUDED.game_url,
         genre = EXCLUDED.genre, tags = EXCLUDED.tags,
         portrait = EXCLUDED.portrait, landscape = EXCLUDED.landscape,
         play_count = EXCLUDED.play_count,
         updated_at = now()
       RETURNING (xmax = 0) AS is_insert`,
      [
        sourceId, g.id, originalTitle, originalTitle, slug,
        g.description || "", g.banner_image || g.image || null,
        g.url, GENRE_MAP[g.category] ?? "休闲",
        JSON.stringify([]), JSON.stringify([]),
        mobile, desktop, portrait, landscape, playCount,
      ],
    );
    if (rows[0].is_insert) inserted++;
    else updated++;
  }

  console.log(`games: ${inserted} inserted, ${updated} updated`);

  // GameScore 冷启动占位：让真游戏在「今日推荐/评分排序」里也能冒头。
  // M6 之后由真实行为数据接管。
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
  console.log("scores: cold-start placeholder written for GamePix games");

  await client.query("COMMIT");
  console.log("import done — 现在访问前台即可玩到真实 GamePix 游戏");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("FAIL:", err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
