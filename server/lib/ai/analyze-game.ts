import { getAIClient, getModelId } from "./client";
import { gameProfileSchema, type GameProfile } from "./schemas";

/** genre 中文白名单（PRD §11 + 前台筛选，M3 GENRE_MAP 对齐） */
const GENRE_WHITELIST = [
  "塔防", "Roguelike", "解谜", "射击", "动作", "模拟", "策略",
  "竞速", "体育", "冒险", "卡牌", "音乐", "教育", "休闲", "经营", "对战", "其他",
];

/** 英文 genre → 中文映射（兜底模型返回英文时） */
const GENRE_MAP: Record<string, string> = {
  "tower-defense": "塔防", "tower defense": "塔防", "towerdefense": "塔防",
  roguelike: "Roguelike", "rogue-like": "Roguelike",
  puzzle: "解谜", puzzle1: "解谜",
  shooting: "射击", shooter: "射击", "fps": "射击",
  action: "动作", arcade: "休闲",
  simulation: "模拟", sim: "模拟", building: "经营", farming: "经营", idle: "经营", cooking: "经营",
  strategy: "策略", defense: "塔防",
  racing: "竞速",
  sports: "体育", sport: "体育",
  adventure: "冒险",
  card: "卡牌",
  music: "音乐",
  education: "教育", educational: "教育",
  casual: "休闲", "hyper-casual": "休闲", clicker: "休闲", "match-3": "休闲",
  memory: "休闲", word: "休闲", quiz: "休闲", math: "休闲", girl: "休闲", dressup: "休闲", jump: "休闲", runner: "休闲", skill: "休闲",
  board: "棋牌",
  io: "对战", multiplayer: "对战",
  other: "其他",
};

/** mood 英文白名单 */
const MOOD_WHITELIST = ["casual", "relaxing", "focus", "brain_burn", "exciting", "competitive", "nostalgic", "chill"];
const MOOD_MAP: Record<string, string> = {
  "轻松": "relaxing", "放松": "relaxing", "休闲": "casual", "益智": "focus",
  "烧脑": "brain_burn", "刺激": "exciting", "紧张": "exciting", "竞技": "competitive",
  "怀旧": "nostalgic", "治愈": "chill", "平静": "chill",
};

/** 常见英语游戏语言全名 → 2 字母代码 */
const LANG_MAP: Record<string, string> = {
  english: "en", chinese: "zh", chinese_simplified: "zh", japanese: "ja",
  korean: "ko", spanish: "es", french: "fr", german: "de", portuguese: "pt",
  russian: "ru", italian: "it", thai: "th", vietnamese: "vi", arabic: "ar",
  "英语": "en", "中文": "zh", "日语": "ja", "韩语": "ko", "西班牙语": "es", "法语": "fr",
};

/** 从数据库行提取用于 AI 分析的原始字段 */
interface GameRawData {
  id: number;
  titleOriginal: string;
  descriptionOriginal: string;
  tags: string;       // JSON 数组字符串
  genre?: string | null;
  screenshots?: string; // JSON 数组字符串
  mobile?: boolean;
  desktop?: boolean;
}

/** analyzeGame 返回结果 */
export interface AnalyzeResult {
  success: boolean;
  profile?: GameProfile;
  error?: string;
}

/**
 * 调用 LLM 分析游戏，输出结构化画像 + 中文化。
 *
 * 流程：
 * 1. 拼接 prompt + 原始元数据
 * 2. LLM JSON 输出
 * 3. zod 校验
 * 4. 失败则重试一次
 * 5. 仍失败返回 error
 */
export async function analyzeGame(game: GameRawData): Promise<AnalyzeResult> {
  const client = getAIClient();
  const model = getModelId();

  const tags = safeJsonParse(game.tags, []);
  const screenshots = safeJsonParse(game.screenshots ?? "[]", []);

  const systemPrompt = `你是一个游戏元数据分析专家。根据提供的游戏信息，输出结构化 JSON 画像。

规则（严格遵守）：
1. titleZh：简短有吸引力的中文名（不超过 10 个字）
2. descriptionZh：2~4 句中文简介，突出玩法卖点
3. genre：必须从以下中文类型中选且只选一个：塔防/Roguelike/解谜/射击/动作/模拟/策略/竞速/体育/冒险/卡牌/音乐/教育/休闲/经营/对战/其他。不得用英文。
4. tags：中文标签数组（2~5 个），反映游戏特色
5. mechanics：英文 snake_case 核心机制数组，如 ["tower_defense","wave_management"]
6. 体验属性全部为 1~5 的整数：
   - difficulty（难度）：1=极简 5=硬核
   - cognitiveLoad（认知负担）：1=无脑 5=高专注
   - complexity（复杂度）：1=简单 5=极复杂
   - pace（节奏）：1=极慢 5=极快
   - stressLevel（压力）：1=放松 5=紧张
   - replayability（重玩价值）：1=一次 5=无限
7. sessionLengthMin/sessionLengthMax：建议单局时长范围（分钟）
8. mood：心情标签数组，只能从这 8 个英文 snake_case 中选：casual/relaxing/focus/brain_burn/exciting/competitive/nostalgic/chill。不得用中文。
9. minPlayers/maxPlayers 根据游戏描述判断
10. coop/competitive/desktop/mobile/tablet 必须是布尔值 true/false
11. inputMethods：从 mouse/keyboard/touch/gamepad 中选
12. gameLanguage：游戏本体语言的 2 字母代码（如 "en" "ja" "zh"），不是中文也非英文单词

只输出一个合法 JSON 对象，不要 markdown 代码块，不要任何额外文字。`;

  const userMessage = buildUserMessage(game, tags, screenshots);

  // 首次尝试 + 一次重试
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return { success: false, error: "Empty LLM response" };
      }

      const raw = JSON.parse(content);
      const normalized = normalizeProfile(raw);

      // 优先校验归一化结果；失败再回退原始结果校验（保留模型诚实输出）
      const validation =
        gameProfileSchema.safeParse(normalized).success
          ? gameProfileSchema.safeParse(normalized)
          : gameProfileSchema.safeParse(raw);

      if (validation.success) {
        return { success: true, profile: validation.data };
      }

      // 校验失败
      const errorMsg = `Validation failed: ${validation.error.issues.map((i) => i.message).join("; ")}`;
      if (attempt === 2) {
        return { success: false, error: errorMsg };
      }
      // 继续重试
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 2) {
        return { success: false, error: `LLM call failed: ${msg}` };
      }
    }
  }

  return { success: false, error: "Unexpected: exhausted retries" };
}

function buildUserMessage(
  game: GameRawData,
  tags: string[],
  screenshots: string[],
): string {
  const parts: string[] = [];

  parts.push(`游戏原始名：${game.titleOriginal}`);

  if (game.descriptionOriginal) {
    parts.push(`原始简介：${game.descriptionOriginal}`);
  }

  if (tags.length > 0) {
    parts.push(`源站标签：${tags.join(", ")}`);
  }

  if (game.genre) {
    parts.push(`源站类型：${game.genre}`);
  }

  if (screenshots.length > 0) {
    parts.push(`截图 URL：${screenshots.slice(0, 3).join(", ")}`);
  }

  // 设备提示
  const devices: string[] = [];
  if (game.desktop) devices.push("desktop");
  if (game.mobile) devices.push("mobile");
  if (devices.length > 0) {
    parts.push(`已知设备：${devices.join(", ")}`);
  }

  parts.push("");
  parts.push("请输出完整的 JSON 画像。");

  return parts.join("\n");
}

function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

/**
 * 对 LLM 原始 JSON 做归一化/清洗，兜底模型不严守 prompt 约束的情况：
 * - genre 英文 → 中文（白名单映射，未命中回落"其他"）
 * - mood 中文/自由词 → 英文白名单
 * - gameLanguage 全名/中文 → 2 字母代码
 * - 把 minPlayers/maxPlayers 等数值做基本校验修正
 */
function normalizeProfile(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null) return {};
  const src = raw as Record<string, unknown>;

  const out: Record<string, unknown> = { ...src };

  // genre → 中文白名单
  if (typeof out.genre === "string") {
    const g = out.genre.trim().toLowerCase();
    out.genre = GENRE_WHITELIST.includes(out.genre as string)
      ? out.genre
      : (GENRE_MAP[g] ?? "其他");
  }

  // mood 数组 → 英文白名单（允许集合运算，过滤并映射）
  if (Array.isArray(out.mood)) {
    out.mood = out.mood
      .map((m) => {
        if (typeof m !== "string") return null;
        const v = m.trim().toLowerCase();
        if (MOOD_WHITELIST.includes(v)) return v;
        return MOOD_MAP[v] ?? null;
      })
      .filter((m): m is string => m != null);
  }

  // gameLanguage → 2 字母代码
  if (typeof out.gameLanguage === "string") {
    const v = out.gameLanguage.trim().toLowerCase();
    out.gameLanguage = LANG_MAP[v] ?? (v.length === 2 ? v : "en");
  }

  // 数值字段转 number（防止模型输出 "5" 字符串）
  for (const k of [
    "difficulty", "cognitiveLoad", "complexity", "pace", "stressLevel", "replayability",
    "sessionLengthMin", "sessionLengthMax", "minPlayers", "maxPlayers",
  ]) {
    if (out[k] === undefined) continue;
    const n = Number(out[k]);
    if (!Number.isNaN(n)) out[k] = n;
  }

  // 布尔字段规范化
  for (const k of ["coop", "competitive", "desktop", "mobile", "tablet"]) {
    if (out[k] === undefined) continue;
    out[k] = Boolean(out[k]);
  }

  // tags / mechanics / inputMethods 数组化
  for (const k of ["tags", "mechanics", "inputMethods"]) {
    if (typeof out[k] === "string") {
      out[k] = [out[k]];
    }
  }

  return out;
}
