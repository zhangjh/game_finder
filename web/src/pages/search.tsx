import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { fetchGames, fetchRecommendation } from "../api";
import { GameCard } from "../components/game-card";
import { RecommendResults } from "../components/recommend-results";
import type { GameListItem, RecommendResponse } from "@game-finder/shared";

/**
 * 长句/意图词 → AI 推荐 Pipeline；短词 → 传统关键词搜索（PRD §29）。
 * AI 失败自动降级回传统搜索，绝不空转。
 */
const AI_INTENT_PATTERN =
  /类似|像一|想要|想玩|推荐|帮我|有没有|随便|放松|轻松|烧脑|简单|太难|太肝|分钟|小时|手机|电脑|双人|多人|两个人|朋友|不用下载|下载|横屏|竖屏|休闲|打发|挑战/;

function isAiQuery(q: string): boolean {
  if (q.length > 10) return true;
  if (/[，。？！,.?!\s]/.test(q)) return true;
  return AI_INTENT_PATTERN.test(q);
}

export function SearchPage() {
  const [sp] = useSearchParams();
  const q = (sp.get("q") ?? "").trim();

  const [results, setResults] = useState<GameListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [aiResult, setAiResult] = useState<RecommendResponse | null>(null);
  const [aiMode, setAiMode] = useState(false);

  useEffect(() => {
    document.title = q
      ? `「${q}」搜索结果 | AI Game Discovery`
      : "搜索 | AI Game Discovery";
    if (!q) {
      setResults([]);
      setTotal(0);
      setAiResult(null);
      setAiMode(false);
      return;
    }

    // 长句 / 含意图词 → AI 推荐 Pipeline（PRD §29.2）
    if (isAiQuery(q)) {
      setAiMode(true);
      setAiResult(null);
      setLoading(true);
      setError(null);
      setResults([]);
      setTotal(0);

      fetchRecommendation({ input: q })
        .then((res) => {
          setAiResult(res);
          // 解析成功且有结果：AI 结果即答案
          // 解析失败/空结果：降级补一次传统搜索兜底
          if (res.items.length === 0) {
            return fetchGames({ q }).then((fallback) => {
              setResults(fallback.items);
              setTotal(fallback.total);
            });
          }
        })
        .catch(() =>
          // AI 服务异常 → 传统搜索兜底（绝不空转）
          fetchGames({ q })
            .then((fallback) => {
              setResults(fallback.items);
              setTotal(fallback.total);
              setAiMode(false);
            })
            .catch((e: unknown) =>
              setError(e instanceof Error ? e.message : "加载失败"),
            ),
        )
        .finally(() => setLoading(false));
      return;
    }

    // 短词 → 传统关键词搜索（PRD §29.1）
    setAiMode(false);
    setAiResult(null);
    setLoading(true);
    fetchGames({ q })
      .then((res) => {
        setResults(res.items);
        setTotal(res.total);
        setError(null);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "加载失败"),
      )
      .finally(() => setLoading(false));
  }, [q]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-xl font-bold">
        {q ? (
          <>
            「{q}」
            <span className="ml-2 text-sm font-normal text-muted">
              {loading
                ? "搜索中…"
                : aiMode
                  ? "AI 理解结果"
                  : `${total} 款`}
            </span>
          </>
        ) : (
          "搜索游戏"
        )}
      </h1>

      {error ? (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center text-muted">
          搜索失败：{error}（请确认后端 API 已启动）
        </div>
      ) : null}

      {/* AI 推荐结果（长句模式） */}
      {aiResult && aiResult.items.length > 0 && (
        <RecommendResults result={aiResult} />
      )}

      {/* AI 空结果的降级文案 */}
      {aiMode && !loading && aiResult && aiResult.items.length === 0 && total === 0 && !error && (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center text-muted">
          没有理解这个需求，也搜不到相关游戏。试试
          <Link to="/" className="text-primary hover:underline">
            AI Finder
          </Link>
          或换个说法
        </div>
      )}

      {/* 传统搜索结果（短词模式 / AI 降级兜底） */}
      {!aiMode && results.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {results.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      ) : null}

      {/* AI 模式降级兜底的普通结果（无 AI 结果但有传统命中时） */}
      {aiMode && !loading && aiResult && aiResult.items.length === 0 && results.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-muted">
            为你找到的相关游戏
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {results.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </div>
      )}

      {!q ? (
        <p className="mt-8 text-center text-sm text-muted">
          提示：可以直接输入「我只有10分钟，想玩轻松的」这类自然语言需求，
          也可以搜「塔防」「双人」这类关键词
        </p>
      ) : null}
    </div>
  );
}
