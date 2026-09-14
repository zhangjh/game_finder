import { useEffect, useState } from "react";

import {
  fetchSeoStatus,
  type SeoStatus,
} from "../../admin-api";

export function AdminSeoPage() {
  const [data, setData] = useState<SeoStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const run = () => {
    setLoading(true);
    setError(false);
    fetchSeoStatus()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p className="text-red-400">检查失败，请稍后重试</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">SEO 索引状态</h1>
        <button
          onClick={run}
          disabled={loading}
          className="rounded border border-blue-700 bg-blue-900 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          {loading ? "检查中…" : "重新检查"}
        </button>
      </div>

      {data ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard
              label="整体状态"
              value={data.ok ? "正常" : "异常"}
              ok={data.ok}
            />
            <MetricCard label="子 sitemap" value={`${data.summary.sitemapOk}/${data.summary.sitemapOk + data.summary.sitemapFail}`} />
            <MetricCard label="收录 URL 数" value={data.summary.totalUrls} />
            <MetricCard label="详情页抽样" value={`${data.summary.detailOk}/${data.summary.detailOk + data.summary.detailFail}`} />
          </div>

          {/* 基础检查 */}
          <section className="mb-6">
            <h2 className="mb-2 font-semibold text-neutral-300">基础检查</h2>
            <ul className="space-y-2">
              {data.checks.map((c) => (
                <li
                  key={c.name}
                  className="flex items-start gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm"
                >
                  <span className={c.ok ? "text-green-400" : "text-red-400"}>
                    {c.ok ? "✓" : "✗"}
                  </span>
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-neutral-400">{c.url}</p>
                    {c.detail && <p className="text-neutral-500">{c.detail}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* sitemap */}
          <section className="mb-6">
            <h2 className="mb-2 font-semibold text-neutral-300">Sitemap 清单</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 text-left text-neutral-400">
                    <th className="py-2 pr-4">状态</th>
                    <th className="py-2 pr-4">URL</th>
                    <th className="py-2">URL 数 / 详情</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sitemapPages.map((s) => (
                    <tr key={s.loc} className="border-b border-neutral-800/50 text-sm">
                      <td className="py-2 pr-4">
                        <span className={s.ok ? "text-green-400" : "text-red-400"}>
                          {s.ok ? "✓" : "✗"}
                        </span>
                      </td>
                      <td className="max-w-md truncate py-2 pr-4">{s.loc}</td>
                      <td className="py-2">
                        {s.urlCount != null ? `${s.urlCount} 条` : s.detail ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 详情页抽样 */}
          <section className="mb-6">
            <h2 className="mb-2 font-semibold text-neutral-300">详情页抽样（最新发布，title/canonical/JSON-LD）</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 text-left text-neutral-400">
                    <th className="py-2 pr-4">状态</th>
                    <th className="py-2 pr-4">游戏</th>
                    <th className="py-2">详情</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sampleDetail.map((d) => (
                    <tr key={d.slug} className="border-b border-neutral-800/50 text-sm">
                      <td className="py-2 pr-4">
                        <span className={d.ok ? "text-green-400" : "text-red-400"}>
                          {d.ok ? "✓" : "✗"}
                        </span>
                      </td>
                      <td className="max-w-xs truncate py-2 pr-4">{d.slug}</td>
                      <td className="py-2">{d.detail ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-xs text-neutral-500">
            本次检查时间：{new Date(data.runAt).toLocaleString()}。Google/Bing/Baidu
            站长平台的索引状态需人工登录核验，节奏见
            docs/ops/seo-index-monitoring.md 每周复盘清单。
          </p>
        </>
      ) : (
        <p className="text-neutral-500">加载中…</p>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  ok,
}: {
  label: string;
  value: string | number;
  ok?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        ok === undefined
          ? "border-neutral-800 bg-neutral-900"
          : ok
            ? "border-green-800 bg-green-950/30"
            : "border-red-800 bg-red-950/30"
      }`}
    >
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-1 text-sm text-neutral-400">{label}</div>
    </div>
  );
}