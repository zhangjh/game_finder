import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import {
  fetchAdminGameDetail,
  setAdminGameStatus,
  type AdminGameDetail,
  type AdminGameStatus,
} from "../../admin-api";

const STATUS_BADGE: Record<AdminGameStatus, string> = {
  draft: "bg-neutral-700 text-neutral-200",
  pending: "bg-amber-700/40 text-amber-300",
  published: "bg-emerald-700/40 text-emerald-300",
  offline: "bg-red-700/30 text-red-300",
};

function fmtDate(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function infoRow(label: string, value: React.ReactNode) {
  return (
    <div className="flex gap-3 py-1.5">
      <span className="w-24 shrink-0 text-neutral-500">{label}</span>
      <span className="min-w-0 break-words text-neutral-200">{value}</span>
    </div>
  );
}

export function AdminGameDetailPage() {
  const { id } = useParams();
  const [game, setGame] = useState<AdminGameDetail | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id || !/^\d+$/.test(id)) {
      setError(true);
      return;
    }
    setError(false);
    try {
      const g = await fetchAdminGameDetail(Number(id));
      setGame(g);
    } catch {
      setError(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleStatus() {
    if (!game) return;
    const next: AdminGameStatus =
      game.status === "published" ? "offline" : "published";
    setBusy(true);
    setError(false);
    try {
      await setAdminGameStatus(game.id, next);
      await load();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div>
        <p className="mb-3 text-sm text-red-400">加载失败，请重试</p>
        <Link to="/admin/games" className="text-sm text-neutral-400 hover:text-white">
          ← 返回游戏列表
        </Link>
      </div>
    );
  }

  if (!game) {
    return <p className="text-sm text-neutral-500">加载中…</p>;
  }

  const tags = safeParseJson(game.tags);
  const mechanics = safeParseJson(game.mechanics);
  const mood = safeParseJson(game.mood);

  return (
    <div>
      <Link
        to="/admin/games"
        className="text-sm text-neutral-400 hover:text-white"
      >
        ← 返回游戏列表
      </Link>

      <div className="mt-3 mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{game.titleOriginal}</h1>
        {game.title && game.title !== game.titleOriginal && (
          <span className="text-sm text-neutral-400">{game.title}</span>
        )}
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${STATUS_BADGE[game.status]}`}
        >
          {game.status}
        </span>
        {game.needsReanalysis && (
          <span className="text-xs text-amber-400" title="源数据有变化，待重新分析">
            ↻ 待重新分析
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {game.status === "published" && (
            <a
              href={`/game/${game.slug}`}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-neutral-700 px-2.5 py-1 text-xs hover:text-white"
            >
              前台预览
            </a>
          )}
          <button
            onClick={toggleStatus}
            disabled={busy}
            className="rounded border border-neutral-700 px-2.5 py-1 text-xs hover:text-white disabled:opacity-50"
          >
            {game.status === "published" ? "下架" : "上架"}
          </button>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-400">操作失败，请重试</p>}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div>
          {game.thumbnail ? (
            <img
              src={game.thumbnail}
              alt={game.titleOriginal}
              className="w-full rounded-lg border border-neutral-800 object-cover"
            />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-neutral-800 text-neutral-600">
              无缩略图
            </div>
          )}
          {game.gameUrl && (
            <a
              href={game.gameUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block rounded border border-neutral-700 px-3 py-1.5 text-center text-sm hover:text-white"
            >
              源站游玩链接 ↗
            </a>
          )}
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
          <p className="mb-3 text-sm leading-relaxed text-neutral-300">
            {game.descriptionZh ||
              game.descriptionOriginal ||
              game.description ||
              "暂无简介"}
          </p>
          <div className="grid gap-x-8 sm:grid-cols-2">
            {infoRow("ID", game.id)}
            {infoRow("来源", `${game.sourceCode} · ${game.sourceName}`)}
            {infoRow("源站游戏 ID", game.sourceGameId)}
            {infoRow("Slug", game.slug)}
            {infoRow("类型", game.genre ?? "—")}
            {infoRow("开发者", game.developer ?? "—")}
            {infoRow("发行商", game.publisher ?? "—")}
            {infoRow("源站发布日期", game.releaseDate ?? "—")}
            {infoRow("上架时间", fmtDate(game.publishedAt))}
            {infoRow("采集时间", fmtDate(game.createdAt))}
            {infoRow("更新时间", fmtDate(game.updatedAt))}
            {infoRow("游玩数", game.playCount.toLocaleString())}
            {infoRow(
              "平台分",
              game.totalScore != null ? game.totalScore.toFixed(1) : "—",
            )}
            {infoRow(
              "源站质量分",
              game.sourceQualityScore != null
                ? Math.round(game.sourceQualityScore * 100)
                : "—",
            )}
            {infoRow("游戏语言", game.gameLanguage || "—")}
            {infoRow("时长(分钟)", sessionText(game))}
          </div>

          {tags.length > 0 && (
            <div className="mt-4">
              <span className="text-xs text-neutral-500">标签</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          {mechanics.length > 0 && (
            <div className="mt-3">
              <span className="text-xs text-neutral-500">机制</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {mechanics.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          {mood.length > 0 && (
            <div className="mt-3">
              <span className="text-xs text-neutral-500">心情</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {mood.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function safeParseJson(v: string): string[] {
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function sessionText(g: AdminGameDetail): string {
  if (g.sessionLengthMin == null && g.sessionLengthMax == null) return "—";
  if (g.sessionLengthMin != null && g.sessionLengthMax === g.sessionLengthMin)
    return String(g.sessionLengthMin);
  return `${g.sessionLengthMin ?? "?"} ~ ${g.sessionLengthMax ?? "?"}`;
}