/**
 * 匿名用户身份解析（续玩存档用）。
 *
 * 前端将 `_gf_uid` Cookie UUID 通过 `x-user-id` 请求头发送；
 * 后端据此识别，并在响应中原样回写同一 `_gf_uid` Cookie
 * （SameSite=Lax，365 天），保证跨域（主域↔api 子域）身份一致、
 * 且不引入 SameSite=None 的跨站 Cookie。
 *
 * 也兼容直接携带 `_gf_uid` Cookie 的调用（同站部署场景）。
 */
import type { Request, Response } from "express";

const COOKIE_NAME = "_gf_uid";
const COOKIE_DAYS = 365;

function setUidCookie(res: Response, value: string): void {
  const expires = new Date(Date.now() + COOKIE_DAYS * 86400_000).toUTCString();
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(value)}; Expires=${expires}; Path=/; SameSite=Lax`,
  );
}

export function resolveUserId(req: Request, res: Response): string | null {
  const header = String(req.headers["x-user-id"] ?? "").trim();
  if (header) {
    setUidCookie(res, header);
    return header;
  }
  const cookie = req.headers.cookie ?? "";
  const match = cookie
    .split("; ")
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (match) {
    const value = decodeURIComponent(match.split("=")[1]);
    return value;
  }
  return null;
}