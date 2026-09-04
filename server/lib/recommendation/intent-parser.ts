/**
 * Intent Parser（T5.1，PRD §5/§22）。
 *
 * 自然语言 → GameIntent JSON（zod 校验），覆盖 PRD 第 5 章全部场景：
 * 时间 / 心情 / 认知负担 / 难度 / 人数 / 设备 / 横竖屏 / 参考游戏 / 负向偏好 / 随便推荐。
 *
 * 快捷条件（quick id）走预定义 GameIntent，不经 LLM（省成本、零延迟）。
 * LLM 解析失败/超时 → 返回 parsedOk=false，由 API 层降级为快捷条件交互。
 */
import { z } from "zod";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { games } from "@/lib/db/schema";
import { getAIClient, getModelId } from "@/lib/ai/client";
import { isQuotaError } from "@/lib/ai/analyze-game";
import { GENRE_WHITELIST, MOOD_WHITELIST } from "@/lib/ai/analyze-game";
import { QUICK_CONDITIONS, type GameIntent } from "@game-finder/shared";

export type { GameIntent };

/* ===== zod schema（与 shared GameIntent 逐字段对齐）===== */

const intentSchema = z
  .object({
    sessionLengthMin: z.number().int().min(0).max(600).optional(),
    sessionLengthMax: z.number().int().min(0).max(600).optional(),
    mood: z.array(z.enum(MOOD_WHITELIST as unknown as [string, ...string[]])).max(3).optional(),
    difficultyMin: z.number().int().min(1).max(5).optional(),
    difficultyMax: z.number().int().min(1).max(5).optional(),
    cognitiveLoadMin: z.number().int().min(1).max(5).optional(),
    cognitiveLoadMax: z.number().int().min(1).max(5).optional(),
    complexityMin: z.number().int().min(1).max(5).optional(),
    complexityMax: z.number().int().min(1).max(5).optional(),
    players: z.number().int().min(1).max(16).optional(),
    platform: z.enum(["mobile", "desktop"]).optional(),
    orientation: z.enum(["portrait", "landscape"]).optional(),
    similarTo: z.string().min(1).max(80).optional(),
    genre: z.string().max(20).optional(),
    negativePreference: z.array(z.string().max(40)).max(5).optional(),
    random: z.boolean().optional(),
  })
  .strict();

/* ===== 归一化 ===== */

/** 中/英心情词 → 白名单 */
const MOOD_MAP: Record<string, string> = {
  轻松: "relaxing", 放松: "relaxing", 解压: "relaxing", 治愈: "chill",
  休闲: "casual", 随便: "casual", 专注: "focus", 益智: "focus",
  烧脑: "brain_burn", 动脑: "brain_burn", 刺激: "exciting", 紧张: "exciting",
  竞技: "competitive", 对战: "competitive", 怀旧: "nostalgic",
};

/** 英文 genre → 中文白名单（复用画像分析的映射口径） */
const GENRE_MAP: Record<string, string> = {
  casual: "休闲", puzzle: "解谜", arcade: "街机", action: "动作",
  adventure: "冒险", shooting: "射击", shooter: "射击", sports: "体育",
  "match-3": "三消", match3: "三消", racing: "竞速", runner: "跑酷",
  strategy: "策略", simulation: "模拟", "tower-defense": "塔防",
  towerdefense: "塔防", defense: "塔防", roguelike: "Roguelike",
  "two-player": "双人", board: "棋盘", card: "纸牌", idle: "放置",
  clicker: "放置", zombie: "僵尸", fighting: "格斗", io: "IO 对战",
  platformer: "平台跳跃", memory: "记忆", skill: "技巧", hyper_casual: "超休闲",
};

/**
 * 清洗 LLM 原始输出：字段名/枚举值的常见漂移修正，
 * 尽量让 zod 校验通过（校验失败=整次解析失败，代价高）。
 */
function normalizeRaw(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };

  // 常见别名
  const aliases: Record<string, string> = {
    sessionLength: "sessionLengthMax",
    time: "sessionLengthMax",
    duration: "sessionLengthMax",
    minutes: "sessionLengthMax",
    maxSessionLength: "sessionLengthMax",
    device: "platform",
    playersCount: "players",
    playerCount: "players",
    referenceGame: "similarTo",
    similar_game: "similarTo",
    negative: "negativePreference",
  };
  for (const [from, to] of Object.entries(aliases)) {
    if (from in out && !(to in out)) out[to] = out[from];
  }

  // mood：中/英文混合 → 白名单
  if (Array.isArray(out.mood)) {
    const mapped = (out.mood as unknown[])
      .map((m) => {
        const v = String(m).trim().toLowerCase();
        if ((MOOD_WHITELIST as readonly string[]).includes(v)) return v;
        return MOOD_MAP[v] ?? null;
      })
      .filter((m): m is string => m != null);
    out.mood = [...new Set(mapped)];
    if ((out.mood as string[]).length === 0) delete out.mood;
  } else if (typeof out.mood === "string") {
    out.mood = [out.mood];
  }

  // genre → 中文白名单
  if (typeof out.genre === "string" && out.genre.trim()) {
    const g = out.genre.trim();
    out.genre = GENRE_WHITELIST.includes(g)
      ? g
      : (GENRE_MAP[g.toLowerCase()] ?? null);
    if (out.genre == null) delete out.genre;
  } else if ("genre" in out) {
    delete out.genre;
  }

  // 数值字符串 → number
  for (const k of [
    "sessionLengthMin", "sessionLengthMax",
    "difficultyMin", "difficultyMax",
    "cognitiveLoadMin", "cognitiveLoadMax",
    "complexityMin", "complexityMax", "players",
  ]) {
    if (out[k] !== undefined && out[k] !== null) {
      const n = Number(out[k]);
      if (Number.isFinite(n)) out[k] = n;
      else delete out[k];
    }
  }

  // 数值钳制（防止 LLM 输出 0 或 10）
  const clamp = (k: string, lo: number, hi: number) => {
    if (typeof out[k] === "number") {
      out[k] = Math.max(lo, Math.min(hi, out[k] as number));
    }
  };
  clamp("difficultyMin", 1, 5); clamp("difficultyMax", 1, 5);
  clamp("cognitiveLoadMin", 1, 5); clamp("cognitiveLoadMax", 1, 5);
  clamp("complexityMin", 1, 5); clamp("complexityMax", 1, 5);

  // platform 中文 → 枚举
  if (typeof out.platform === "string") {
    const p = out.platform.trim().toLowerCase();
    out.platform =
      p === "手机" || p === "mobile" || p === "手机上" || p === "移动端"
        ? "mobile"
        : p === "电脑" || p === "desktop" || p === "pc" || p === "桌面"
          ? "desktop"
          : undefined;
    if (out.platform == null) delete out.platform;
  }

  return out;
}

/* ===== LLM 解析 ===== */

const SYSTEM_PROMPT = `你是游戏推荐意图解析器。把用户的自然语言游戏需求转换为结构化 JSON（GameIntent）。

可用字段（只填用户明确表达或强烈暗示的，未提及的字段一律不填）：
- sessionLengthMin / sessionLengthMax：单局时长上下限（分钟，数字）
- mood：心情标签数组，只能从 [casual, relaxing, focus, brain_burn, exciting, competitive, nostalgic, chill] 选
- difficultyMin / difficultyMax：难度 1~5（1=极简 5=硬核）
- cognitiveLoadMin / cognitiveLoadMax：认知负担 1~5（1=无脑 5=高专注）
- complexityMin / complexityMax：复杂度 1~5
- players：几个人玩（数字）
- platform："mobile" 或 "desktop"
- orientation："portrait"（竖屏）或 "landscape"（横屏）
- genre：游戏类型，只能从 [${GENRE_WHITELIST.join("/")}] 选
- similarTo：用户提到的参考游戏名（保留原文，如"植物大战僵尸"）
- negativePreference：负向偏好数组（英文 snake_case，如 grinding/horror/pvp/jump_scare）
- random：true（用户说"随便推荐/随便来一个"）

解析规则：
- "轻松/放松/不想动脑/不想烧脑" → mood 含 relaxing，且 cognitiveLoadMax ≤ 2
- "烧脑/动脑/有挑战" → mood 含 brain_burn，且 cognitiveLoadMin ≥ 3
- "简单一点/别太难" → difficultyMax ≤ 2，complexityMax ≤ 2
- "类似/像 X 但 Y" → similarTo 填 X 的名字，Y 转为对应约束（如"简单一点"→ difficultyMax）
- "两个人/双人/和朋友" → players=2；"多人" → players=4
- "手机上玩" → platform="mobile"；"不想横屏" → orientation="portrait"
- "不想下载/网页直接玩" 是默认能力，无需任何字段
- 中文俗语映射："太肝"→negativePreference 含 grinding；"吓人/恐怖"→含 horror

只输出一个合法 JSON 对象，不要 markdown 代码块，不要任何额外文字。`;

export interface ParsedIntent {
  intent: GameIntent;
  parsedOk: boolean;
}

/**
 * 自然语言 → GameIntent。
 * 失败（LLM 异常/校验不过）时返回 parsedOk=false + 空 intent，不抛错（调用方降级）。
 * 额度受限（QuotaError）向上抛出，避免无效重试烧 token。
 */
export async function parseIntent(input: string): Promise<ParsedIntent> {
  const text = input.trim();
  if (!text) return { intent: {}, parsedOk: false };

  const client = getAIClient();
  const model = getModelId();

  // 首次 + 一次重试（校验失败/调用异常共用）
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `用户需求：${text}` },
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) continue;

      const raw = JSON.parse(content) as Record<string, unknown>;
      const normalized = normalizeRaw(raw);
      const validation = intentSchema.safeParse(normalized);

      if (validation.success) {
        return { intent: validation.data as GameIntent, parsedOk: true };
      }
      console.warn(
        `[intent-parser] validation failed (attempt ${attempt}):`,
        validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    } catch (err) {
      if (isQuotaError(err)) throw err;
      console.warn(
        `[intent-parser] LLM call failed (attempt ${attempt}):`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return { intent: {}, parsedOk: false };
}

/** 快捷条件 id → 预定义 GameIntent（不走 LLM） */
export function quickIntent(quickId: string): GameIntent | null {
  const qc = QUICK_CONDITIONS.find((q) => q.id === quickId);
  return qc ? structuredClone(qc.intent) : null;
}

/* ===== 参考游戏解析（similarTo → 站内游戏）===== */

export interface ReferenceGame {
  id: number;
  slug: string;
  title: string;
  titleOriginal: string;
  genre: string | null;
  mechanics: string;
  mood: string;
  difficulty: number;
  cognitiveLoad: number;
  complexity: number;
  pace: number;
  sessionLengthMin: number | null;
  sessionLengthMax: number | null;
  multiplayer: boolean;
  minPlayers: number;
  maxPlayers: number;
  mobile: boolean;
  desktop: boolean;
  portrait: boolean;
  landscape: boolean;
}

/**
 * similarTo 名字 → 站内已发布游戏。
 * 优先 ILIKE 精确包含匹配（中文名/原始名），按 play_count 破平；
 * 无命中时返回 null（调用方按普通语义召回兜底，不中断 Pipeline）。
 */
export async function resolveReferenceGame(
  name: string,
): Promise<ReferenceGame | null> {
  const like = `%${name.trim()}%`;
  const rows = await db
    .select({
      id: games.id,
      slug: games.slug,
      title: games.title,
      titleOriginal: games.titleOriginal,
      genre: games.genre,
      mechanics: games.mechanics,
      mood: games.mood,
      difficulty: games.difficulty,
      cognitiveLoad: games.cognitiveLoad,
      complexity: games.complexity,
      pace: games.pace,
      sessionLengthMin: games.sessionLengthMin,
      sessionLengthMax: games.sessionLengthMax,
      multiplayer: games.multiplayer,
      minPlayers: games.minPlayers,
      maxPlayers: games.maxPlayers,
      mobile: games.mobile,
      desktop: games.desktop,
      portrait: games.portrait,
      landscape: games.landscape,
    })
    .from(games)
    .where(
      and(
        eq(games.status, "published"),
        or(ilike(games.title, like), ilike(games.titleOriginal, like)),
      ),
    )
    .orderBy(desc(games.playCount), sql`length(${games.title}) asc`)
    .limit(1);

  return rows[0] ?? null;
}
