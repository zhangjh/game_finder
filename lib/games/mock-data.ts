/**
 * M1 阶段的 mock 数据与类型定义。
 * M2 起由 Drizzle schema + 数据库查询替换，类型字段与 PRD §10~16 对齐。
 */

export type GameCardData = {
  id: number;
  slug: string;
  title: string;
  titleOriginal: string;
  description: string;
  thumbnail: string;
  gameUrl: string;
  genre: string;
  subGenre: string;
  tags: string[];
  mechanics: string[];
  /** 体验属性，1~5 */
  difficulty: number;
  cognitiveLoad: number;
  complexity: number;
  pace: number;
  stressLevel: number;
  replayability: number;
  /** 单局时长（分钟） */
  sessionLengthMin: number;
  sessionLengthMax: number;
  mood: string[];
  players: { min: number; max: number };
  multiplayer: boolean;
  desktop: boolean;
  mobile: boolean;
  portrait: boolean;
  /** GameScore v0（M6 前为静态演示值） */
  score: number;
  plays: number;
  language: "zh" | "en";
  publishedAt: string;
};

/** 1~5 体验属性 → 中文标签 */
export function ratingLabel(value: number): string {
  const labels = ["", "很简单", "简单", "普通", "困难", "很硬核"];
  return labels[value] ?? "普通";
}

export function sessionLabel(min: number, max: number): string {
  return `${min}~${max}分钟`;
}

/** mock 缩略图：本地纯色占位，M3 接真实图源 */
const thumb = (seed: string, color: string) =>
  `/placeholder.svg?seed=${seed}&color=${encodeURIComponent(color)}`;

export const mockGames: GameCardData[] = [
  {
    id: 1,
    slug: "tower-defense-lite",
    title: "轻量塔防",
    titleOriginal: "Tower Defense Lite",
    description:
      "保护你的基地，抵御不断来袭的敌人。波次紧凑，上手即玩，适合碎片时间。",
    thumbnail: thumb("tdl", "%236d5cf6"),
    gameUrl: "about:blank",
    genre: "塔防",
    subGenre: "休闲策略",
    tags: ["塔防", "策略", "单机"],
    mechanics: ["resource_management", "wave_defense", "tower_upgrade"],
    difficulty: 2,
    cognitiveLoad: 2,
    complexity: 2,
    pace: 3,
    stressLevel: 2,
    replayability: 4,
    sessionLengthMin: 5,
    sessionLengthMax: 15,
    mood: ["casual", "focus"],
    players: { min: 1, max: 1 },
    multiplayer: false,
    desktop: true,
    mobile: true,
    portrait: false,
    score: 8.6,
    plays: 12300,
    language: "en",
    publishedAt: "2026-08-20",
  },
  {
    id: 2,
    slug: "zen-match",
    title: "禅意消除",
    titleOriginal: "Zen Match",
    description:
      "慢节奏的三消游戏，没有倒计时压力。配上轻音乐，适合一天结束时放松大脑。",
    thumbnail: thumb("zm", "%2310b981"),
    gameUrl: "about:blank",
    genre: "休闲",
    subGenre: "消除",
    tags: ["消除", "放松", "无压力"],
    mechanics: ["match_3", "no_timer"],
    difficulty: 1,
    cognitiveLoad: 1,
    complexity: 1,
    pace: 1,
    stressLevel: 1,
    replayability: 3,
    sessionLengthMin: 5,
    sessionLengthMax: 30,
    mood: ["relaxing", "casual"],
    players: { min: 1, max: 1 },
    multiplayer: false,
    desktop: true,
    mobile: true,
    portrait: true,
    score: 9.1,
    plays: 28400,
    language: "zh",
    publishedAt: "2026-08-25",
  },
  {
    id: 3,
    slug: "rogue-survivor-easy",
    title: "轻松幸存者",
    titleOriginal: "Rogue Survivor Easy",
    description:
      "类 Vampire Survivors 玩法，但节奏更慢、数值更友好，一局 10 分钟。",
    thumbnail: thumb("rse", "%23f59e0b"),
    gameUrl: "about:blank",
    genre: "Roguelike",
    subGenre: "幸存者",
    tags: ["Roguelike", "割草", "轻度"],
    mechanics: ["auto_attack", "build_crafting", "wave_survival"],
    difficulty: 2,
    cognitiveLoad: 2,
    complexity: 2,
    pace: 3,
    stressLevel: 2,
    replayability: 5,
    sessionLengthMin: 10,
    sessionLengthMax: 15,
    mood: ["casual", "exciting"],
    players: { min: 1, max: 1 },
    multiplayer: false,
    desktop: true,
    mobile: true,
    portrait: true,
    score: 8.8,
    plays: 19800,
    language: "en",
    publishedAt: "2026-08-28",
  },
  {
    id: 4,
    slug: "pvp-pong-duo",
    title: "双人对战乒乓",
    titleOriginal: "PvP Pong Duo",
    description:
      "经典乒乓对战，同屏双人。一局一分，随时开打，适合和朋友轮流守擂。",
    thumbnail: thumb("ppd", "%23ef4444"),
    gameUrl: "about:blank",
    genre: "对战",
    subGenre: "体育",
    tags: ["双人", "对战", "同屏"],
    mechanics: ["local_pvp", "reflex"],
    difficulty: 2,
    cognitiveLoad: 2,
    complexity: 1,
    pace: 4,
    stressLevel: 3,
    replayability: 4,
    sessionLengthMin: 2,
    sessionLengthMax: 10,
    mood: ["exciting", "competitive"],
    players: { min: 1, max: 2 },
    multiplayer: true,
    desktop: true,
    mobile: false,
    portrait: false,
    score: 7.9,
    plays: 8700,
    language: "zh",
    publishedAt: "2026-08-15",
  },
  {
    id: 5,
    slug: "deep-puzzle-grid",
    title: "烧脑数字谜阵",
    titleOriginal: "Deep Puzzle Grid",
    description:
      "基于数独变体的逻辑谜题，难度递进。适合喜欢安静思考的玩家。",
    thumbnail: thumb("dpg", "%230ea5e9"),
    gameUrl: "about:blank",
    genre: "解谜",
    subGenre: "逻辑",
    tags: ["解谜", "逻辑", "思考"],
    mechanics: ["logic_deduction", "grid"],
    difficulty: 4,
    cognitiveLoad: 4,
    complexity: 3,
    pace: 1,
    stressLevel: 1,
    replayability: 4,
    sessionLengthMin: 10,
    sessionLengthMax: 30,
    mood: ["focus", "brain_burn"],
    players: { min: 1, max: 1 },
    multiplayer: false,
    desktop: true,
    mobile: true,
    portrait: true,
    score: 8.2,
    plays: 6400,
    language: "en",
    publishedAt: "2026-08-30",
  },
  {
    id: 6,
    slug: "merge-farm-idle",
    title: "合并农场",
    titleOriginal: "Merge Farm Idle",
    description:
      "合成升级作物，挂机也有产出。想肝可以肝，想闲可以闲。",
    thumbnail: thumb("mfi", "%2322c55e"),
    gameUrl: "about:blank",
    genre: "休闲",
    subGenre: "合成挂机",
    tags: ["合成", "挂机", "经营"],
    mechanics: ["merge", "idle_progression"],
    difficulty: 1,
    cognitiveLoad: 1,
    complexity: 2,
    pace: 2,
    stressLevel: 1,
    replayability: 4,
    sessionLengthMin: 10,
    sessionLengthMax: 60,
    mood: ["relaxing", "casual"],
    players: { min: 1, max: 1 },
    multiplayer: false,
    desktop: true,
    mobile: true,
    portrait: true,
    score: 8.0,
    plays: 15600,
    language: "zh",
    publishedAt: "2026-08-10",
  },
];

export function getGameBySlug(slug: string): GameCardData | undefined {
  return mockGames.find((g) => g.slug === slug);
}
