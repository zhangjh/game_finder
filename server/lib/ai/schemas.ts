import { z } from "zod";

/** 体验属性 1~5 */
const experienceRating = z.number().int().min(1).max(5);

/**
 * AI 画像分析输出 Schema（PRD §17）。
 * LLM 必须输出符合此结构的 JSON，否则 zod 校验失败触发重试。
 */
export const gameProfileSchema = z.object({
  /** 中文游戏名（简短有吸引力） */
  titleZh: z.string().min(1).max(100),

  /** 中文游戏简介（2~4 句话，突出卖点） */
  descriptionZh: z.string().min(10).max(500),

  /** 游戏类型（中文）：如 塔防 / Roguelike / 解谜 / 射击 / 动作 / 模拟 */
  genre: z.string().min(1),

  /** 子类型（可选） */
  subGenre: z.string().optional(),

  /** 标签数组（中文，如 ["策略","单机","休闲"]） */
  tags: z.array(z.string()).min(1).max(10),

  /** 核心玩法机制（英文 snake_case，如 ["tower_defense","resource_management"]） */
  mechanics: z.array(z.string()).min(1).max(10),

  /** 体验属性 */
  difficulty: experienceRating,
  cognitiveLoad: experienceRating,
  complexity: experienceRating,
  pace: experienceRating,
  stressLevel: experienceRating,
  replayability: experienceRating,

  /** 建议单局时长（分钟） */
  sessionLengthMin: z.number().int().min(1).max(480),
  sessionLengthMax: z.number().int().min(1).max(480),

  /** 心情标签（英文 snake_case） */
  mood: z.array(z.string()).min(1).max(5),

  /** 玩家人数 */
  minPlayers: z.number().int().min(1).max(16),
  maxPlayers: z.number().int().min(1).max(16),
  coop: z.boolean(),
  competitive: z.boolean(),

  /** 设备支持 */
  desktop: z.boolean(),
  mobile: z.boolean(),
  tablet: z.boolean(),

  /** 操控方式 */
  inputMethods: z.array(z.enum(["mouse", "keyboard", "touch", "gamepad"])),

  /** 游戏本体语言（如 "en", "ja", "zh"） */
  gameLanguage: z.string().min(2).max(5),
});

export type GameProfile = z.infer<typeof gameProfileSchema>;
