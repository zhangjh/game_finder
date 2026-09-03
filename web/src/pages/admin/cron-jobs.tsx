import { useCallback, useEffect, useState } from "react";

import {
  createAdminCronJob,
  deleteAdminCronJob,
  fetchAdminCronJobRuns,
  fetchAdminCronJobs,
  setAdminCronJobStatus,
  triggerAdminCronJob,
  updateAdminCronJob,
  type AdminCronJob,
  type AdminCronJobRun,
  type AdminCronJobType,
} from "../../admin-api";

const TYPE_LABEL: Record<AdminCronJobType, string> = {
  sync_games: "游戏源同步",
  health_check: "健康巡检",
  detect_duplicates: "重复检测",
  analyze_games: "AI 画像分析",
  relation_games: "相似游戏预计算",
};

const STATUS_LABEL: Record<string, string> = {
  enabled: "已启用",
  disabled: "已停用",
  running: "执行中",
  ok: "成功",
  error: "失败",
};

/** 定时任务管理（T3.6 应用内调度）：替代 VPS crontab，后台可启停/编辑/手动执行/看历史 */
export function AdminCronJobsPage() {
  const [jobs, setJobs] = useState<AdminCronJob[] | null>(null);
  const [error, setError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [runsFor, setRunsFor] = useState<{ job: AdminCronJob; runs: AdminCronJobRun[] } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetchAdminCronJobs();
      setJobs(res.items);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: number, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError(false);
    try {
      await fn();
      await load();
    } catch {
      setError(true);
    } finally {
      setBusyId(null);
    }
  }

  async function toggle(job: AdminCronJob) {
    const next = job.status === "enabled" ? "disabled" : "enabled";
    await act(job.id, () => setAdminCronJobStatus(job.id, next));
  }

  async function trigger(job: AdminCronJob) {
    await act(job.id, () => triggerAdminCronJob(job.id));
    // 手动触发后刷新运行历史（如当前已展开）
    if (runsFor?.job.id === job.id) {
      const runs = await fetchAdminCronJobRuns(job.id);
      setRunsFor((cur) => (cur ? { job: cur.job, runs: runs.items } : cur));
    }
  }

  async function remove(job: AdminCronJob) {
    if (!confirm(`删除任务「${job.name}」？将同时删除其运行记录。`)) return;
    await act(job.id, () => deleteAdminCronJob(job.id));
  }

  async function openRuns(job: AdminCronJob) {
    setBusyId(job.id);
    try {
      const res = await fetchAdminCronJobRuns(job.id);
      setRunsFor({ job, runs: res.items });
    } catch {
      setError(true);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">定时任务</h1>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded bg-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-600"
        >
          + 新建任务
        </button>
      </div>

      {showCreate && (
        <CreateCronJobForm
          onDone={() => {
            setShowCreate(false);
            load();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {error && <p className="mb-3 text-sm text-red-400">操作失败，请重试</p>}

      {!jobs ? (
        <p className="text-neutral-500">加载中…</p>
      ) : jobs.length === 0 ? (
        <p className="rounded-lg border border-neutral-800 p-8 text-center text-neutral-500">
          暂无定时任务
        </p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{job.name}</span>
                    <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
                      {TYPE_LABEL[job.type]}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        job.status === "enabled" ? "bg-emerald-900/50 text-emerald-400" : "bg-neutral-800 text-neutral-500"
                      }`}
                    >
                      {STATUS_LABEL[job.status]}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">{job.description}</div>
                  {job.type === "analyze_games" && (
                    <div className="mt-1 text-xs text-sky-400">
                      ⓘ 默认无需独立调度：游戏源同步完成后会自动跟随分析，这里保留供手动触发
                    </div>
                  )}
                  <div className="mt-1 text-xs text-neutral-500">
                    计划：<code className="text-neutral-300">{job.schedule}</code>
                    {job.lastRunAt && (
                      <span className="ml-3">
                        上次：
                        <span className={job.lastRunStatus === "ok" ? "text-emerald-400" : "text-red-400"}>
                          {STATUS_LABEL[job.lastRunStatus ?? ""] ?? job.lastRunStatus}
                        </span>{" "}
                        {new Date(job.lastRunAt).toLocaleString("zh-CN")}
                        {job.lastRunDurationMs != null && `（${(job.lastRunDurationMs / 1000).toFixed(1)}s）`}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => toggle(job)}
                    disabled={busyId === job.id}
                    className={`rounded px-3 py-1.5 text-xs disabled:opacity-50 ${
                      job.status === "enabled"
                        ? "border border-amber-700 text-amber-400 hover:bg-amber-950/40"
                        : "bg-emerald-700/80 text-neutral-100 hover:bg-emerald-600"
                    }`}
                  >
                    {job.status === "enabled" ? "停用" : "启用"}
                  </button>
                  <button
                    onClick={() => trigger(job)}
                    disabled={busyId === job.id || job.running}
                    className="rounded bg-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-600 disabled:opacity-50"
                    title={job.running ? "任务正在执行中，请等待完成" : undefined}
                  >
                    {job.running ? "执行中…" : "立即执行"}
                  </button>
                  <button
                    onClick={() => openRuns(job)}
                    disabled={busyId === job.id}
                    className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:text-white disabled:opacity-50"
                  >
                    运行记录
                  </button>
                  <EditCronJobButton job={job} onDone={load} onError={() => setError(true)} />
                  <button
                    onClick={() => remove(job)}
                    disabled={busyId === job.id}
                    className="rounded border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/40 disabled:opacity-50"
                  >
                    删除
                  </button>
                </div>
              </div>

              {runsFor?.job.id === job.id && (
                <RunHistory
                  runs={runsFor.runs}
                  onClose={() => setRunsFor(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RunHistory({
  runs,
  onClose,
}: {
  runs: AdminCronJobRun[];
  onClose: () => void;
}) {
  return (
    <div className="mt-3 rounded border border-neutral-800 bg-neutral-950/50 p-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-neutral-300">最近执行</span>
        <button onClick={onClose} className="text-xs text-neutral-500 hover:text-white">
          关闭
        </button>
      </div>
      {runs.length === 0 ? (
        <p className="text-xs text-neutral-500">暂无运行记录</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="py-1 pr-3">时间</th>
              <th className="py-1 pr-3">触发</th>
              <th className="py-1 pr-3">状态</th>
              <th className="py-1 pr-3">耗时</th>
              <th className="py-1">详情</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-neutral-900">
                <td className="py-1.5 pr-3 text-neutral-400">
                  {new Date(r.startedAt).toLocaleString("zh-CN")}
                </td>
                <td className="py-1.5 pr-3 text-neutral-500">
                  {r.trigger === "manual" ? "手动" : "定时"}
                </td>
                <td
                  className={`py-1.5 pr-3 font-medium ${
                    r.status === "ok" ? "text-emerald-400" : r.status === "error" ? "text-red-400" : "text-amber-400"
                  }`}
                >
                  {STATUS_LABEL[r.status] ?? r.status}
                </td>
                <td className="py-1.5 pr-3 text-neutral-400">
                  {r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : "—"}
                </td>
                <td className="py-1.5 text-neutral-500">
                  {r.error ? (
                    <span className="text-red-400" title={r.error}>
                      {r.error}
                    </span>
                  ) : r.result ? (
                    <span className="block max-w-md truncate" title={JSON.stringify(r.result)}>
                      {JSON.stringify(r.result)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EditCronJobButton({
  job,
  onDone,
  onError,
}: {
  job: AdminCronJob;
  onDone: () => void;
  onError: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [schedule, setSchedule] = useState(job.schedule);
  const [name, setName] = useState(job.name);
  const [description, setDescription] = useState(job.description ?? "");
  const [params, setParams] = useState(
    job.params ? JSON.stringify(job.params, null, 2) : "{}",
  );

  async function save() {
    let parsedParams: Record<string, unknown> = {};
    try {
      parsedParams = params.trim() ? JSON.parse(params) : {};
    } catch {
      alert("参数必须是合法 JSON");
      return;
    }
    try {
      await updateAdminCronJob(job.id, {
        name,
        description: description || null,
        schedule,
        params: parsedParams,
      });
      setEditing(false);
      onDone();
    } catch {
      onError();
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
      >
        编辑
      </button>
    );
  }

  return (
    <div className="mt-3 w-full rounded border border-neutral-700 bg-neutral-950/50 p-3">
      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs">
          <span className="mb-1 block text-neutral-500">名称</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-neutral-500">Cron 表达式（分 时 日 月 周）</span>
          <input
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
            placeholder="0 */6 * * *"
          />
        </label>
      </div>
      <label className="mb-2 block text-xs">
        <span className="mb-1 block text-neutral-500">描述</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
        />
      </label>
      <label className="mb-3 block text-xs">
        <span className="mb-1 block text-neutral-500">参数（JSON，可选）</span>
        <textarea
          value={params}
          onChange={(e) => setParams(e.target.value)}
          rows={3}
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono text-xs"
        />
      </label>
      <div className="flex gap-2">
        <button
          onClick={save}
          className="rounded bg-emerald-700 px-3 py-1.5 text-xs hover:bg-emerald-600"
        >
          保存
        </button>
        <button
          onClick={() => setEditing(false)}
          className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400"
        >
          取消
        </button>
      </div>
    </div>
  );
}

function CreateCronJobForm({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<AdminCronJobType>("sync_games");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [schedule, setSchedule] = useState("0 */6 * * *");
  const [params, setParams] = useState("{}");

  async function submit() {
    let parsedParams: Record<string, unknown> = {};
    try {
      parsedParams = params.trim() ? JSON.parse(params) : {};
    } catch {
      alert("参数必须是合法 JSON");
      return;
    }
    try {
      await createAdminCronJob({
        type,
        name: name || TYPE_LABEL[type],
        description: description || undefined,
        schedule,
        params: parsedParams,
      });
      onDone();
    } catch {
      alert("创建失败，请检查 Cron 表达式格式");
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-neutral-700 bg-neutral-900 p-4">
      <p className="mb-3 font-medium">新建定时任务</p>
      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs">
          <span className="mb-1 block text-neutral-500">任务类型</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AdminCronJobType)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
          >
            {(Object.keys(TYPE_LABEL) as AdminCronJobType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-neutral-500">Cron 表达式</span>
          <input
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
            placeholder="0 */6 * * *"
          />
        </label>
      </div>
      <label className="mb-2 block text-xs">
        <span className="mb-1 block text-neutral-500">名称</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
          placeholder={TYPE_LABEL[type]}
        />
      </label>
      <label className="mb-2 block text-xs">
        <span className="mb-1 block text-neutral-500">描述</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
        />
      </label>
      <label className="mb-3 block text-xs">
        <span className="mb-1 block text-neutral-500">参数（JSON，可选，如 {"{\"limit\":500}"}）</span>
        <textarea
          value={params}
          onChange={(e) => setParams(e.target.value)}
          rows={2}
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono text-xs"
        />
      </label>
      <div className="flex gap-2">
        <button
          onClick={submit}
          className="rounded bg-emerald-700 px-3 py-1.5 text-xs hover:bg-emerald-600"
        >
          创建
        </button>
        <button
          onClick={onCancel}
          className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400"
        >
          取消
        </button>
      </div>
    </div>
  );
}
