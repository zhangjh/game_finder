import "dotenv/config";

import { createApp } from "./app";
import { initScheduler, stopScheduler } from "@/lib/scheduler";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOSTNAME ?? "0.0.0.0";

const app = createApp();

app.listen(port, host, () => {
  console.log(`[server] listening on http://${host}:${port}`);
});

// 应用内定时任务调度器（T3.6）：从 cron_jobs 表加载并注册 node-cron 任务。
// 失败不阻止 HTTP 服务启动（DB 未就绪等场景记录后继续）。
void initScheduler();

// 兜底：任何未捕获的异常/拒绝都记录后退出进程。
// 致命错误无法安全恢复（资源/连接可能已损坏），直接退出让外层的
// Docker restart 策略重新拉起干净进程（见 docker-compose.yml）。
const fatal = (label: string) => (err: unknown) => {
  console.error(`[server] ${label}:`, err);
  process.exit(1);
};
process.on("uncaughtException", fatal("uncaughtException"));
process.on("unhandledRejection", fatal("unhandledRejection"));

// 优雅停机：释放调度器定时器，避免进程退出后 node-cron 残留句柄
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    void stopScheduler().finally(() => process.exit(0));
  });
}
