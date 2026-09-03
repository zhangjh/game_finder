import { useEffect, useState } from "react";

import { fetchAdminSources, type AdminSource } from "../../admin-api";

export function AdminSourcesPage() {
  const [sources, setSources] = useState<AdminSource[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchAdminSources()
      .then(setSources)
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="text-red-400">加载失败</p>;
  if (!sources) return <p className="text-neutral-500">加载中…</p>;

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">数据源</h1>
      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-900 text-left text-neutral-400">
            <tr>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">类型</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Last Sync</th>
              <th className="px-3 py-2">Game Count</th>
              <th className="px-3 py-2">Errors</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-t border-neutral-800">
                <td className="px-3 py-2">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-neutral-500">{s.code}</div>
                </td>
                <td className="px-3 py-2 text-neutral-400">{s.apiType}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      s.status === "active" ? "text-emerald-400" : "text-amber-400"
                    }
                  >
                    {s.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-neutral-400">
                  {s.lastSyncAt
                    ? new Date(s.lastSyncAt).toLocaleString("zh-CN")
                    : "从未"}
                  {s.lastSyncStatus && (
                    <div
                      className={`text-xs ${s.lastSyncStatus === "ok" ? "text-neutral-600" : "text-red-400"}`}
                      title={s.lastSyncStatus}
                    >
                      {s.lastSyncStatus === "ok" ? "ok" : s.lastSyncStatus}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div>{s.gameCount.toLocaleString()}</div>
                  <div className="text-xs text-neutral-500">
                    {Object.entries(s.gamesByStatus)
                      .map(([k, v]) => `${k}:${v}`)
                      .join(" ") || "—"}
                  </div>
                </td>
                <td
                  className={`px-3 py-2 ${s.errorCount > 0 ? "text-red-400" : "text-neutral-500"}`}
                >
                  {s.errorCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
