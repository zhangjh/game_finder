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

/** 体验属性 → 中文标签 */
export function ratingLabel(value: number): string {
  const labels = ["", "很简单", "简单", "普通", "困难", "很硬核"];
  return labels[value] ?? "普通";
}

export function sessionLabel(
  min?: number | null,
  max?: number | null,
): string {
  if (min == null || max == null) return "时长未知";
  return `${min}~${max}分钟`;
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
