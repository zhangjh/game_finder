import "dotenv/config";

import { createApp } from "./app";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOSTNAME ?? "0.0.0.0";

const app = createApp();

app.listen(port, host, () => {
  console.log(`[server] listening on http://${host}:${port}`);
});

// 兜底：任何未捕获的异常/拒绝都记录后退出进程。
// 致命错误无法安全恢复（资源/连接可能已损坏），直接退出让外层的
// Docker restart 策略重新拉起干净进程（见 docker-compose.yml）。
const fatal = (label: string) => (err: unknown) => {
  console.error(`[server] ${label}:`, err);
  process.exit(1);
};
process.on("uncaughtException", fatal("uncaughtException"));
process.on("unhandledRejection", fatal("unhandledRejection"));
