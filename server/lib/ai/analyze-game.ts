import { getAIClient, getModelId, noThinkingParams } from "./client";
import { gameProfileSchema, type GameProfile } from "./schemas";

/**
 * 是否「额度受限」类错误（HTTP 429 限流，或错误信息命中额度/配额关键词）。
 * 额度受限多数是模型账户余额/配额耗尽的配置问题，继续跑只会浪费 token 且无产出，
 * 应终止当前任务等待人工更换模型后重跑。命中时向外抛 QuotaError 以终止整批。
 */
export class QuotaError extends Error {}

const QUOTA_KEYWORDS = [
  "rate limit", "rate_limit", "requests per", "429",
  "quota", "insufficient", "exceeded", "balance",
  "额度", "限额", "配额", "耗尽", "余额不足", "限流",
];

export function isQuotaError(err: unknown): boolean {
  if (err instanceof QuotaError) return true;
  const msg = String(
    (typeof err === "object" && err && (err as { message?: unknown }).message) ?? err,
  ).toLowerCase();
  return QUOTA_KEYWORDS.some((k) => msg.includes(k));
}

/** 包装额度受限错误：识别到即抛出，由上层 runAnalyzeGames 终止整个任务 */
export function throwOnQuota(err: unknown): void {
  if (isQuotaError(err)) {
    throw err instanceof QuotaError
      ? err
      : new QuotaError(
          "模型额度受限，主动终止本次分析，请人工检查/更换模型后重跑: " +
            (err instanceof Error ? err.message : String(err)),
        );
  }
}

/**
 * genre 中文白名单 —— 与 GamePix 采集器 CATEGORY_ZH（真实数据分布）对齐，
 * 另补充少量源站没有但无 genre 游戏（约 1/3）AI 推断时可能用到的类型。
 * 真实分布（13562 条）：街机1325 解谜1100 休闲771 冒险706 动作575 超休闲501
 * 射击431 平台跳跃338 体育337 三消297 益智235 棋盘223 记忆220 双人210 换装187
 * 竞速187 放置181 跑酷162 技巧159 策略157 女生134 模拟133 僵尸115 格斗102
 * 纸牌59 IO对战44 战争21 模拟经营20 塔防1 对战1 Roguelike1；无 genre 4635。
 */
export const GENRE_WHITELIST = [
  "街机", "解谜", "休闲", "超休闲", "冒险", "动作", "射击", "平台跳跃",
  "体育", "三消", "益智", "棋盘", "记忆", "双人", "换装", "竞速",
  "放置", "跑酷", "技巧", "策略", "女生", "模拟", "模拟经营", "僵尸",
  "格斗", "纸牌", "IO 对战", "战争", "塔防", "Roguelike", "音乐", "教育", "其他",
];

/** 英文 genre → 中文映射（兜底模型返回英文时，与采集器 CATEGORY_ZH 对齐） */
const GENRE_MAP: Record<string, string> = {
  action: "动作", adventure: "冒险", arcade: "街机", board: "棋盘", brain: "益智",
  card: "纸牌", casual: "休闲", clicker: "放置", idle: "放置",
  "dress-up": "换装", dressup: "换装", farming: "模拟经营", fighting: "格斗",
  "first-person-shooter": "射击", fps: "射击", shooter: "射击", shooting: "射击",
  "games-for-girls": "女生", girl: "女生", "hyper-casual": "超休闲",
  io: "IO 对战", "match-3": "三消", match3: "三消", matching: "三消",
  memory: "记忆", platformer: "平台跳跃", jump: "平台跳跃",
  puzzle: "解谜", racing: "竞速", runner: "跑酷",
  simulation: "模拟", sim: "模拟", skill: "技巧", sports: "体育", sport: "体育",
  strategy: "策略", "two-player": "双人", war: "战争", zombie: "僵尸",
  "tower-defense": "塔防", towerdefense: "塔防", towerdefensegame: "塔防", defense: "塔防",
  roguelike: "Roguelike", "rogue-like": "Roguelike",
  cooking: "模拟经营", building: "模拟经营", quiz: "益智", math: "益智", word: "益智",
  music: "音乐", education: "教育", educational: "教育",
  other: "其他",
};

/** mood 英文白名单 */
export const MOOD_WHITELIST = ["casual", "relaxing", "focus", "brain_burn", "exciting", "competitive", "nostalgic", "chill"];
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
export interface GameRawData {
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

/** 画像字段的通用规则（单条/批量 prompt 共享） */
const SYSTEM_RULES = `你是一个游戏元数据分析专家。根据提供的游戏信息，输出结构化 JSON 画像。

规则（严格遵守）：
1. titleZh：简短有吸引力的中文名（不超过 10 个字）
2. descriptionZh：2~4 句中文简介，突出玩法卖点
3. genre：必须从以下中文类型中选且只选一个：${GENRE_WHITELIST.join("/")}。不得用英文。
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
12. gameLanguage：游戏本体语言的 2 字母代码（如 "en" "ja" "zh"），不是中文也非英文单词`;

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

  const systemPrompt = `${SYSTEM_RULES}

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
        ...noThinkingParams(),
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
      // 额度受限 → 终止整个任务
      throwOnQuota(err);
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 2) {
        return { success: false, error: `LLM call failed: ${msg}` };
      }
    }
  }

  return { success: false, error: "Unexpected: exhausted retries" };
}

/**
 * 批量分析：一次 LLM 调用分析多个游戏（省 system prompt 重复开销）。
 * 返回成功通过校验的 profile（key 为游戏 id）；
 * 批内个别失败/缺失不重试整批，由调用方回退单条 analyzeGame 兜底。
 */
export async function analyzeGamesBatch(
  games: GameRawData[],
): Promise<Map<number, GameProfile>> {
  const results = new Map<number, GameProfile>();
  if (games.length === 0) return results;

  const client = getAIClient();
  const model = getModelId();

  const systemPrompt = `${SYSTEM_RULES}

输入是多个游戏的信息列表（每个以 "### 游戏 id=<数字>" 开头）。
输出一个合法 JSON 对象：{"games": [{"id": <对应的游戏id数字>, <其余为上述画像字段>}...]}。
必须覆盖输入中的每一个游戏，id 不得编造或遗漏。不要 markdown 代码块，不要任何额外文字。`;

  const userMessage = games
    .map((g) => {
      const block = buildUserMessage(
        g,
        safeJsonParse(g.tags, []),
        safeJsonParse(g.screenshots ?? "[]", []),
      );
      return `### 游戏 id=${g.id}\n${block}`;
    })
    .join("\n\n");

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 16000,
      response_format: { type: "json_object" },
      ...noThinkingParams(),
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return results;

    const parsed = JSON.parse(content) as { games?: unknown[] };
    const list = Array.isArray(parsed.games) ? parsed.games : [];

    for (const entry of list) {
      if (typeof entry !== "object" || entry === null) continue;
      const e = entry as Record<string, unknown>;
      const id = Number(e.id);
      if (!Number.isInteger(id)) continue;

      const normalized = normalizeProfile(e);
      const validation =
        gameProfileSchema.safeParse(normalized).success
          ? gameProfileSchema.safeParse(normalized)
          : gameProfileSchema.safeParse(e);
      if (validation.success) {
        results.set(id, validation.data);
      }
    }
  } catch (err) {
    // 额度受限 → 终止整个任务，不再回退单条（避免雪崩突发大量 token 请求）
    throwOnQuota(err);
    console.warn(
      `[analyze-batch] 批量调用失败（${games.length} 个游戏将回退单条）:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  return results;
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
