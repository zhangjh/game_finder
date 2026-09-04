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
}

/** 列表查询参数（web → GET /api/games） */
export interface GameListQuery {
  genre?: string;
  /** 单局时长上限（分钟） */
  duration?: number;
  /** 人数，"multi" 表示多人 */
  players?: number | "multi";
  platform?: "mobile" | "desktop";
  q?: string;
  sort?: "popular" | "newest" | "score" | "random";
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
export const SORT_OPTIONS = ["popular", "newest", "score", "random"] as const;

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
