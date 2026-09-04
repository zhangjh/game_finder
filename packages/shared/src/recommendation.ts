/**
 * AI Game Finder 推荐契约（M5，PRD §19/§22/§42/§43）。
 *
 * GameIntent 是 Intent Parser 的结构化输出，前后端共享：
 * - server：zod schema（lib/recommendation/intent-parser.ts）以此类型为源
 * - web：快捷 chips 构造 intent、展示解析结果
 */
import type { GameListItem } from "./index";

/** 心情标签白名单（与 games.mood 列、analyze-game.ts MOOD_WHITELIST 对齐） */
export const MOOD_VALUES = [
  "casual",
  "relaxing",
  "focus",
  "brain_burn",
  "exciting",
  "competitive",
  "nostalgic",
  "chill",
] as const;

export type Mood = (typeof MOOD_VALUES)[number];

/** 心情 → 中文标签 */
export const MOOD_LABELS: Record<Mood, string> = {
  casual: "休闲",
  relaxing: "放松",
  focus: "专注",
  brain_burn: "烧脑",
  exciting: "刺激",
  competitive: "竞技",
  nostalgic: "怀旧",
  chill: "治愈",
};

/**
 * 结构化游戏意图（PRD §22）。
 * 所有字段可选——只填用户明确表达或强烈暗示的条件；
 * 1~5 的体验属性提供 min/max 两个方向（"简单一点"= max 降低，"够硬核"= min 提升）。
 */
export interface GameIntent {
  /** 单局时长下限（分钟） */
  sessionLengthMin?: number;
  /** 单局时长上限（分钟） */
  sessionLengthMax?: number;
  mood?: Mood[];
  /** 难度 1~5（1=极简 5=硬核） */
  difficultyMin?: number;
  difficultyMax?: number;
  /** 认知负担 1~5 */
  cognitiveLoadMin?: number;
  cognitiveLoadMax?: number;
  /** 复杂度 1~5 */
  complexityMin?: number;
  complexityMax?: number;
  /** 人数（如 2 = 两个人玩） */
  players?: number;
  platform?: "mobile" | "desktop";
  orientation?: "portrait" | "landscape";
  /** 参考游戏名（原文，如"植物大战僵尸"），由服务端解析为站内游戏 */
  similarTo?: string;
  /** 中文类型名（与 games.genre 白名单对齐） */
  genre?: string;
  /** 负向偏好（英文 snake_case，如 grinding/horror/pvp） */
  negativePreference?: string[];
  /** "随便推荐一个" */
  random?: boolean;
}

/** 快捷条件（PRD §21/§20.1）：预定义 GameIntent，不走 LLM */
export interface QuickCondition {
  id: string;
  icon: string;
  label: string;
  intent: GameIntent;
}

export const QUICK_CONDITIONS: QuickCondition[] = [
  { id: "5min", icon: "⚡", label: "5分钟", intent: { sessionLengthMax: 5 } },
  {
    id: "relax",
    icon: "😌",
    label: "放松",
    intent: { mood: ["relaxing"], cognitiveLoadMax: 2 },
  },
  {
    id: "brain",
    icon: "🧠",
    label: "烧脑",
    intent: { mood: ["brain_burn"], cognitiveLoadMin: 4 },
  },
  { id: "2p", icon: "👥", label: "双人", intent: { players: 2 } },
  { id: "mobile", icon: "📱", label: "手机", intent: { platform: "mobile" } },
  { id: "random", icon: "🎲", label: "随便来一个", intent: { random: true } },
];

/** Hybrid Ranking 各分项得分（PRD §42/§44，可解释性依据） */
export interface ScoreDetail {
  total: number;
  intentMatch: number;
  semantic: number;
  gameScore: number;
  popularity: number;
  freshness: number;
}

/** 推荐结果单项 */
export interface RecommendItem {
  game: GameListItem;
  /** 模板化推荐理由（PRD §44） */
  reason: string;
  score: number;
  scoreDetail: ScoreDetail;
}

/** POST /api/recommend 请求体 */
export interface RecommendRequestBody {
  /** 自然语言输入（与 quick 二选一） */
  input?: string;
  /** 快捷条件 id（QUICK_CONDITIONS 之一，不走 LLM） */
  quick?: string;
}

/** POST /api/recommend 响应 */
export interface RecommendResponse {
  requestId: number;
  /** Intent 解析是否成功；失败时走降级（快捷条件建议） */
  parsedOk: boolean;
  intent: GameIntent | null;
  /** similarTo 是否在站内命中参考游戏（命中时携带） */
  referenceGame: { id: number; slug: string; title: string } | null;
  /** 硬过滤后不足 3 款时的放宽提示 */
  relaxed: boolean;
  items: RecommendItem[];
}
