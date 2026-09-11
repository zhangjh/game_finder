import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { fetchGames, fetchRecommendation } from "../api";
import { Seo } from "../components/seo";
import { GameCard } from "../components/game-card";
import { RecommendResults } from "../components/recommend-results";
import { useI18n, type UiLang } from "../i18n";
import type { GameListItem, RecommendResponse } from "@game-finder/shared";

/**
 * 长句/意图词 → AI 推荐 Pipeline；短词 → 传统关键词搜索（PRD §29）。
 * AI 失败自动降级回传统搜索；关键词 0 命中自动转 AI 语义召回兜底，绝不空转。
 */
const AI_INTENT_PATTERN =
  /类似|像一|想要|想玩|推荐|帮我|有没有|随便|放松|轻松|烧脑|简单|太难|太肝|分钟|小时|手机|电脑|双人|多人|两个人|朋友|不用下载|下载|横屏|竖屏|休闲|打发|挑战|relax|chill|brain|casual|quick|minute|hour|easy|hard|difficult|mobile|phone|desktop|laptop|friend|together|multiplayer|recommend|suggest|something|bored|player|players|download/i;

function isAiQuery(q: string): boolean {
  if (q.length > 10) return true;
  if (/[，。？！,.?!\s]/.test(q)) return true;
  return AI_INTENT_PATTERN.test(q);
}

const PAGE_SIZE = 24;

/* ===== 最近搜索（localStorage，隐私模式静默降级） ===== */

const RECENT_KEY = "game-finder:recent-searches";
const RECENT_MAX = 8;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .filter((x): x is string => typeof x === "string")
          .slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* 存储不可用时静默降级 */
  }
}

/** 语义搜索示例：自然语言长句，点击命中 isAiQuery 走 AI 推荐管线 */
const SEMANTIC_EXAMPLES: Record<UiLang, string[]> = {
  zh: [
    "只有10分钟，想玩一局就停",
    "今天有点累，想玩点放松治愈的",
    "想玩烧脑一点的解谜游戏",
    "和朋友两个人能对战的",
    "手机上能玩的休闲小游戏",
    "不要那种很肝需要天天签到的",
    "类似植物大战僵尸的塔防",
    "随便推荐一个好玩的",
  ],
  en: [
    "Only 10 minutes, want a quick round",
    "Tired today, something chill and relaxing",
    "A brain-teasing puzzle game",
    "A 2-player versus game for me and a friend",
    "Casual games that play well on mobile",
    "Nothing grindy that needs daily check-ins",
    "A tower defense like Plants vs Zombies",
    "Surprise me with something fun",
  ],
};

/** ✨ 图标（随文字色变化） */
function Sparkle({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2 L13.6 9.4 L21 11 L13.6 12.6 L12 20 L10.4 12.6 L3 11 L10.4 9.4 Z" />
    </svg>
  );
}

/** 当前展示结果的管线：keyword=关键词 / ai=直接 AI / semantic=关键词 miss 后的语义兜底 */
type ResultMode = "keyword" | "ai" | "semantic";

export function SearchPage() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { t, lang } = useI18n();

  const q = (sp.get("q") ?? "").trim();
  const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);

  const [input, setInput] = useState("");
  const [results, setResults] = useState<GameListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<RecommendResponse | null>(null);
  const [mode, setMode] = useState<ResultMode>("keyword");
  const [recent, setRecent] = useState<string[]>([]);

  /* 查询变化：渲染期同步重置，避免上一词的结果/模式闪现（React 官方 derive-state 模式） */
  const [lastQuery, setLastQuery] = useState("");
  if (q !== lastQuery) {
    setLastQuery(q);
    setInput(q);
    setMode(isAiQuery(q) ? "ai" : "keyword");
    setResults([]);
    setTotal(0);
    setAiResult(null);
    setError(null);
    setLoading(Boolean(q));
  }

  /* 最近搜索：挂载读取本地记录 */
  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  /* 最近搜索：执行查询时记录（去重、最新在前） */
  useEffect(() => {
    if (!q) return;
    setRecent((prev) => {
      const next = [q, ...prev.filter((x) => x !== q)].slice(0, RECENT_MAX);
      saveRecent(next);
      return next;
    });
  }, [q]);

  useEffect(() => {
    if (!q) return;

    let active = true;
    setLoading(true);
    setError(null);

    // 长句 / 含意图词 → AI 推荐 Pipeline（PRD §29.2）
    if (isAiQuery(q)) {
      setMode("ai");
      fetchRecommendation({ input: q, lang })
        .then((res) => {
          if (!active) return;
          setAiResult(res);
          // AI 空 → 关键词兜底（绝不空转）
          if (res.items.length === 0) {
            return fetchGames({ q, lang }).then((fallback) => {
              if (!active) return;
              setResults(fallback.items);
              setTotal(fallback.total);
            });
          }
        })
        .catch(() =>
          // AI 服务异常 → 关键词兜底（绝不空转）
          fetchGames({ q, lang })
            .then((fallback) => {
              if (!active) return;
              setResults(fallback.items);
              setTotal(fallback.total);
              setMode("keyword");
            })
            .catch((e: unknown) => {
              if (active)
                setError(e instanceof Error ? e.message : "加载失败");
            }),
        )
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }

    // 短词 → 传统关键词搜索（PRD §29.1）
    setMode("keyword");
    fetchGames({ q, lang, page, pageSize: PAGE_SIZE })
      .then(async (res) => {
        if (!active) return;
        setResults(res.items);
        setTotal(res.total);
        // 关键词 0 命中（第 1 页）→ AI 语义召回兜底（ILIKE 盲区交给向量召回）
        if (res.items.length === 0 && page === 1) {
          try {
            const semantic = await fetchRecommendation({ input: q, lang });
            if (!active) return;
            if (semantic.items.length > 0) {
              setAiResult(semantic);
              setMode("semantic");
            }
          } catch {
            /* AI 不可用（额度/网络）：保留关键词空态 + 建议词 */
          }
        }
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [q, page, lang]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function submitSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = input.trim();
    if (next) navigate(`/search?q=${encodeURIComponent(next)}`);
  }

  function goSearch(word: string) {
    navigate(`/search?q=${encodeURIComponent(word)}`);
  }

  function removeRecent(word: string) {
    setRecent((prev) => {
      const next = prev.filter((x) => x !== word);
      saveRecent(next);
      return next;
    });
  }

  function clearRecent() {
    setRecent([]);
    saveRecent([]);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Seo
        title={
          q
            ? t("resultsFor", { q }) +
              " | " +
              (lang === "zh" ? "玩什么 PlayWhat" : "PlayWhat")
            : t("searchSeoTitle")
        }
        description={t("searchSeoDesc")}
        path="/search"
        noIndex
      />

      {q ? (
        <>
          <h1 className="sr-only">{t("resultsFor", { q })}</h1>

          {/* 紧凑搜索条：预填当前词，可改词直接重搜 */}
          <form
            className="flex max-w-xl items-center gap-2 rounded-full border border-border bg-surface py-1 pl-4 pr-1 transition-colors focus-within:border-primary"
            onSubmit={submitSearch}
          >
            <svg
              className="h-4 w-4 shrink-0 text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-4.35-4.35M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"
              />
            </svg>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              type="search"
              placeholder={t("searchInputPlaceholder")}
              aria-label={t("searchGames")}
              className="w-full min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("doSearch")}
            </button>
          </form>

          {/* 状态行：管线徽章 + 统计 */}
          {!error ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              {mode === "keyword" ? (
                <span className="rounded-full bg-background px-3 py-1 text-xs text-muted">
                  🔍 {t("keywordBadge")}
                </span>
              ) : (
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  ✨{" "}
                  {mode === "semantic" ? t("semanticBadge") : t("aiBadge")}
                </span>
              )}
              {loading ? (
                <span className="text-muted">
                  {mode === "keyword"
                    ? t("searching")
                    : t("recommending")}
                </span>
              ) : mode === "keyword" && results.length > 0 ? (
                <span className="text-muted">
                  {totalPages > 1
                    ? t("countGamesPaged", { total, page, totalPages })
                    : t("countGames", { total })}
                </span>
              ) : mode === "semantic" ? (
                <span className="text-muted">
                  {t("semanticFallbackHint", { q })}
                </span>
              ) : null}
            </div>
          ) : null}

          {/* 错误态 */}
          {error ? (
            <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center text-muted">
              {t("searchFailed", { error })}
            </div>
          ) : null}

          {/* 加载骨架（AI 3 列 / 关键词 4 列） */}
          {loading && !error ? (
            <div
              className={`mt-6 grid gap-4 ${
                mode === "keyword"
                  ? "grid-cols-2 sm:grid-cols-4"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
              }`}
            >
              {Array.from(
                { length: mode === "keyword" ? 8 : 3 },
                (_, i) => <SkeletonCard key={i} />,
              )}
            </div>
          ) : null}

          {/* AI 推荐 / 语义搜索结果 */}
          {!loading && aiResult && aiResult.items.length > 0 ? (
            <RecommendResults result={aiResult} />
          ) : null}

          {/* 关键词结果 + 分页 */}
          {!loading && mode === "keyword" && results.length > 0 ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {results.map((g) => (
                  <GameCard key={g.id} game={g} />
                ))}
              </div>
              {totalPages > 1 ? (
                <nav className="mt-6 flex justify-center gap-2 text-sm">
                  {page > 1 ? (
                    <Link
                      to={`/search?q=${encodeURIComponent(q)}&page=${page - 1}`}
                      className="rounded-full border border-border px-4 py-2 transition-colors hover:border-primary hover:text-primary"
                    >
                      {t("prevPage")}
                    </Link>
                  ) : null}
                  {page < totalPages ? (
                    <Link
                      to={`/search?q=${encodeURIComponent(q)}&page=${page + 1}`}
                      className="rounded-full border border-border px-4 py-2 transition-colors hover:border-primary hover:text-primary"
                    >
                      {t("nextPage")}
                    </Link>
                  ) : null}
                </nav>
              ) : null}
            </>
          ) : null}

          {/* AI 空结果 → 关键词兜底的相关结果 */}
          {!loading &&
          mode === "ai" &&
          aiResult &&
          aiResult.items.length === 0 &&
          results.length > 0 ? (
            <div className="mt-6">
              <h2 className="mb-3 text-sm font-semibold text-muted">
                {t("relatedFound")}
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {results.map((g) => (
                  <GameCard key={g.id} game={g} />
                ))}
              </div>
            </div>
          ) : null}

          {/* 空结果兜底：提示 + 建议词 */}
          {!loading &&
          !error &&
          results.length === 0 &&
          !(aiResult && aiResult.items.length > 0) ? (
            <div className="mt-8 rounded-xl border border-dashed border-border p-8 text-center">
              <p className="text-muted">
                {mode === "ai" ? (
                  <>
                    {t("notUnderstoodPre")}{" "}
                    <Link to="/" className="text-primary hover:underline">
                      AI Finder
                    </Link>{" "}
                    {t("notUnderstoodPost")}
                  </>
                ) : (
                  t("noResultsFor", { q })
                )}
              </p>
              <p className="mt-1 text-xs text-muted">
                {t("tryOtherSearches")}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SEMANTIC_EXAMPLES[lang].map((word) => (
                  <button
                    key={word}
                    type="button"
                    onClick={() => goSearch(word)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm text-muted transition-colors hover:border-primary hover:text-primary"
                  >
                    <Sparkle className="h-3.5 w-3.5 shrink-0" />
                    {word}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        /* 空态：居中搜索工具（无内容流，与首页的发现导向区分） */
        <div className="mx-auto max-w-xl pt-8 sm:pt-14">
          <h1 className="text-center text-2xl font-bold">{t("searchGames")}</h1>
          <p className="mt-2 text-center text-sm text-muted">
            {t("searchEmptySub")}
          </p>

          <form
            className="mt-6 flex flex-col gap-2 sm:flex-row"
            onSubmit={submitSearch}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              type="search"
              placeholder={t("searchInputPlaceholder")}
              aria-label={t("searchGames")}
              className="flex-1 rounded-full border border-border bg-surface px-5 py-3 text-sm outline-none transition-colors focus:border-primary"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("doSearch")}
            </button>
          </form>

          {/* 最近搜索 */}
          {recent.length > 0 ? (
            <section className="mt-10">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted">
                  {t("recentSearches")}
                </h2>
                <button
                  type="button"
                  onClick={clearRecent}
                  className="text-xs text-muted transition-colors hover:text-foreground"
                >
                  {t("clearRecent")}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {recent.map((word) => (
                  <span
                    key={word}
                    className="flex items-center overflow-hidden rounded-full border border-border"
                  >
                    <button
                      type="button"
                      onClick={() => goSearch(word)}
                      className="px-3 py-1 text-sm text-muted transition-colors hover:text-primary"
                    >
                      {word}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRecent(word)}
                      aria-label={t("removeRecentAria", { word })}
                      className="border-l border-border px-2 py-1 text-xs text-muted transition-colors hover:text-primary"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {/* 语义搜索示例 */}
          <section className="mt-8">
            <h2 className="text-sm font-semibold text-muted">
              {t("semanticExamples")}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {SEMANTIC_EXAMPLES[lang].map((word) => (
                <button
                  key={word}
                  type="button"
                  onClick={() => goSearch(word)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm text-muted transition-colors hover:border-primary hover:text-primary"
                >
                  <Sparkle className="h-3.5 w-3.5 shrink-0" />
                  {word}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/** 加载骨架卡（结构与 GameCard 对齐：图 + 标题 + 元信息 + 按钮位） */
function SkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <div className="aspect-[16/10] bg-background motion-safe:animate-pulse" />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="h-4 w-3/5 rounded bg-background motion-safe:animate-pulse" />
        <div className="h-3 w-2/5 rounded bg-background motion-safe:animate-pulse" />
        <div className="mt-auto h-9 rounded-lg bg-background motion-safe:animate-pulse" />
      </div>
    </div>
  );
}
