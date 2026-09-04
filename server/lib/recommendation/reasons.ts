/**
 * 推荐理由生成（T5.4，PRD §44）。
 *
 * 基于结构化数据（GameIntent 命中维度 + 游戏画像）模板化拼接，
 * 非 LLM 自由发挥——保证每条理由可解释、可测试、零成本零延迟。
 * 每款必须给出理由（PRD 红线："这是一款非常好玩的游戏"式废话不允许）。
 */
import { MOOD_LABELS, type GameIntent, type Mood } from "@game-finder/shared";
import type { ReferenceGame } from "./intent-parser";
import type { RecallCandidate } from "./recall";

function parseArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** 单局时长中文描述 */
function sessionText(g: RecallCandidate): string {
  const { sessionLengthMin: min, sessionLengthMax: max } = g;
  if (min != null && max != null) {
    return min === max ? `单局 ${min} 分钟` : `单局 ${min}~${max} 分钟`;
  }
  if (min != null) return `单局约 ${min} 分钟起`;
  if (max != null) return `单局不超过 ${max} 分钟`;
  return "";
}

/**
 * 为单个推荐结果生成理由。
 * 按用户 intent 实际命中的维度组织，最多 3 个分句（时间/状态/设备/人数/相似）。
 */
export function buildReason(
  g: RecallCandidate,
  intent: GameIntent,
  reference: ReferenceGame | null,
): string {
  const clauses: string[] = [];

  /* 时间（场景 B） */
  if (intent.sessionLengthMax != null) {
    const st = sessionText(g);
    if (st) {
      clauses.push(
        g.sessionLengthMin != null &&
          g.sessionLengthMin <= intent.sessionLengthMax
          ? `你时间有限，这款${st}，随时可玩可停`
          : `这款${st}，节奏可控`,
      );
    }
  } else if (intent.sessionLengthMin != null) {
    const st = sessionText(g);
    if (st) clauses.push(`这款${st}，够你慢慢玩`);
  }

  /* 心情/状态（场景 C） */
  const moods = intent.mood ?? [];
  if (moods.includes("relaxing") || intent.cognitiveLoadMax != null) {
    const load =
      g.cognitiveLoad <= 2
        ? "操作简单、认知负担低"
        : g.cognitiveLoad <= 3
          ? "上手轻松"
          : "节奏舒缓";
    const moodZh = moods
      .map((m) => MOOD_LABELS[m as Mood])
      .filter(Boolean)
      .join("/");
    clauses.push(
      moodZh ? `${moodZh}向，${load}，适合现在的状态` : `${load}，适合放松一下`,
    );
  } else if (moods.includes("brain_burn") || intent.cognitiveLoadMin != null) {
    clauses.push(
      g.cognitiveLoad >= 4
        ? "硬核烧脑，越玩越上头"
        : "需要动脑规划，有策略深度",
    );
  } else if (moods.length > 0) {
    const moodZh = moods
      .map((m) => MOOD_LABELS[m as Mood])
      .filter(Boolean)
      .join("/");
    if (moodZh) {
      const gameMoods = parseArray(g.mood);
    const moodSet = moods as string[];
    clauses.push(
      gameMoods.some((m) => moodSet.includes(m))
        ? `${moodZh}氛围拉满`
        : `${moodZh}向的体验`,
    );
    }
  }

  /* 难度（场景 F"简单一点"） */
  if (intent.difficultyMax != null && intent.difficultyMax <= 2) {
    clauses.push(g.difficulty <= 2 ? "难度友好，几乎零门槛" : "难度不高，容易上手");
  } else if (intent.difficultyMin != null && intent.difficultyMin >= 4) {
    clauses.push(g.difficulty >= 4 ? "挑战性拉满" : "有一定挑战");
  }

  /* 人数（场景 E） */
  if (typeof intent.players === "number" && intent.players >= 2) {
    const p = intent.players;
    if (g.maxPlayers >= p && g.minPlayers <= p) {
      clauses.push(
        p === 2 ? "支持双人对战" : `支持最多 ${g.maxPlayers} 人`,
      );
    }
  }

  /* 设备（场景 D） */
  if (intent.platform === "mobile") {
    clauses.push(
      g.portrait ? "手机竖屏直接玩，无需下载" : "手机浏览器直接玩，无需下载",
    );
  }

  /* 参考游戏相似（场景 F，PRD §44 示例） */
  if (reference) {
    const sameGenre = g.genre && g.genre === reference.genre;
    const myMechanics = parseArray(g.mechanics);
    const refMechanics = parseArray(reference.mechanics);
    const overlap = refMechanics.filter((m) => myMechanics.includes(m));
    const simpler =
      (intent.difficultyMax != null || intent.complexityMax != null) &&
      g.difficulty <= reference.difficulty;
    const bits: string[] = [];
    if (sameGenre) bits.push(`和《${reference.title}》同为${g.genre}玩法`);
    else if (overlap.length) bits.push(`玩法机制与《${reference.title}》相近`);
    else bits.push(`风格接近《${reference.title}》`);
    if (simpler) bits.push("但门槛更低、更容易上手");
    clauses.push(bits.join("，"));
  } else if (intent.similarTo) {
    // 站内未命中参考游戏：仍点明相似意图（测试断言：理由须提及参考游戏）
    clauses.push(`玩法上与《${intent.similarTo}》有相似之处`);
  }

  /* 类型 */
  if (!reference && intent.genre && g.genre === intent.genre && clauses.length < 2) {
    clauses.push(`正属于你要找的${g.genre}类`);
  }

  /* 兜底：新鲜度/热门（保证永远有理由） */
  if (clauses.length === 0) {
    if (g.playCount > 0) clauses.push("玩家反复回访的热门之选");
    else if (g.publishedAt)
      clauses.push("近期新上架，值得第一时间试试");
    else clauses.push(`一款${g.genre ?? "休闲"}游戏，开箱即玩`);
  }

  // 分句过少时补充游戏画像（时长/类型/设备），保证理由信息量
  if (clauses.length < 2) {
    const st = sessionText(g);
    if (st && !clauses[0].includes("单局")) clauses.push(`这款${st}`);
    if (clauses.length < 2 && g.genre) clauses.push(`${g.genre}类玩法`);
  }

  // 上限 3 个分句，防止理由过长
  return clauses.slice(0, 3).join("；") + "。";
}
