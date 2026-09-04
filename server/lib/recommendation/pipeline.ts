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
}

/**
 * 执行完整推荐 Pipeline。
 * Intent 解析失败 → parsedOk=false 返回空结果（API 层引导快捷条件降级，不空转）。
 */
export async function runRecommendation(
  req: RecommendInput,
): Promise<RecommendResponse> {
  const rawInput = (req.input ?? "").trim();
  const quickId = req.quick?.trim();

  /* ===== Intent 解析 ===== */
  let intent: GameIntent = {};
  let parsedOk = true;

  if (quickId) {
    const quick = quickIntent(quickId);
    if (!quick) {
      return emptyResponse(0, false, null, null);
    }
    intent = quick;
  } else if (rawInput) {
    try {
      const parsed = await parseIntent(rawInput);
      intent = parsed.intent;
      parsedOk = parsed.parsedOk;
    } catch (err) {
      // LLM 额度受限等异常：降级为热门召回（绝不空转），前端按 parsedOk=false 提示
      if (!isQuotaError(err)) console.warn("[recommend] parseIntent error:", err);
      parsedOk = false;
    }
    if (!parsedOk) intent = {};
  } else {
    return emptyResponse(0, false, null, null);
  }

  /* ===== 参考游戏解析（similarTo → 站内游戏）===== */
  const reference = intent.similarTo
    ? await resolveReferenceGame(intent.similarTo)
    : null;

  /* ===== 召回 → 过滤 → 排序 ===== */
  const { candidates, vectorAvailable } = await recallAll(
    intent,
    quickId ? QUICK_CONDITIONS.find((q) => q.id === quickId)?.label ?? "" : rawInput,
    reference,
  );

  const { items: ranked, relaxed } = rankCandidates(
    candidates,
    intent,
    reference,
    vectorAvailable,
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
      totalScore: candidate.totalScore,
    },
    reason: buildReason(candidate, intent, reference),
    score: scoreDetail.total,
    scoreDetail,
  }));

  /* ===== 落库 ===== */
  const requestId = await persist(
    quickId ? QUICK_CONDITIONS.find((q) => q.id === quickId)?.label ?? quickId : rawInput,
    intent,
    parsedOk,
    items,
  );

  return {
    requestId,
    parsedOk,
    intent,
    referenceGame: reference
      ? { id: reference.id, slug: reference.slug, title: reference.title }
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
    console.error("[recommend] persist failed:", err);
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
