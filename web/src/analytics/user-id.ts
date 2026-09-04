/**
 * 匿名用户标识（T6.1，PRD §41）。
 *
 * Cookie 写入匿名 user_id（crypto.randomUUID），
 * 服务端读取注入埋点上下文。无账号体系。
 *
 * 存储：`_gf_uid` cookie，有效期 365 天，SameSite=Lax。
 */
const COOKIE_NAME = "_gf_uid";
const COOKIE_DAYS = 365;

function parseCookie(name: string): string | null {
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function setCookie(name: string, value: string, days: number): void {
  const expires = new Date(Date.now() + days * 86400_000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

/**
 * 获取或创建匿名用户 ID。
 * 首次访问生成 crypto.randomUUID() 并写入 Cookie；
 * 后续访问直接读取。
 */
export function getUserId(): string {
  const existing = parseCookie(COOKIE_NAME);
  if (existing) return existing;

  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : // 降级：Math.random 拼接（非加密安全，仅做匿名统计）
        `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });

  setCookie(COOKIE_NAME, id, COOKIE_DAYS);
  return id;
}
