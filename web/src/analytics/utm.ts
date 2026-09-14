/**
 * UTM 参数捕获（DANTE-7 流量看板）。
 *
 * 目标：外部分享/推广链接（微信/小红书/B站/搜索引擎…）带 utm_* 参数进入，
 * 我们把它与后端 page_view 事件一起落库，形成渠道归因。
 *
 * 规则：
 * - 页面首次加载时从 window.location.search 读 utm_*, 有效则持久化到
 *   sessionStorage（整段会话内后续 SPA 路由跳转都带上同一归因）。
 * - 仅保留本次会话, 避免跨会话串号归因。
 * - utm_source 为渠道核心; utm_medium/google 等为补充信息。
 */
const STORAGE_KEY = "_gf_utm";

export interface UtmParams {
  source: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}

const UTM_KEYS = ["source", "medium", "campaign", "content", "term"] as const;

function readFromSearch(search: string): UtmParams | null {
  try {
    const params = new URLSearchParams(search);
    const values: Record<string, string> = {};
    for (const key of UTM_KEYS) {
      const v = params.get(`utm_${key}`)?.trim();
      if (v) values[key] = v;
    }
    if (!values.source) return null;
    const out: UtmParams = { source: values.source! };
    for (const key of ["medium", "campaign", "content", "term"] as const) {
      if (values[key]) out[key] = values[key];
    }
    return out;
  } catch {
    return null;
  }
}

/** 页面加载时读取 location.search 的 UTM 并持久化（仅一次，幂等） */
export function initUtmTracking(): UtmParams | null {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") {
    return null;
  }
  try {
    if (sessionStorage.getItem(STORAGE_KEY)) {
      return getStoredUtm();
    }
  } catch {
    /* sessionStorage 不可用时忽略, 降级为仅 URL 生效 */
  }
  const captured = readFromSearch(window.location.search);
  if (captured) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(captured));
    } catch {
      /* ignore */
    }
    return captured;
  }
  return null;
}

function getStoredUtm(): UtmParams | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UtmParams;
    return typeof parsed.source === "string" && parsed.source ? parsed : null;
  } catch {
    return null;
  }
}

/** 读取本次会话的 UTM（无 sessionStorage 时退化为 URL 查询参数） */
export function getUtm(): UtmParams | null {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") {
    return typeof window === "undefined" ? null : readFromSearch(window.location.search);
  }
  return getStoredUtm() ?? readFromSearch(window.location.search) ?? null;
}

/** 把当前 UTM 追加到分享链接（保持原始路径、丢弃已有 utm_* 避免污染） */
export function appendUtm(url: string, extra: Partial<UtmParams> = {}): string {
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "https://playwhat.cc");
    for (const key of UTM_KEYS) {
      u.searchParams.delete(`utm_${key}`);
    }
    const base = getUtm();
    const merged: UtmParams = {
      source: extra.source ?? base?.source ?? "link",
      medium: extra.medium ?? base?.medium ?? "post",
      campaign: extra.campaign ?? base?.campaign,
      content: extra.content ?? base?.content,
      term: extra.term ?? base?.term,
    };
    for (const key of UTM_KEYS) {
      if (merged[key]) u.searchParams.set(`utm_${key}`, merged[key]!);
    }
    return u.toString();
  } catch {
    return url;
  }
}