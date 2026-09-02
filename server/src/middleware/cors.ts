import cors from "cors";
import type { CorsOptions } from "cors";

/**
 * CORS（由原 Next.js proxy.ts 迁移而来）。
 *
 * 公开前台部署在 Cloudflare Pages 主域，跨域调用本 API（api 子域，VPS）。
 * 允许来源由 ALLOWED_ORIGINS 环境变量配置（逗号分隔，如
 * https://example.com,http://localhost:5173）；未配置时允许所有来源
 * （公开游戏数据本身无敏感性，加入推荐 API 后可收紧）。
 *
 * 仅对 /api/* 生效，与旧 proxy.ts 的 matcher 一致。
 */
const configured =
  process.env.ALLOWED_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

const options: CorsOptions = {
  origin(origin, cb) {
    // 非浏览器请求（无 Origin）不拦截
    if (!origin) return cb(null, true);
    // 未配置白名单：回显放行所有来源
    if (configured.length === 0) return cb(null, true);
    return cb(null, configured.includes(origin));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
};

/** 供 app.ts 挂载到 /api 下的中间件 */
export const corsApi = cors(options);
