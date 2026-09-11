/**
 * 推荐 Pipeline 编排（T5.5 核心，PRD §43）。
 *
 * User Input → Intent Parser → GameIntent → Candidate Recall
 *            → Hard Filter → Hybrid Ranking → Top 3~5 → 推荐理由
 *
 * 落库：recommendation_requests（原始输入+intent）/ recommendation_results
 * （排名+得分构成+理由），供 M6 推荐 CTR 归因（PRD §26）。
 */
import { db } from "@/lib/db";
import { recommendationRequests, recommendationResults } from "@/lib/db/schema";
import type {
  GameIntent,
  RecommendItem,
  RecommendResponse,
} from "@game-finder/shared";
import { isQuotaError } from "@/lib/ai/analyze-game";
import { parseIntent, quickIntent, resolveReferenceGame } from "./intent-parser";
import { recallAll } from "./recall";
import { rankCandidates } from "./ranking";
import { buildReason } from "./reasons";
import { QUICK_CONDITIONS } from "@game-finder/shared";

export interface RecommendInput {
  /** 自然语言输入 */
  input?: string;
  /** 快捷条件 id */
  quick?: string;
  /** 界面语种（T1.7）：zh=只召回中文元数据游戏 + 中文理由，en=全部 + 英文理由，缺省 zh */
  lang?: "zh" | "en";
}

/**
 * LLM 解析失败时的启发式意图兜底：从原文提取心情/难度/设备/人数等
 * 基础条件，避免 intent 全空导致推荐退化为纯热门（PRD §43 绝不空转）。
 */
function extractHeuristicIntent(rawInput: string): GameIntent {
  const text = rawInput.trim();
  const intent: GameIntent = {};

  // 心情（优先级从强到弱，命中后跳过后续）
  if (/(轻松|放松|解压|不想动脑|不想烧脑|打发)/.test(text)) {
    intent.mood = ["relaxing"];
    if (intent.cognitiveLoadMax == null) intent.cognitiveLoadMax = 2;
    if (intent.complexityMax == null) intent.complexityMax = 2;
  } else if (/(治愈|暖暖|温馨)/.test(text)) {
    intent.mood = ["chill"];
  } else if (/(休闲|随便玩|消遣)/.test(text)) {
    intent.mood = ["casual"];
  } else if (/(益智|烧脑|动脑|挑战|脑力)/.test(text)) {
    intent.mood = ["focus"];
    if (intent.cognitiveLoadMin == null) intent.cognitiveLoadMin = 3;
  } else if (/(刺激|紧张|心跳|爽快)/.test(text)) {
    intent.mood = ["exciting"];
  } else if (/(竞技|对战|排位)/.test(text)) {
    intent.mood = ["competitive"];
  } else if (/(怀旧|童年|小时候)/.test(text)) {
    intent.mood = ["nostalgic"];
  }

  // 难度/复杂度
  if (/(简单|不要太难|新手友好|轻松)/.test(text)) {
    if (intent.difficultyMax == null) intent.difficultyMax = 2;
    if (intent.complexityMax == null) intent.complexityMax = 2;
  } else if (/(难|硬核|高手|极限)/.test(text)) {
    if (intent.difficultyMin == null) intent.difficultyMin = 4;
  }

  // 设备
  if (/(手机|移动端|手机上)/.test(text)) intent.platform = "mobile";
  else if (/(电脑|桌面|PC|端游)/.test(text)) intent.platform = "desktop";

  // 人数
  if (/(双人|两人|两个人|和朋友|两人玩)/.test(text)) intent.players = 2;
  else if (/(多人|组队|联机)/.test(text)) intent.players = 4;

  // 单局时长
  const durMatch = text.match(/(\d+)\s*分钟/);
  if (durMatch) {
    const dur = Number(durMatch[1]);
    intent.sessionLengthMax = dur;
  }

  return intent;
}

/**
 * 执行完整推荐 Pipeline。
 * Intent 解析失败 → parsedOk=false 返回空结果（API 层引导快捷条件降级，不空转）。
 */
export async function runRecommendation(
  req: RecommendInput,
  traceId: string,
): Promise<RecommendResponse> {
  const startedAt = Date.now();
  const lang: "zh" | "en" = req.lang ?? "zh";
  const rawInput = (req.input ?? "").trim();
  const quickId = req.quick?.trim();

  /* ===== Intent 解析 ===== */
  let intent: GameIntent = {};
  let parsedOk = true;
  let intentSource: "quick" | "llm" | "heuristic" = quickId ? "quick" : "llm";

  if (quickId) {
    const quick = quickIntent(quickId);
    if (!quick) {
      console.warn(
        `[recommend] ${JSON.stringify({ traceId, event: "stopped", reason: "unknown_quick" })}`,
      );
      return emptyResponse(0, false, null, null);
    }
    intent = quick;
  } else if (rawInput) {
    try {
      const parsed = await parseIntent(rawInput, traceId);
      intent = parsed.intent;
      parsedOk = parsed.parsedOk;
    } catch (err) {
      // LLM 额度受限等异常：降级为热门召回（绝不空转），前端按 parsedOk=false 提示
      console.warn(
        `[recommend] ${JSON.stringify({ traceId, event: "intent_degraded", reason: isQuotaError(err) ? "quota_limited" : "parse_error" })}`,
      );
      parsedOk = false;
    }
    // LLM 解析失败时用启发式关键词兜底，避免 intent 全空导致纯热门推荐
    if (!parsedOk) {
      intent = extractHeuristicIntent(rawInput);
      intentSource = "heuristic";
    }
  } else {
    console.warn(
      `[recommend] ${JSON.stringify({ traceId, event: "stopped", reason: "empty_input" })}`,
    );
    return emptyResponse(0, false, null, null);
  }

  console.info(
    `[recommend] ${JSON.stringify({ traceId, event: "intent_ready", intentSource, parsedOk, intentFieldCount: Object.keys(intent).length })}`,
  );

  /* ===== 参考游戏解析（similarTo → 站内游戏）===== */
  const reference = intent.similarTo
    ? await resolveReferenceGame(intent.similarTo)
    : null;
  console.info(
    `[recommend] ${JSON.stringify({ traceId, event: "reference_resolved", requested: Boolean(intent.similarTo), referenceGameId: reference?.id ?? null })}`,
  );

  /* ===== 召回 → 过滤 → 排序 ===== */
  const { candidates, vectorAvailable } = await recallAll(
    intent,
    quickId ? QUICK_CONDITIONS.find((q) => q.id === quickId)?.label ?? "" : rawInput,
    reference,
    lang,
    traceId,
  );

  const { items: ranked, relaxed, branch } = rankCandidates(
    candidates,
    intent,
    reference,
    vectorAvailable,
    traceId,
  );

  /* ===== 理由生成 ===== */
  const items: RecommendItem[] = ranked.map(({ candidate, scoreDetail }) => ({
    game: {
      id: candidate.id,
      slug: candidate.slug,
      title: candidate.title,
      titleOriginal: candidate.titleOriginal,
      description: candidate.description,
      thumbnail: candidate.thumbnail,
      genre: candidate.genre,
      tags: candidate.tags,
      difficulty: candidate.difficulty,
      cognitiveLoad: candidate.cognitiveLoad,
      sessionLengthMin: candidate.sessionLengthMin,
      sessionLengthMax: candidate.sessionLengthMax,
      multiplayer: candidate.multiplayer,
      minPlayers: candidate.minPlayers,
      maxPlayers: candidate.maxPlayers,
      mobile: candidate.mobile,
      playCount: candidate.playCount,
      gameLanguage: candidate.gameLanguage,
      sourceQualityScore: candidate.sourceQualityScore,
      totalScore: candidate.totalScore,
    },
    reason: buildReason(candidate, intent, reference, lang),
    score: scoreDetail.total,
    scoreDetail,
  }));

  /* ===== 落库 ===== */
  const requestId = await persist(
    quickId ? QUICK_CONDITIONS.find((q) => q.id === quickId)?.label ?? quickId : rawInput,
    intent,
    parsedOk,
    items,
    traceId,
  );

  console.info(
    `[recommend] ${JSON.stringify({ traceId, event: "pipeline_completed", requestId, branch, candidateCount: candidates.length, resultCount: items.length, resultGameIds: items.map((item) => item.game.id), vectorAvailable, relaxed, durationMs: Date.now() - startedAt })}`,
  );

  return {
    requestId,
    parsedOk,
    intent,
    referenceGame: reference
      ? {
          id: reference.id,
          slug: reference.slug,
          title: reference.title,
          titleOriginal: reference.titleOriginal,
        }
      : null,
    relaxed,
    items,
  };
}

async function persist(
  rawInput: string,
  intent: GameIntent,
  parsedOk: boolean,
  items: RecommendItem[],
  traceId: string,
): Promise<number> {
  try {
    const [request] = await db
      .insert(recommendationRequests)
      .values({
        rawInput,
        intent,
        parsedOk,
        resultCount: items.length,
      })
      .returning({ id: recommendationRequests.id });

    if (items.length > 0) {
      await db.insert(recommendationResults).values(
        items.map((item, i) => ({
          requestId: request.id,
          gameId: item.game.id,
          rank: i + 1,
          scoreDetail: item.scoreDetail,
          reason: item.reason,
        })),
      );
    }
    return request.id;
  } catch (err) {
    // 落库失败不影响推荐返回（统计基础设施的故障不应阻塞用户）
    console.error(
      `[recommend] ${JSON.stringify({ traceId, event: "persist_failed", error: err instanceof Error ? err.message : String(err) })}`,
    );
    return 0;
  }
}

function emptyResponse(
  requestId: number,
  parsedOk: boolean,
  intent: GameIntent | null,
  referenceGame: RecommendResponse["referenceGame"],
): RecommendResponse {
  return { requestId, parsedOk, intent, referenceGame, relaxed: false, items: [] };
}
