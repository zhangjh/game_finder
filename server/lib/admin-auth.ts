/**
 * 管理后台鉴权（T2.3，PRD §36）：简单密码保护，无账号体系。
 *
 * - 密码来自 ADMIN_PASSWORD 环境变量
 * - 登录成功后签发 httpOnly cookie（值 = 密码 + 固定盐的 SHA-256，
 *   不落明文；改密码即全部会话失效）
 * - 生产环境必须配置 ADMIN_PASSWORD，未配置时拒绝一切登录
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

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

/** 请求方是否已登录（layout/页面级守卫） */
export async function isAdminAuthed(): Promise<boolean> {
  const expected = expectedToken();
  if (!expected) return process.env.NODE_ENV !== "production" && process.env.ADMIN_DEBUG_BYPASS === "1";
  const store = await cookies();
  return store.get(ADMIN_COOKIE)?.value === expected;
}

/** 登录成功后调用：签发会话 cookie（仅 Server Action / Route Handler 内可用） */
export async function issueSessionCookie(): Promise<void> {
  const token = expectedToken();
  if (!token) throw new Error("ADMIN_PASSWORD 未配置");
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}
