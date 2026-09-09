import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import {
  fetchAdminGames,
  fetchAdminSources,
  setAdminGameStatus,
  type AdminGameListItem,
  type AdminGameStatus,
  type AdminSource,
} from "../../admin-api";

const STATUS_OPTIONS: { value: AdminGameStatus | ""; label: string }[] = [
  { value: "", label: "全部状态" },
  { value: "draft", label: "draft 待分析" },
  { value: "pending", label: "pending 待人工" },
  { value: "published", label: "published 已发布" },
  { value: "offline", label: "offline 已下线" },
];

const STATUS_BADGE: Record<AdminGameStatus, string> = {
  draft: "bg-neutral-700 text-neutral-200",
  pending: "bg-amber-700/40 text-amber-300",
  published: "bg-emerald-700/40 text-emerald-300",
  offline: "bg-red-700/30 text-red-300",
};

export function AdminGamesPage() {
  // 仪表盘状态卡片带 ?status= 跳转进来，URL 参数优先
  const [searchParams] = useSearchParams();
  const urlStatus = searchParams.get("status") ?? "";
  const urlSource = searchParams.get("source") ?? "";

  const [status, setStatus] = useState<AdminGameStatus | "">(
    (["draft", "pending", "published", "offline"] as const).includes(
      urlStatus as AdminGameStatus,
    )
      ? (urlStatus as AdminGameStatus)
      : "",
  );
  const [source, setSource] = useState(urlSource);
  const [sources, setSources] = useState<AdminSource[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<
    { col: "quality" | "score" | "published"; dir: "asc" | "desc" } | null
  >(null);
  const [data, setData] = useState<{
    items: AdminGameListItem[];
    total: number;
    pageSize: number;
  } | null>(null);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    fetchAdminSources()
      .then(setSources)
      .catch(() => {});
  }, []);

  const sortParam = sortKey ? `${sortKey.col}_${sortKey.dir}` : undefined;

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetchAdminGames({
        status: status || undefined,
        source: source || undefined,
        q: q || undefined,
        sort: sortParam,
        page,
        pageSize: 30,
      });
      setData(res);
    } catch {
      setError(true);
    }
  }, [status, source, q, sortParam, page]);

  useEffect(() => {
    load();
  }, [load]);

  /** 点击表头排序：未排序→降序 → 升序 → 清除 */
  function toggleHeaderSort(col: "quality" | "score" | "published") {
    setSortKey((prev) => {
      if (!prev || prev.col !== col) return { col, dir: "desc" };
      if (prev.dir === "desc") return { col, dir: "asc" };
      return null;
    });
  }

  /** 表头排序按钮（点击排序，激活时显示 ▲/▼） */
  function SortHeader({
    col,
    children,
  }: {
    col: "quality" | "score" | "published";
    children: React.ReactNode;
  }) {
    const active = sortKey?.col === col;
    return (
      <button
        type="button"
        onClick={() => toggleHeaderSort(col)}
        title="点击排序（再次点击切换升降序，第三次清除）"
        className={`inline-flex items-center gap-1 transition-colors ${
          active ? "text-white" : "hover:text-white"
        }`}
      >
        {children}
        {active && <span className="text-[10px]">{sortKey!.dir === "desc" ? "▼" : "▲"}</span>}
      </button>
    );
  }

  async function toggleStatus(g: AdminGameListItem) {
    const next: AdminGameStatus = g.status === "published" ? "offline" : "published";
    setBusyId(g.id);
    try {
      await setAdminGameStatus(g.id, next);
      await load();
    } catch {
      setError(true);
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">游戏管理</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as AdminGameStatus | "");
            setPage(1);
          }}
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setPage(1);
          }}
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
        >
          <option value="">全部来源</option>
          {sources.map((s) => (
            <option key={s.code} value={s.code}>
              {s.code} · {s.name}
            </option>
          ))}
        </select>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索标题 / slug"
            className="w-48 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
          />
        </form>
        {data && (
          <span className="self-center text-sm text-neutral-500">
            共 {data.total.toLocaleString()} 款
          </span>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-400">操作失败，请重试</p>}

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-900 text-left text-neutral-400">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">游戏</th>
              <th className="px-3 py-2">来源</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2">
                <SortHeader col="quality">源站质量</SortHeader>
              </th>
              <th className="px-3 py-2">
                <SortHeader col="score">平台分</SortHeader>
              </th>
              <th className="px-3 py-2">游玩数</th>
              <th className="px-3 py-2">
                <SortHeader col="published">上架时间</SortHeader>
              </th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((g) => (
              <tr key={g.id} className="border-t border-neutral-800">
                <td className="px-3 py-2 text-neutral-500">{g.id}</td>
                <td className="px-3 py-2">
                  <Link
                    to={`/admin/games/${g.id}`}
                    title="查看游戏详情"
                    className="group flex items-center gap-2"
                  >
                    {g.thumbnail && (
                      <img
                        src={g.thumbnail}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded object-cover transition-opacity group-hover:opacity-80"
                        loading="lazy"
                      />
                    )}
                    <div>
                      <div className="font-medium underline-offset-2 group-hover:underline">
                        {g.titleOriginal}
                      </div>
                      <div className="text-xs text-neutral-500">{g.slug}</div>
                    </div>
                  </Link>
                </td>
                <td className="px-3 py-2 text-neutral-400">{g.sourceCode}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${STATUS_BADGE[g.status]}`}
                  >
                    {g.status}
                  </span>
                  {g.needsReanalysis && (
                    <span className="ml-1 text-xs text-amber-400" title="源数据有变化，待重新分析">
                      ↻
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {g.sourceQualityScore != null ? (
                    <span
                      title="GamePix 官方质量分（<0.2 极渣 / <0.5 较差 / <0.8 一般 / ≥0.8 优质）"
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        g.sourceQualityScore < 0.2
                          ? "bg-red-700/30 text-red-300"
                          : g.sourceQualityScore < 0.5
                            ? "bg-amber-700/25 text-amber-300"
                            : g.sourceQualityScore < 0.8
                              ? "bg-neutral-800 text-neutral-300"
                              : "bg-emerald-700/30 text-emerald-300"
                      }`}
                    >
                      {Math.round(g.sourceQualityScore * 100)}
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-600">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-neutral-400">
                  {g.totalScore != null ? g.totalScore.toFixed(1) : "—"}
                </td>
                <td className="px-3 py-2 text-neutral-400">
                  {g.playCount.toLocaleString()}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-neutral-400">
                  {g.publishedAt
                    ? new Date(g.publishedAt).toLocaleString("zh-CN", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => toggleStatus(g)}
                    disabled={busyId === g.id}
                    className="rounded border border-neutral-700 px-2.5 py-1 text-xs hover:text-white disabled:opacity-50"
                  >
                    {g.status === "published" ? "下架" : "上架"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded border border-neutral-700 px-3 py-1 disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-neutral-500">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded border border-neutral-700 px-3 py-1 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
