import { useEffect, useState } from "react";

import {
  fetchAdminAnalytics,
  type AdminAnalytics,
} from "../../admin-api";

export function AdminAnalyticsPage() {
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchAdminAnalytics().then(setData).catch(() => setError(true));
  }, []);

  if (error) return <p className="text-red-400">加载失败</p>;
  if (!data) return <p className="text-neutral-500">加载中…</p>;

  const { overview } = data;

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">数据看板</h1>

      {/* 核心指标卡片 */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="匿名用户" value={overview.uniqueUsers} />
        <MetricCard label="游戏启动" value={overview.totalStarts} />
        <MetricCard label="启动率" value={`${overview.launchRate}%`} />
        <MetricCard label="重玩率" value={`${overview.replayRate}%`} />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="推荐请求" value={overview.totalRecommendations} />
        <MetricCard label="推荐 CTR" value={`${overview.recommendCTR}%`} />
        <MetricCard
          label="推荐成功率"
          value={`${overview.successRate}%`}
          highlight
        />
        <MetricCard label="总事件数" value={overview.totalEvents} />
      </div>

      {/* 事件分布 */}
      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-neutral-300">事件分布（30天）</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {data.eventBreakdown.map((e) => (
            <div
              key={e.eventType}
              className="rounded-lg border border-neutral-800 bg-neutral-900 p-3"
            >
              <div className="text-lg font-bold">{e.count.toLocaleString()}</div>
              <div className="mt-1 text-xs text-neutral-400">{e.eventType}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 最近 7 天趋势 */}
      {data.dailyActivity.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold text-neutral-300">每日活动（7天）</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-neutral-400">
                  <th className="py-2 pr-4">日期</th>
                  <th className="py-2 pr-4">事件</th>
                  <th className="py-2 pr-4">启动</th>
                  <th className="py-2">用户</th>
                </tr>
              </thead>
              <tbody>
                {data.dailyActivity.map((d) => (
                  <tr key={d.date} className="border-b border-neutral-800/50">
                    <td className="py-2 pr-4">{d.date}</td>
                    <td className="py-2 pr-4">{d.events}</td>
                    <td className="py-2 pr-4">{d.starts}</td>
                    <td className="py-2">{d.uniqueUsers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 热门游戏 */}
      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-neutral-300">热门游戏（30天启动）</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-neutral-400">
                <th className="py-2 pr-4">#</th>
                <th className="py-2 pr-4">游戏</th>
                <th className="py-2 pr-4">启动</th>
                <th className="py-2 pr-4">平均时长</th>
                <th className="py-2">评分</th>
              </tr>
            </thead>
            <tbody>
              {data.topGames.map((g, i) => (
                <tr key={g.id} className="border-b border-neutral-800/50">
                  <td className="py-2 pr-4 text-neutral-500">{i + 1}</td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      {g.thumbnail && (
                        <img
                          src={g.thumbnail}
                          alt=""
                          className="h-8 w-8 rounded object-cover"
                        />
                      )}
                      <span className="truncate">{g.title}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-4">{g.startCount}</td>
                  <td className="py-2 pr-4">
                    {g.avgSessionSec != null
                      ? `${Math.round(g.avgSessionSec)}s`
                      : "-"}
                  </td>
                  <td className="py-2">
                    {g.totalScore != null ? g.totalScore.toFixed(1) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 热门查询 */}
      <section>
        <h2 className="mb-2 font-semibold text-neutral-300">热门推荐查询（30天）</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-neutral-400">
                <th className="py-2 pr-4">#</th>
                <th className="py-2 pr-4">查询</th>
                <th className="py-2 pr-4">次数</th>
                <th className="py-2">平均结果</th>
              </tr>
            </thead>
            <tbody>
              {data.topQueries.map((q, i) => (
                <tr key={`${q.rawInput}-${i}`} className="border-b border-neutral-800/50">
                  <td className="py-2 pr-4 text-neutral-500">{i + 1}</td>
                  <td className="py-2 pr-4 truncate max-w-xs">{q.rawInput}</td>
                  <td className="py-2 pr-4">{q.count}</td>
                  <td className="py-2">{q.avgResultCount}</td>
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
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight
          ? "border-blue-800 bg-blue-950/50"
          : "border-neutral-800 bg-neutral-900"
      }`}
    >
      <div className="text-2xl font-bold">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="mt-1 text-sm text-neutral-400">{label}</div>
    </div>
  );
}
