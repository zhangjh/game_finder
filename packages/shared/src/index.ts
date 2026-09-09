/**
 * 前后端共享的 API 契约类型。
 * server（lib/games/queries.ts）返回、web（API client）消费的数据形状，
 * 改动此处需两边同步确认。
 */

/** 列表/卡片展示所需的游戏字段（games + game_scores 联查投影） */
export interface GameListItem {
  id: number;
  slug: string;
  title: string;
  titleOriginal: string;
  description: string;
  thumbnail: string | null;
  genre: string | null;
  /** JSON 数组字符串（保持 DB 原样传输，前端解析） */
  tags: string;
  /** 体验属性 1~5（PRD §12） */
  difficulty: number;
  cognitiveLoad: number;
  sessionLengthMin: number | null;
  sessionLengthMax: number | null;
  multiplayer: boolean;
  minPlayers: number;
  maxPlayers: number;
  mobile: boolean;
  playCount: number;
  gameLanguage: string;
  /** GameScore，冷启动时为 null */
  totalScore: number | null;
  /** 源站官方质量分（GamePix quality_score，0~1），缺失为 null */
  sourceQualityScore: number | null;
}

/** 详情页完整字段（games 全行 + totalScore） */
export interface GameDetail {
  id: number;
  slug: string;
  title: string;
  titleOriginal: string;
  description: string;
  /** 源站原始简介（英文）；英文界面优先展示 */
  descriptionOriginal: string;
  descriptionZh: string;
  thumbnail: string | null;
  developer: string | null;
  publisher: string | null;
  releaseDate: string | null;
  /** JSON 数组字符串（Web 用 parseJsonArray 解析；游戏画面/封面 URL 列表） */
  screenshots: string;
  gameUrl: string;
  genre: string | null;
  subGenre: string | null;
  tags: string;
  mechanics: string;
  mood: string;
  difficulty: number;
  cognitiveLoad: number;
  complexity: number;
  pace: number;
  stressLevel: number;
  replayability: number;
  sessionLengthMin: number | null;
  sessionLengthMax: number | null;
  multiplayer: boolean;
  minPlayers: number;
  maxPlayers: number;
  desktop: boolean;
  mobile: boolean;
  portrait: boolean;
  gameLanguage: string;
  metadataLanguage: string;
  playCount: number;
  totalScore: number | null;
  sourceQualityScore: number | null;
}

/** 列表查询参数（web → GET /api/games） */
export interface GameListQuery {
  /**
   * 界面语种（T1.7）：
   * - zh：只返回有中文元数据的游戏（metadata_language='zh'）
   * - en：返回全部已发布游戏（英文原始字段 title_original 恒存在）
   */
  lang?: "zh" | "en";
  genre?: string;
  /** 单局时长上限（分钟） */
  duration?: number;
  /** 人数，"multi" 表示多人 */
  players?: number | "multi";
  platform?: "mobile" | "desktop";
  /** AI 心情画像标签 */
  mood?: "relaxing";
  q?: string;
  sort?: "popular" | "newest" | "score" | "random" | "quality";
  /** 源站质量分下限（strict：> 该值），如 0.9 只看原始质量 90+ 的游戏 */
  minQualityScore?: number;
  page?: number;
  pageSize?: number;
}

/** 列表响应 */
export interface GameListResponse {
  items: GameListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 排序选项（PRD §33） */
export const SORT_OPTIONS = ["popular", "newest", "score", "random", "quality"] as const;

/* ===== T1.7 多语言：界面语种 ===== */

export type UiLang = "zh" | "en";

/** 体验属性 → 标签（lang 缺省中文） */
export function ratingLabel(value: number, lang: UiLang = "zh"): string {
  if (lang === "en") {
    const labels = ["", "Very easy", "Easy", "Normal", "Hard", "Hardcore"];
    return labels[value] ?? "Normal";
  }
  const labels = ["", "很简单", "简单", "普通", "困难", "很硬核"];
  return labels[value] ?? "普通";
}

export function sessionLabel(
  min?: number | null,
  max?: number | null,
  lang: UiLang = "zh",
): string {
  if (min == null || max == null)
    return lang === "en" ? "Length unknown" : "时长未知";
  return lang === "en" ? `${min}-${max} min` : `${min}~${max}分钟`;
}

/**
 * genre 中文值 → 英文标签（与 server GENRE_WHITELIST / 采集器 CATEGORY_ZH 对齐）。
 * 未收录的值原样返回（如 "Roguelike"）。
 */
export const GENRE_LABELS_EN: Record<string, string> = {
  街机: "Arcade",
  解谜: "Puzzle",
  休闲: "Casual",
  超休闲: "Hyper-casual",
  冒险: "Adventure",
  动作: "Action",
  射击: "Shooter",
  平台跳跃: "Platformer",
  体育: "Sports",
  三消: "Match-3",
  益智: "Brain",
  棋盘: "Board",
  记忆: "Memory",
  双人: "2 Player",
  换装: "Dress Up",
  竞速: "Racing",
  放置: "Idle",
  跑酷: "Runner",
  技巧: "Skill",
  策略: "Strategy",
  女生: "Girls",
  模拟: "Simulation",
  模拟经营: "Management",
  僵尸: "Zombie",
  格斗: "Fighting",
  纸牌: "Card",
  "IO 对战": "IO Battle",
  战争: "War",
  塔防: "Tower Defense",
  音乐: "Music",
  教育: "Education",
  其他: "Other",
};

/** 按界面语种展示类型名（DB 存中文 genre 值） */
export function genreLabel(genre: string | null, lang: UiLang = "zh"): string {
  if (!genre) return lang === "en" ? "Uncategorized" : "未分类";
  if (lang === "en") return GENRE_LABELS_EN[genre] ?? genre;
  return genre;
}

/**
 * 按界面语种展示游戏名：
 * 英文界面优先原始英文名（源站恒有），中文界面用中文展示名。
 */
export function displayTitle(
  game: Pick<GameListItem, "title" | "titleOriginal">,
  lang: UiLang,
): string {
  if (lang === "en") return game.titleOriginal || game.title;
  return game.title;
}

export function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** AI Game Finder 推荐契约（M5） */
export * from "./recommendation";

/** SEO 专题页配置（M7） */
export * from "./seo";

/**
 * 游戏续玩存档 API 契约（M6.5）。
 * data 为 GamePix externalSave 存档原始字符串（player localStorage[namespace]
 * 的 JSON.stringify 值）；无存档时为 null。
 */
export interface GameSaveResponse {
  data: string | null;
  updatedAt: string | null;
  /** 是否有存档（无存档 / 无法识别身份时为 false） */
  saved: boolean;
}

/** PUT /api/games/:slug/save 请求体 */
export interface GameSavePutBody {
  data: string;
}

export interface GameSavePutResponse {
  saved: boolean;
}
