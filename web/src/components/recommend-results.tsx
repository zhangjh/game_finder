import { useEffect, useRef } from "react";

import { trackEvent } from "../analytics/track";
import { QUICK_CONDITIONS, type RecommendResponse } from "@game-finder/shared";

import { GameCard } from "./game-card";

/**
 * AI Finder 推荐结果区（T5.5，PRD §23/§44）：
 * 3~5 款卡片 + 每款可解释理由 + 解析状态提示（降级引导）。
 * M6：recommendation_impression + recommendation_click 埋点。
 */
export function RecommendResults({ result }: { result: RecommendResponse }) {
  const impressionSentRef = useRef(false);

  // 推荐结果展示时发送 recommendation_impression（仅一次）
  useEffect(() => {
    if (result.items.length > 0 && !impressionSentRef.current) {
      impressionSentRef.current = true;
      trackEvent({
        eventType: "recommendation_impression",
        context: { requestId: result.requestId },
      });
    }
  }, [result.requestId, result.items.length]);

  if (result.items.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-dashed border-border p-8 text-center text-muted">
        {result.parsedOk
          ? "没有找到匹配的游戏，换个说法试试？"
          : "没能理解这句话，试试下面的快捷条件，或换个更具体的描述"}
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {QUICK_CONDITIONS.slice(0, 3).map((q) => (
            <span
              key={q.id}
              className="rounded-full border border-border px-3 py-1 text-xs"
            >
              {q.icon} {q.label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {/* 解析状态行：similar_to 命中 / 放宽提示 / 降级提示 */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        {result.referenceGame && (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">
            以《{result.referenceGame.title}》为基准找相似
          </span>
        )}
        {result.relaxed && (
          <span className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-600">
            严格匹配不足，已展示条件接近的结果
          </span>
        )}
        {!result.parsedOk && (
          <span className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-600">
            AI 理解不确定，以下为热门推荐
          </span>
        )}
        <span>为你挑选了 {result.items.length} 款</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {result.items.map((item, i) => (
          <div key={item.game.id} className="flex flex-col gap-2">
            <GameCard
              game={item.game}
              context={{ requestId: result.requestId, rank: i + 1 }}
            />
            <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted">
              <span className="mr-1 font-semibold text-primary">#{i + 1}</span>
              {item.reason}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
