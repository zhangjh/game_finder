/**
 * Playgama 采集 Adapter。
 *
 * 数据源：Playgama Partner 从 widgets.playgama.com 下载的 catalog JSON 文件。
 * 文档：https://wiki.playgama.com/playgama/for-partners/import-the-game-catalog
 *
 * 与 GamePix 的区别：
 * - 无 REST API，数据源为下载的 JSON 文件（segments → hits 结构）
 * - clid 已内嵌于 gameURL（`?clid=p_xxx`），用于流量与收益追踪
 * - 全量数据一次性加载到内存，按 PAGE_SIZE 分页返回
 * - 仅采集英文游戏（supportedLanguages 含 en-US）
 *
 * 环境变量：
 * - PLAYGAMA_CLID：合作伙伴 ID（注册后获得）
 * - PLAYGAMA_CATALOG_PATH：下载的 catalog JSON 文件路径
 */
import { readFileSync } from "node:fs";
import type { NormalizedGameRecord, SourceAdapter } from "./types";

/** 内存分页大小：Playgama 是本地文件，一次加载后按批返回 */
const PAGE_SIZE = 200;

/** Playgama genre → 中文类型（取首 genre 映射；覆盖不了的返回 null 交给 AI） */
const GENRE_ZH: Record<string, string> = {
  action: "动作",
  adventure: "冒险",
  arcade: "街机",
  puzzle: "解谜",
  strategy: "策略",
  racing: "竞速",
  sports: "体育",
  shooting: "射击",
  simulation: "模拟",
  board: "棋盘",
  card: "纸牌",
  casual: "休闲",
  clicker: "放置",
  idle: "放置",
  merge: "合成",
  match: "三消",
  runner: "跑酷",
  platform: "平台跳跃",
  platformer: "平台跳跃",
  fighting: "格斗",
  "dress-up": "换装",
  "make-up": "化妆",
  girls: "女生",
  kids: "儿童",
  cooking: "经营",
  farming: "经营",
  building: "经营",
  decoration: "装扮",
  fashion: "时尚",
  physics: "物理",
  memory: "记忆",
  skill: "技巧",
  brain: "益智",
  io: "IO 对战",
  zombie: "僵尸",
  war: "战争",
  multiplayer: "多人",
  "battle-royale": "大逃杀",
  "tower-defense": "塔防",
  "match-3": "三消",
  "hyper-casual": "超休闲",
  retro: "复古",
  classic: "经典",
  logic: "逻辑",
  maze: "迷宫",
  ball: "球类",
  basketball: "篮球",
  baseball: "棒球",
  football: "足球",
  "american-football": "橄榄球",
  soccer: "足球",
  tennis: "网球",
  bowling: "保龄球",
  boxing: "拳击",
  archery: "射箭",
  bike: "自行车",
  bicycle: "自行车",
  boat: "船",
  airplane: "飞机",
  animals: "动物",
  anime: "动漫",
  army: "军事",
  blocks: "方块",
  bubble: "泡泡",
  "bubble-shooter": "泡泡龙",
  bus: "巴士",
  car: "赛车",
  battleship: "战舰",
  backgammon: "西洋双陆",
  "1v1": "对战",
  "3d": "3D",
  story: "剧情",
  cozy: "休闲",
  funny: "搞笑",
  mobile: "手机",
  mouse: "鼠标",
  "point-and-click": "点击",
  rpg: "RPG",
  roguelike: "Roguelike",
  "hidden-objects": "找隐藏",
  "time-management": "时间管理",
  educational: "教育",
  learning: "学习",
  art: "艺术",
  music: "音乐",
  coloring: "涂色",
  word: "文字",
  quiz: "问答",
  math: "数学",
  "stickman": "火柴人",
  ninja: "忍者",
  sniper: "狙击",
  "first-person-shooter": "射击",
  sandbox: "沙盒",
  survival: "生存",
  horror: "恐怖",
  minecraft: "沙盒",
  "management": "经营",
  restaurant: "经营",
  hospital: "经营",
  hotel: "经营",
  spa: "经营",
  salon: "经营",
  bartender: "经营",
};

/* ---------- 原始 hit 的窄化（JSON 无 schema，逐字段防御） ---------- */

interface RawPlaygamaHit {
  id?: unknown;
  slug?: unknown;
  title?: unknown;
  description?: unknown;
  howToPlayText?: unknown;
  gameURL?: unknown;
  playgamaGameUrl?: unknown;
  genres?: unknown;
  tags?: unknown;
  images?: unknown;
  videos?: unknown;
  mobileReady?: unknown;
  inGamePurchases?: unknown;
  supportedLanguages?: unknown;
  screenOrientation?: unknown;
  embed?: unknown;
}

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** 把 Playgama 缩略图升级为更高清封面（默认 ?width=448 太小） */
function upgradeImageUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === "static.playgama.com") {
      u.searchParams.set("width", "800");
      return u.toString();
    }
  } catch {
    /* 非法 URL 原样返回 */
  }
  return url;
}

/** 确保 gameURL 带有 clid 参数（若已带则不重复） */
function ensureClid(url: string, clid: string): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has("clid")) {
      u.searchParams.set("clid", clid);
      return u.toString();
    }
  } catch {
    /* 非法 URL 原样返回 */
  }
  return url;
}

/**
 * 严格英文过滤：supportedLanguages 中所有语言都必须是英文。
 * 支持多语言（如 en-US + ru-RU）的游戏会被拒绝——
 * Playgama iframe 会根据浏览器语言自动切换，多语言游戏可能显示非英文。
 */
function isEnglishOnlyGame(langs: string[]): boolean {
  if (langs.length === 0) return true;
  return langs.every((l) => l.toLowerCase().startsWith("en"));
}

function normalizeHit(
  raw: RawPlaygamaHit,
  clid: string,
): NormalizedGameRecord | null {
  const sourceGameId = asString(raw.id);
  const title = asString(raw.title);
  const slug = asString(raw.slug);
  const gameUrlRaw = asString(raw.gameURL);
  if (!sourceGameId || !title || !slug || !gameUrlRaw) return null;

  const supportedLanguages = asStringArray(raw.supportedLanguages);
  if (!isEnglishOnlyGame(supportedLanguages)) return null;

  const gameUrl = ensureClid(gameUrlRaw, clid);
  const genres = asStringArray(raw.genres);
  const tags = asStringArray(raw.tags);
  const images = asStringArray(raw.images);
  const mobileReady = asStringArray(raw.mobileReady);

  // thumbnail：优先 big_preview（images[0]），其次 icon（images[1]）
  const thumbnail =
    upgradeImageUrl(images[0] ?? null) ?? upgradeImageUrl(images[1] ?? null);
  // screenshots：所有图片升级后保留
  const screenshots = images
    .map((url) => upgradeImageUrl(url))
    .filter((u): u is string => u != null);

  // 屏幕方向
  const orientation =
    typeof raw.screenOrientation === "object" && raw.screenOrientation !== null
      ? (raw.screenOrientation as { horizontal?: unknown; vertical?: unknown })
      : null;
  const horizontal = orientation?.horizontal === true;
  const vertical = orientation?.vertical === true;
  // 两者都 false 或都 true 视为自适应
  const isAdaptive = horizontal === vertical;
  const portrait = isAdaptive ? true : vertical;
  const landscape = isAdaptive ? true : horizontal;

  // 设备支持：根据 mobileReady 标签推断
  const hasAndroid = mobileReady.some((m) => m.toLowerCase().includes("android"));
  const hasIOS = mobileReady.some((m) => m.toLowerCase().includes("ios"));
  const hasDesktop = mobileReady.some((m) => m.toLowerCase().includes("desktop"));
  // 无 mobileReady 信息时默认双端支持
  const mobile = mobileReady.length > 0 ? hasAndroid || hasIOS : true;
  const desktop = mobileReady.length > 0 ? hasDesktop : true;

  // category：取首 genre 作为主分类
  const category = genres.length > 0 ? genres[0] : null;

  return {
    sourceGameId,
    titleOriginal: title,
    slug: slug.toLowerCase(),
    descriptionOriginal: asString(raw.description) ?? "",
    thumbnail,
    screenshots,
    gameUrl,
    category,
    genre: category ? (GENRE_ZH[category] ?? null) : null,
    rawTags: [...new Set([...genres, ...tags])],
    releaseDate: null,
    sourceUpdatedAt: null,
    qualityScore: null,
    portrait,
    landscape,
    mobile,
    desktop,
  };
}

/** Playgama catalog JSON 顶层结构 */
interface CatalogJson {
  segments?: Array<{
    hits?: RawPlaygamaHit[];
  }>;
}

export function createPlaygamaAdapter(): SourceAdapter {
  const clid = process.env.PLAYGAMA_CLID;
  const catalogPath =
    process.env.PLAYGAMA_CATALOG_PATH ?? "data/playgama-catalog.json";

  if (!clid) {
    throw new Error(
      "PLAYGAMA_CLID 环境变量未设置（Playgama 合作伙伴 ID，注册后获得）",
    );
  }
  // 赋值后 TypeScript 在嵌套函数内不会自动收窄 const，显式赋值确保类型安全
  const partnerClid: string = clid;

  /** 懒加载：首次 fetchPage 时读取并标准化全部记录 */
  let cachedRecords: NormalizedGameRecord[] | null = null;

  function loadCatalog(): NormalizedGameRecord[] {
    if (cachedRecords) return cachedRecords;

    const raw = readFileSync(catalogPath, "utf-8");
    const data = JSON.parse(raw) as CatalogJson;
    const hits = (data.segments ?? []).flatMap((seg) => seg.hits ?? []);

    const records: NormalizedGameRecord[] = [];
    for (const hit of hits) {
      const rec = normalizeHit(hit, partnerClid);
      if (rec) records.push(rec);
    }

    console.log(
      `[playgama] catalog loaded: ${hits.length} total hits, ${records.length} after English filter`,
    );
    cachedRecords = records;
    return records;
  }

  async function fetchPage(
    page: number,
  ): Promise<NormalizedGameRecord[] | null> {
    const records = loadCatalog();
    const start = (page - 1) * PAGE_SIZE;
    if (start >= records.length) return null;
    const end = Math.min(start + PAGE_SIZE, records.length);
    return records.slice(start, end);
  }

  return { code: "playgama", name: "Playgama", fetchPage };
}
