/**
 * 过滤与排序（T5.3，PRD §42 Filter/Ranking）。
 *
 * Hard Filter（不可放宽）：玩家人数 / 设备 / 横竖屏 / 游戏状态（召回已限定 published）。
 * 软条件（时长/心情/难度上限）不满足不排除，交给 intentMatch 评分；
 * 不足 MIN_RESULTS 时逐级放宽软条件兜底（绝不空转）。
 *
 * Hybrid Ranking 初版（PRD §42）：
 *   Score = Intent Match + Semantic Similarity + GameScore + Popularity + Freshness
 * 权重见 config.ts（M6 有行为数据后调参）。
 */
import type { ScoreDetail } from "@game-finder/shared";
import type { GameIntent } from "@game-finder/shared";
import type { ReferenceGame } from "./intent-parser";
import type { RecallCandidate } from "./recall";
import { MIN_RESULTS, RANKING_WEIGHTS, TOP_N } from "./config";

/** parseJsonArray 的本地副本（避免依赖 web 侧 shared 工具的行为差异） */
function parseArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/* ===== Hard Filter ===== */

/** 负向偏好匹配（PRD §5 场景 G：降低排序而非排除） */
function negativePenalty(
  game: RecallCandidate,
  negatives: string[],
): number {
  if (negatives.length === 0) return 0;
  const hay = [
    ...parseArray(game.mechanics),
    ...parseArray(game.tags),
  ]
    .join(" ")
    .toLowerCase();
  const hits = negatives.filter((n) =>
    hay.includes(n.toLowerCase().replace(/[\s-]+/g, "_")),
  ).length;
  return Math.min(0.6, hits * 0.3);
}

/**
 * 硬条件过滤。strict=false 时放宽软硬边界（时长等），仅保留不可妥协条件。
 * 返回 [通过列表, 是否发生放宽]。
 */
export function hardFilter(
  candidates: RecallCandidate[],
  intent: GameIntent,
  strict: boolean,
): RecallCandidate[] {
  return candidates.filter((g) => {
    // 人数：minPlayers <= N <= maxPlayers（不可放宽，PRD §42 硬条件）
    if (typeof intent.players === "number") {
      if (g.minPlayers > intent.players || g.maxPlayers < intent.players)
        return false;
    }
    // 设备（不可放宽）
    if (intent.platform === "mobile" && !g.mobile) return false;
    if (intent.platform === "desktop" && !g.desktop) return false;
    if (intent.orientation === "portrait" && !g.portrait) return false;

    // 时长上限：游戏明确 min > 用户上限 → 排除；min 未知时保留（宽松）
    // relaxed 模式完全放宽时长（宁可推荐长游戏也不空结果）
    if (strict && intent.sessionLengthMax != null) {
      if (g.sessionLengthMin != null && g.sessionLengthMin > intent.sessionLengthMax)
        return false;
    }
    if (strict && intent.sessionLengthMin != null) {
      if (g.sessionLengthMax != null && g.sessionLengthMax < intent.sessionLengthMin)
        return false;
    }
    return true;
  });
}

/* ===== Intent Match（结构化命中度 0~1）===== */

/** 区间命中：值在 [min,max] 内得 1，每超 1 级扣 0.4，未知（null）得 0.5 */
function rangeScore(
  value: number | null,
  min: number | undefined,
  max: number | undefined,
): number | undefined {
  if (min == null && max == null) return undefined;
  if (value == null) return 0.5;
  let s = 1;
  if (max != null && value > max) s -= 0.4 * (value - max);
  if (min != null && value < min) s -= 0.4 * (min - value);
  return Math.max(0, s);
}

export function intentMatchScore(
  g: RecallCandidate,
  intent: GameIntent,
  reference: ReferenceGame | null,
): number {
  const parts: number[] = [];

  // 时长（sessionLengthMin/Max 对游戏的 [min,max] 区间）
  if (intent.sessionLengthMax != null || intent.sessionLengthMin != null) {
    const upper = rangeScore(
      g.sessionLengthMin,
      undefined,
      intent.sessionLengthMax,
    );
    const lower = rangeScore(
      g.sessionLengthMax,
      intent.sessionLengthMin,
      undefined,
    );
    const vals = [upper, lower].filter((v): v is number => v != null);
    if (vals.length) parts.push(Math.min(...vals));
  }

  // 心情：交集比例
  if (intent.mood?.length) {
    const gameMoods = parseArray(g.mood);
    const hit = intent.mood.filter((m) => gameMoods.includes(m)).length;
    parts.push(hit / intent.mood.length);
  }

  // 体验属性上下限
  for (const [
    val,
    min,
    max,
  ] of [
    [g.difficulty, intent.difficultyMin, intent.difficultyMax],
    [g.cognitiveLoad, intent.cognitiveLoadMin, intent.cognitiveLoadMax],
    [g.complexity, intent.complexityMin, intent.complexityMax],
  ] as const) {
    const s = rangeScore(val, min, max);
    if (s != null) parts.push(s);
  }

  // 类型
  if (intent.genre) {
    parts.push(g.genre === intent.genre ? 1 : 0);
  }

  // 设备/人数（hard filter 已保证 1，但保留计分使权重直观）
  if (intent.platform) parts.push(intent.platform === "mobile" ? (g.mobile ? 1 : 0) : (g.desktop ? 1 : 0));
  if (typeof intent.players === "number") parts.push(1);

  // similar_to：参考游戏的结构相似度（genre 相同 + 机制交集 + 难度距离）
  if (reference) {
    let s = 0;
    if (g.genre && g.genre === reference.genre) s += 0.5;
    const myMechanics = parseArray(g.mechanics);
    const refMechanics = parseArray(reference.mechanics);
    if (refMechanics.length > 0) {
      const overlap = refMechanics.filter((m) => myMechanics.includes(m)).length;
      s += 0.5 * Math.min(1, overlap / Math.min(3, refMechanics.length));
    }
    if (intent.difficultyMax != null && reference.difficulty > intent.difficultyMax) {
      // "但简单一点"：比参考游戏更简单者加分
      s += g.difficulty <= reference.difficulty ? 0.2 : 0;
    }
    parts.push(Math.min(1, s));
  }

  if (parts.length === 0) return 0.5; // 无条件 intent（random）：中性分
  const base = parts.reduce((a, b) => a + b, 0) / parts.length;

  // 负向偏好降权（PRD §5 场景 G）
  const penalty = negativePenalty(g, intent.negativePreference ?? []);
  return Math.max(0, base * (1 - penalty));
}

/* ===== 其余分项 ===== */

function popularityScore(playCount: number): number {
  // log 归一：playCount 999 ≈ 1.0；冷启动全 0 → 0
  return Math.min(1, Math.log10(1 + playCount) / 3);
}

function freshnessScore(publishedAt: Date | null): number {
  if (!publishedAt) return 0.5;
  const days = (Date.now() - publishedAt.getTime()) / 86_400_000;
  return Math.exp(-days / 30); // 半衰期 ~21 天
}

/** 单候选 Hybrid 总分（PRD §42 初版公式，权重 config.ts） */
export function scoreCandidate(
  g: RecallCandidate,
  intent: GameIntent,
  reference: ReferenceGame | null,
  vectorAvailable: boolean,
): ScoreDetail {
  const intentMatch = intentMatchScore(g, intent, reference);
  const semantic = vectorAvailable ? g.semanticSim : 0;
  const gameScore = (g.totalScore ?? 0) / 10;
  const popularity = popularityScore(g.playCount);
  const freshness = freshnessScore(g.publishedAt);

  const total =
    RANKING_WEIGHTS.intentMatch * intentMatch +
    RANKING_WEIGHTS.semantic * semantic +
    RANKING_WEIGHTS.gameScore * gameScore +
    RANKING_WEIGHTS.popularity * popularity +
    RANKING_WEIGHTS.freshness * freshness;

  return {
    total: Math.round(total * 1000) / 1000,
    intentMatch: Math.round(intentMatch * 1000) / 1000,
    semantic: Math.round(semantic * 1000) / 1000,
    gameScore: Math.round(gameScore * 1000) / 1000,
    popularity: Math.round(popularity * 1000) / 1000,
    freshness: Math.round(freshness * 1000) / 1000,
  };
}

/* ===== 排序主入口 ===== */

export interface RankedCandidate {
  candidate: RecallCandidate;
  scoreDetail: ScoreDetail;
}

/**
 * Filter → Rank → Top N。
 * strict 过滤不足 MIN_RESULTS 时自动放宽软条件（时长）重排（relaxed=true），
 * 保证推荐列表非空（PRD：解析失败/空结果绝不空转）。
 */
export function rankCandidates(
  candidates: RecallCandidate[],
  intent: GameIntent,
  reference: ReferenceGame | null,
  vectorAvailable: boolean,
): { items: RankedCandidate[]; relaxed: boolean } {
  let pool = hardFilter(candidates, intent, true);
  let relaxed = false;
  if (pool.length < MIN_RESULTS) {
    const loose = hardFilter(candidates, intent, false);
    if (loose.length > pool.length) {
      pool = loose;
      relaxed = true;
    }
  }

  // random intent：热门池加权随机（场景 A"随便推荐一个"）
  if (intent.random && pool.length > TOP_N) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    pool = shuffled.slice(0, Math.max(TOP_N, MIN_RESULTS));
  }

  const ranked = pool
    .map((candidate) => ({
      candidate,
      scoreDetail: scoreCandidate(
        candidate,
        intent,
        reference,
        vectorAvailable,
      ),
    }))
    .sort((a, b) => b.scoreDetail.total - a.scoreDetail.total);

  return { items: ranked.slice(0, TOP_N), relaxed };
}
