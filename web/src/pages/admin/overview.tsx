import { useEffect, useState } from "react";
import { Link } from "react-router";

import { fetchAdminOverview, type AdminOverview } from "../../admin-api";

export function AdminOverviewPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchAdminOverview().then(setData).catch(() => setError(true));
  }, []);

  if (error) return <p className="text-red-400">加载失败</p>;
  if (!data) return <p className="text-neutral-500">加载中…</p>;

  const statusLabel: Record<string, string> = {
    draft: "待分析（draft）",
    pending: "待人工（pending）",
    published: "已发布",
    offline: "已下线",
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">仪表盘</h1>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="游戏总数" value={data.totalGames} />
        <Stat label="数据源" value={data.sourceCount} />
        <Stat label="待处理重复" value={data.duplicatesPending} href="/admin/duplicates" />
        <Stat
          label="已发布"
          value={data.byStatus.published ?? 0}
          href="/admin/games?status=published"
        />
      </div>
      <h2 className="mb-2 font-semibold text-neutral-300">按状态分布</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Object.entries(statusLabel).map(([k, label]) => (
          <Stat
            key={k}
            label={label}
            value={data.byStatus[k] ?? 0}
            href={`/admin/games?status=${k}`}
          />
        ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const body = (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-2xl font-bold">{value.toLocaleString()}</div>
      <div className="mt-1 text-sm text-neutral-400">{label}</div>
    </div>
  );
  return href ? <Link to={href}>{body}</Link> : body;
}
