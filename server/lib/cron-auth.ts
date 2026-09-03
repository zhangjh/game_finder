/**
 * Cron 鉴权（T3.6）：/api/cron/* 共用。
 *
 * 按优先级：x-cron-secret 头 / Authorization Bearer / ?secret= 参数。
 * 生产必须配置 CRON_SECRET；本地 dev 未配置时放行。
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const url = new URL(request.url);
  const header =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("secret");
  return header === secret;
}
