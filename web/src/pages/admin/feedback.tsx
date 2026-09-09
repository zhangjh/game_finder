import { useCallback, useEffect, useState } from "react";

import {
  fetchAdminFeedback,
  fetchAdminFeedbackOverview,
  setAdminFeedbackStatus,
  takedownAdminFeedback,
  type AdminFeedbackItem,
  type AdminFeedbackStatus,
  type AdminFeedbackType,
} from "../../admin-api";

const STATUS_OPTIONS: { value: AdminFeedbackStatus | ""; label: string }[] = [
  { value: "", label: "全部状态" },
  { value: "pending", label: "待处理" },
  { value: "resolved", label: "已处理" },
  { value: "dismissed", label: "已驳回" },
];

const TYPE_OPTIONS: { value: AdminFeedbackType | ""; label: string }[] = [
  { value: "", label: "全部类型" },
  { value: "not_playable", label: "不可玩" },
  { value: "wrong_language", label: "语言错误" },
];

const STATUS_BADGE: Record<AdminFeedbackStatus, string> = {
  pending: "bg-amber-700/40 text-amber-300",
  resolved: "bg-emerald-700/40 text-emerald-300",
  dismissed: "bg-neutral-800 text-neutral-400",
};

const TYPE_BADGE: Record<AdminFeedbackType, string> = {
  not_playable: "bg-red-700/30 text-red-300",
  wrong_language: "bg-sky-700/30 text-sky-300",
};

/**
 * 用户反馈专区：查看玩家反馈的游戏质量问题，跳转前台复核，
 * 确认问题直接下架该游戏（连带把该游戏的 pending 反馈标记已处理）。
 */
export function AdminFeedbackPage() {
  const [items, setItems] = useState<AdminFeedbackItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<AdminFeedbackStatus | "">("");
  const [type, setType] = useState<AdminFeedbackType | "">("");
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetchAdminFeedback({
        status: status || undefined,
        type: type || undefined,
        page,
        pageSize: 30,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setError(true);
    }
  }, [status, type, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetchAdminFeedbackOverview()
      .then((o) => setPendingCount(o.pending))
      .catch(() => {});
  }, []);

  const pageSize = 30;
  const totalPages = Math.ceil(total / pageSize);

  async function mark(id: number, next: "resolved" | "dismissed") {
    setBusyId(id);
    setError(false);
    try {
      await setAdminFeedbackStatus(id, next);
      if (next === "resolved") {
        setPendingCount((c) => (c == null ? c : Math.max(0, c - 1)));
      }
      await load();
    } catch {
      setError(true);
    } finally {
      setBusyId(null);
    }
  }

  async function takedown(record: AdminFeedbackItem) {
    const ok = window.confirm(
      `确认下架「${record.gameTitleOriginal}」吗？下架后前台将不再展示，且该游戏所有待处理反馈会一并标记已处理。`,
    );
    if (!ok) return;
    setBusyId(record.id);
    setError(false);
    try {
      await takedownAdminFeedback(record.id);
      setPendingCount((c) => (c == null ? c : Math.max(0, c - 1)));
      await load();
    } catch {
      setError(true);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">用户反馈</h1>
      <p className="mb-4 text-sm text-neutral-500">
        {pendingCount != null
          ? `目前 ${pendingCount} 条待处理反馈。`
          : "加载反馈统计中…"}
        点「查看游戏」到前台复核确认问题。
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as AdminFeedbackStatus | "");
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
          value={type}
          onChange={(e) => {
            setType(e.target.value as AdminFeedbackType | "");
            setPage(1);
          }}
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {items && (
          <span className="self-center text-sm text-neutral-500">
            共 {total.toLocaleString()} 条
          </span>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-400">操作失败，请重试</p>}

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-neutral-900 text-left text-neutral-400">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">游戏</th>
              <th className="px-3 py-2">类型</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2">补充说明</th>
              <th className="px-3 py-2">来源</th>
              <th className="px-3 py-2">提交时间</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {items?.map((f) => (
              <tr key={f.id} className="border-t border-neutral-800 align-top">
                <td className="px-3 py-2 text-neutral-500">{f.id}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {f.gameThumbnail && (
                      <img
                        src={f.gameThumbnail}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="min-w-0">
                      <div
                        className={`max-w-[220px] truncate font-medium ${
                          f.gameStatus === "offline" ? "text-neutral-500" : ""
                        }`}
                        title={f.gameTitleOriginal}
                      >
                        {f.gameTitleOriginal}
                      </div>
                      <div className="max-w-[220px] truncate text-xs text-neutral-500">
                        {f.gameSlug}
                      </div>
                      {f.gameStatus === "offline" && (
                        <span className="mt-0.5 inline-block rounded bg-red-700/30 px-1 py-0.5 text-[10px] text-red-300">
                          已下线
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs ${TYPE_BADGE[f.feedbackType]}`}
                  >
                    {f.feedbackType === "not_playable" ? "不可玩" : "语言错误"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs ${STATUS_BADGE[f.status]}`}
                  >
                    {f.status === "pending"
                      ? "待处理"
                      : f.status === "resolved"
                        ? "已处理"
                        : "已驳回"}
                  </span>
                </td>
                <td className="max-w-[200px] px-3 py-2 text-neutral-400">
                  {f.note ? (
                    <span
                      className="line-clamp-2"
                      title={f.note}
                    >
                      {f.note}
                    </span>
                  ) : (
                    <span className="text-neutral-600">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-neutral-400">{f.sourceCode}</td>
                <td className="whitespace-nowrap px-3 py-2 text-neutral-400">
                  {new Date(f.createdAt).toLocaleString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <a
                      href={`/game/${f.gameSlug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-neutral-700 px-2.5 py-1 text-xs hover:text-white"
                    >
                      查看游戏
                    </a>
                    {f.status === "pending" && f.gameStatus === "published" && (
                      <button
                        onClick={() => takedown(f)}
                        disabled={busyId === f.id}
                        className="rounded bg-red-700/60 px-2.5 py-1 text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                      >
                        下架
                      </button>
                    )}
                    {f.status === "pending" && (
                      <>
                        <button
                          onClick={() => mark(f.id, "resolved")}
                          disabled={busyId === f.id}
                          className="rounded border border-neutral-700 px-2.5 py-1 text-xs hover:text-white disabled:opacity-50"
                        >
                          已处理
                        </button>
                        <button
                          onClick={() => mark(f.id, "dismissed")}
                          disabled={busyId === f.id}
                          className="rounded border border-neutral-700 px-2.5 py-1 text-xs text-neutral-400 hover:text-white disabled:opacity-50"
                        >
                          驳回
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {items?.length === 0 && (
        <p className="rounded-lg border border-neutral-800 p-8 text-center text-neutral-500">
          没有符合条件的数据
        </p>
      )}

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