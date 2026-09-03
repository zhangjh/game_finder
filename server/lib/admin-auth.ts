/**
 * 管理后台鉴权（T2.3，PRD §36）：简单密码保护，无账号体系。
 *
 * - 密码来自 ADMIN_PASSWORD 环境变量
 * - 登录成功后签发 httpOnly cookie（值 = 密码 + 固定盐的 SHA-256，
 *   不落明文；改密码即全部会话失效）
 * - 生产环境必须配置 ADMIN_PASSWORD，未配置时拒绝一切登录
 *
 * Express 版：手动解析 Cookie header + 中间件守卫。
 * SPA（主域）跨域调用 api 子域，需要前端 fetch credentials:"include"
 * 且 CORS 允许 credentials（见 middleware/cors.ts）。
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const ADMIN_COOKIE = "gf_admin_session";
const COOKIE_MAX_AGE = 60 * 60 * 12; // 12 小时

function expectedToken(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;
  return createHash("sha256").update(`gf-admin:${password}`).digest("hex");
}

export function verifyPassword(input: string): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false; // 未配置密码：拒绝（含生产防呆）
  const a = Buffer.from(input);
  const b = Buffer.from(password);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 从请求中解析会话 cookie（不引 cookie-parser，手动取 header 即可） */
function readSessionToken(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === ADMIN_COOKIE) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

const cookieOptions = (dev: boolean) => ({
  httpOnly: true,
  // 生产：SPA 主域 ↔ api 子域跨站，需 none+secure；
  // 本地 http：lax（Vite dev 和 API 都在 localhost，同站）
  sameSite: (dev ? "lax" : "none") as "lax" | "none",
  secure: !dev,
  maxAge: COOKIE_MAX_AGE * 1000,
  path: "/",
});

/** 登录成功后签发会话 cookie（dev=http 本地环境） */
export function issueSessionCookie(res: Response, dev = false): void {
  const token = expectedToken();
  if (!token) throw new Error("ADMIN_PASSWORD 未配置");
  res.cookie(ADMIN_COOKIE, token, cookieOptions(dev));
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(ADMIN_COOKIE, { path: "/" });
}

/**
 * 管理路由守卫中间件：未登录返回 401。
 * 未配置 ADMIN_PASSWORD 时一律 401（拒绝服务优于裸奔）。
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const expected = expectedToken();
  if (!expected) {
    res.status(401).json({ error: "admin_disabled" });
    return;
  }
  if (readSessionToken(req) !== expected) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

/** 是否已登录（GET /api/admin/session 探测用） */
export function isAdminAuthed(req: Request): boolean {
  const expected = expectedToken();
  if (!expected) return false;
  return readSessionToken(req) === expected;
}
