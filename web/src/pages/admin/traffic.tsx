import { useEffect, useState } from "react";

import {
  fetchAdminTraffic,
  type AdminTraffic,
} from "../../admin-api";

const CHANNEL_LABELS: Record<string, string> = {
  direct: "直接访问",
  search: "搜索引擎",
  social: "社交渠道",
  referral: "外部链接",
  utm_other: "其它 UTM",
};

export function AdminTrafficPage() {
  const [data, setData] = useState<AdminTraffic | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setData(null);
    setError(false);
    fetchAdminTraffic(days).then(setData).catch(() => setError(true));
  }, [days, reloadKey]);

  if (error) return <p className="text-red-400">加载失败</p>;
  if (!data) return <p className="text-neutral-500">加载中…</p>;

  const totalPv = data.totals.pv;
  const totalUv = data.totals.uv;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">流量看板</h1>
        <div className="flex items-center gap-2 text-sm">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded border px-3 py-1 ${
                days === d
                  ? "border-blue-700 bg-blue-900 text-white"
                  : "border-neutral-700 text-neutral-400 hover:text-white"
              }`}
            >
              {d}天
            </button>
          ))}
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded border border-neutral-700 px-3 py-1 text-neutral-400 hover:text-white"
          >
            刷新
          </button>
        </div>
      </div>

      {/* 汇总 */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="PV（浏览页）" value={totalPv} />
        <MetricCard label="UV（独立用户）" value={totalUv} />
        <MetricCard label="人均浏览" value={totalPv ? (totalPv / totalUv).toFixed(1) : "-"} />
        <MetricCard label="统计窗口" value={`${data.days} 天`} />
      </div>

      {/* 渠道分布 */}
      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-neutral-300">渠道分布</h2>
        {data.channels.length === 0 ? (
          <EmptyHint text="暂无 page_view 数据（自然流量基础尚未产生）" />
        ) : (
          <div className="space-y-2">
            {data.channels.map((c) => {
              const share = totalPv ? (c.pv / totalPv) * 100 : 0;
              return (
                <div
                  key={c.channel}
                  className="rounded-lg border border-neutral-800 bg-neutral-900 p-3"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {CHANNEL_LABELS[c.channel] ?? c.channel}
                      {c.channel === "utm_other" && (
                        <span className="ml-2 text-xs text-neutral-500">
                          （未映射到标准渠道的 utm_source）
                        </span>
                      )}
                    </span>
                    <span className="text-neutral-400">
                      PV {c.pv.toLocaleString()} · UV {c.uv.toLocaleString()} ·{" "}
                      {share.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{ width: `${Math.max(share, 1)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 来源明细 */}
      {data.sources.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold text-neutral-300">来源明细（utm_source / referrer）</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-neutral-400">
                  <th className="py-2 pr-4">来源</th>
                  <th className="py-2 pr-4">PV</th>
                  <th className="py-2">UV</th>
                </tr>
              </thead>
              <tbody>
                {data.sources.map((s) => (
                  <tr key={s.source} className="border-b border-neutral-800/50">
                    <td className="max-w-xs truncate py-2 pr-4">{s.source}</td>
                    <td className="py-2 pr-4">{s.pv.toLocaleString()}</td>
                    <td className="py-2">{s.uv.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 每日趋势 */}
      {data.daily.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold text-neutral-300">每日趋势</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-neutral-400">
                  <th className="py-2 pr-4">日期</th>
                  <th className="py-2 pr-4">PV</th>
                  <th className="py-2">UV</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((d) => (
                  <tr key={d.date} className="border-b border-neutral-800/50">
                    <td className="py-2 pr-4">{d.date}</td>
                    <td className="py-2 pr-4">{d.pv.toLocaleString()}</td>
                    <td className="py-2">{d.uv.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 渠道转化漏斗 */}
      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-neutral-300">渠道转化漏斗（PV用户 → 启动 → 5分钟）</h2>
        {data.funnel.length === 0 ? (
          <EmptyHint text="暂无 page_view 数据" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-neutral-400">
                  <th className="py-2 pr-4">渠道</th>
                  <th className="py-2 pr-4">用户</th>
                  <th className="py-2 pr-4">启动</th>
                  <th className="py-2 pr-4">启动/人</th>
                  <th className="py-2 pr-4">5分钟</th>
                  <th className="py-2">成功率</th>
                </tr>
              </thead>
              <tbody>
                {data.funnel.map((f) => (
                  <tr key={f.channel} className="border-b border-neutral-800/50">
                    <td className="py-2 pr-4 font-medium">
                      {CHANNEL_LABELS[f.channel] ?? f.channel}
                    </td>
                    <td className="py-2 pr-4">{f.users}</td>
                    <td className="py-2 pr-4">{f.starts}</td>
                    <td className="py-2 pr-4">{f.startsPerUser}</td>
                    <td className="py-2 pr-4">{f.fiveMin}</td>
                    <td className="py-2">{f.successRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 落地页 */}
      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-neutral-300">热门落地页</h2>
        {data.landing.top.length === 0 ? (
          <EmptyHint text="暂无 page_view 数据" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-neutral-400">
                  <th className="py-2 pr-4">页面</th>
                  <th className="py-2 pr-4">进入用户</th>
                  <th className="py-2">其中带 UTM</th>
                </tr>
              </thead>
              <tbody>
                {data.landing.top.map((l) => (
                  <tr key={l.path} className="border-b border-neutral-800/50">
                    <td className="max-w-xs truncate py-2 pr-4">{l.path}</td>
                    <td className="py-2 pr-4">{l.users}</td>
                    <td className="py-2">{l.utmUsers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 带 UTM 落地明细 */}
      {data.landing.withUtm.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold text-neutral-300">分享/推广链接落地明细（带 UTM）</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-neutral-400">
                  <th className="py-2 pr-4">页面</th>
                  <th className="py-2 pr-4">渠道</th>
                  <th className="py-2 pr-4">形式</th>
                  <th className="py-2 pr-4">PV</th>
                  <th className="py-2">UV</th>
                </tr>
              </thead>
              <tbody>
                {data.landing.withUtm.map((u, i) => (
                  <tr key={`${u.path}-${u.source}-${i}`} className="border-b border-neutral-800/50">
                    <td className="max-w-xs truncate py-2 pr-4">{u.path}</td>
                    <td className="py-2 pr-4">{u.source}</td>
                    <td className="py-2 pr-4">{u.medium ?? "-"}</td>
                    <td className="py-2 pr-4">{u.pv}</td>
                    <td className="py-2">{u.uv}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* D1/D3/D7 留存 */}
      {data.retention.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold text-neutral-300">用户留存（按首次活跃日期分群）</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-neutral-400">
                  <th className="py-2 pr-4">首活日期</th>
                  <th className="py-2 pr-4">用户</th>
                  <th className="py-2 pr-4">D1</th>
                  <th className="py-2 pr-4">D3</th>
                  <th className="py-2 pr-4">D7</th>
                  <th className="py-2 pr-4">D1率</th>
                  <th className="py-2 pr-4">D3率</th>
                  <th className="py-2">D7率</th>
                </tr>
              </thead>
              <tbody>
                {data.retention.map((r) => (
                  <tr key={r.cohortDate} className="border-b border-neutral-800/50">
                    <td className="py-2 pr-4">{r.cohortDate}</td>
                    <td className="py-2 pr-4">{r.users}</td>
                    <td className="py-2 pr-4">{r.d1}</td>
                    <td className="py-2 pr-4">{r.d3}</td>
                    <td className="py-2 pr-4">{r.d7}</td>
                    <td className="py-2 pr-4">{r.d1Rate}%</td>
                    <td className="py-2 pr-4">{r.d3Rate}%</td>
                    <td className="py-2">{r.d7Rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* AI vs 搜索 */}
      <section>
        <h2 className="mb-2 font-semibold text-neutral-300">AI 推荐 vs 传统搜索</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-neutral-400">
                <th className="py-2 pr-4">方式</th>
                <th className="py-2 pr-4">用户</th>
                <th className="py-2 pr-4">请求/搜索</th>
                <th className="py-2 pr-4">曝光游戏</th>
                <th className="py-2 pr-4">点击</th>
                <th className="py-2 pr-4">CTR</th>
                <th className="py-2 pr-4">启动</th>
                <th className="py-2 pr-4">5分钟</th>
                <th className="py-2">成功率</th>
              </tr>
            </thead>
            <tbody>
              {data.compare.map((c) => (
                <tr key={c.group} className="border-b border-neutral-800/50">
                  <td className="py-2 pr-4">{c.label}</td>
                  <td className="py-2 pr-4">{c.users}</td>
                  <td className="py-2 pr-4">
                    {c.group === "ai" ? c.requests : c.requests}
                  </td>
                  <td className="py-2 pr-4">{c.impressions}</td>
                  <td className="py-2 pr-4">{c.clicks}</td>
                  <td className="py-2 pr-4">{c.ctr}%</td>
                  <td className="py-2 pr-4">{c.starts}</td>
                  <td className="py-2 pr-4">{c.fiveMin}</td>
                  <td className="py-2">{c.successRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-2xl font-bold">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="mt-1 text-sm text-neutral-400">{label}</div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-700 p-6 text-center text-sm text-neutral-500">
      {text}
    </div>
  );
}