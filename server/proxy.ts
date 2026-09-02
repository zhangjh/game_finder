import { NextResponse, type NextRequest } from "next/server";

/**
 * CORS（Next.js 16 的 proxy，原 middleware）。
 *
 * 公开前台部署在 Cloudflare Pages 主域，跨域调用本 API（api 子域，VPS）。
 * 允许来源由 ALLOWED_ORIGINS 环境变量配置（逗号分隔，如
 * https://example.com,http://localhost:5173）；未配置时允许所有来源
 * （公开游戏数据本身无敏感性，M5 加入推荐 API 后收紧）。
 */
function allowedOrigin(request: NextRequest): string | undefined {
  const origin = request.headers.get("origin");
  if (!origin) return undefined;

  const configured = process.env.ALLOWED_ORIGINS;
  if (!configured) return origin; // 未配置：回显放行

  const list = configured
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(origin) ? origin : undefined;
}

export function proxy(request: NextRequest) {
  const origin = allowedOrigin(request);
  const headers = new Headers();

  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  // 预检请求直接应答
  if (request.method === "OPTIONS") {
    headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    headers.set("Access-Control-Max-Age", "86400");
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  for (const [k, v] of headers.entries()) response.headers.set(k, v);
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
