import { useCallback, useEffect, useState } from "react";

import {
  dismissAdminDuplicate,
  fetchAdminDuplicates,
  mergeAdminDuplicate,
  type AdminDuplicatePair,
} from "../../admin-api";

/**
 * 疑似重复处理（T3.7 人工队列）。
 * 每对显示两行卡片：保留方 / 重复方，操作：
 * - 保留前者（下线 dup）/ 保留后者（下线 keep）/ 不是重复（dismiss）
 */
export function AdminDuplicatesPage() {
  const [pairs, setPairs] = useState<AdminDuplicatePair[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetchAdminDuplicates(page);
      setPairs(res.items);
      setTotal(res.total);
    } catch {
      setError(true);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(
    pairId: number,
    action: "keep" | "dup" | "dismiss",
  ) {
    setBusyId(pairId);
    setError(false);
    try {
      if (action === "dismiss") {
        await dismissAdminDuplicate(pairId);
      } else {
        await mergeAdminDuplicate(pairId, action);
      }
      // 当前页删空则回退一页
      if (pairs && pairs.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        await load();
      }
    } catch {
      setError(true);
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">疑似重复处理</h1>
      <p className="mb-4 text-sm text-neutral-500">
        共 {total} 对待处理。Merge 会将重复方下线（offline，可回滚），不会物理删除。
      </p>

      {error && <p className="mb-3 text-sm text-red-400">操作失败，请重试</p>}

      {pairs?.map((p) => (
        <div
          key={p.id}
          className="mb-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4"
        >
          <div className="mb-3 flex items-center gap-2 text-xs text-neutral-500">
            <span className="rounded bg-neutral-800 px-1.5 py-0.5">
              {p.reason === "slug" ? "slug 一致" : "标题相似"}
            </span>
            <span>相似度 {(p.similarity * 100).toFixed(0)}%</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <GameCard label="游戏 A" pair={p} side="keep" />
            <GameCard label="游戏 B" pair={p} side="dup" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => act(p.id, "keep")}
              disabled={busyId === p.id}
              className="rounded bg-emerald-700/80 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              保留 A（下线 B）
            </button>
            <button
              onClick={() => act(p.id, "dup")}
              disabled={busyId === p.id}
              className="rounded bg-emerald-700/80 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              保留 B（下线 A）
            </button>
            <button
              onClick={() => act(p.id, "dismiss")}
              disabled={busyId === p.id}
              className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 disabled:opacity-50"
            >
              不是重复
            </button>
          </div>
        </div>
      ))}

      {pairs?.length === 0 && (
        <p className="rounded-lg border border-neutral-800 p-8 text-center text-neutral-500">
          没有待处理的重复 🎉
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

function GameCard({
  label,
  pair,
  side,
}: {
  label: string;
  pair: AdminDuplicatePair;
  side: "keep" | "dup";
}) {
  const title = side === "keep" ? pair.keepTitle : pair.dupTitle;
  const slug = side === "keep" ? pair.keepSlug : pair.dupSlug;
  const status = side === "keep" ? pair.keepStatus : pair.dupStatus;
  const thumb = side === "keep" ? pair.keepThumbnail : pair.dupThumbnail;
  const id = side === "keep" ? pair.keepId : pair.dupId;

  return (
    <div className="flex items-center gap-3 rounded border border-neutral-800 p-2">
      {thumb && (
        <img src={thumb} alt="" className="h-12 w-12 rounded object-cover" loading="lazy" />
      )}
      <div className="min-w-0">
        <div className="text-xs text-neutral-500">
          {label} · #{id} · {status ?? "已删除"}
        </div>
        <div className="truncate font-medium">{title}</div>
        <div className="truncate text-xs text-neutral-500">{slug}</div>
      </div>
    </div>
  );
}
