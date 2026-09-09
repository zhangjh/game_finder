/**
 * 后端 API client。
 * 生产构建必须通过 VITE_API_BASE_URL 指向独立 API 域名；
 * 本地开发未配置时默认使用 http://localhost:3001。
 */
import type {
  GameDetail,
  GameListItem,
  GameListResponse,
  GameSavePutResponse,
  GameSaveResponse,
  RecommendRequestBody,
  RecommendResponse,
} from "@game-finder/shared";

import { API_BASE_URL } from "./api-base";
import { getPersistedUserId } from "./analytics/user-id";

const BASE_URL = API_BASE_URL;

export type GameListQueryParams = {
  /**
   * 界面语种（T1.7）：zh=只返回中文元数据游戏，en=全部（英文原始字段恒存在）。
   * 缺省时服务端不过滤。
   */
  lang?: "zh" | "en";
  genre?: string;
  duration?: number;
  players?: number | "multi";
  platform?: "mobile" | "desktop";
  mood?: "relaxing";
  q?: string;
  sort?: "popular" | "newest" | "score" | "random" | "quality";
  /** 源站质量分下限（> 该值），如 0.9 */
  minQualityScore?: number;
  page?: number;
  pageSize?: number;
};

export async function fetchGames(
  params: GameListQueryParams = {},
): Promise<GameListResponse> {
  const sp = new URLSearchParams();
  if (params.lang) sp.set("lang", params.lang);
  if (params.genre) sp.set("genre", params.genre);
  if (params.duration) sp.set("duration", String(params.duration));
  if (params.players) sp.set("players", String(params.players));
  if (params.platform) sp.set("platform", params.platform);
  if (params.mood) sp.set("mood", params.mood);
  if (params.q) sp.set("q", params.q);
  if (params.sort) sp.set("sort", params.sort);
  if (params.minQualityScore != null)
    sp.set("minQualityScore", String(params.minQualityScore));
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));

  const res = await fetch(`${BASE_URL}/api/games?${sp}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchGameDetail(
  slug: string,
): Promise<GameDetail | null> {
  const res = await fetch(`${BASE_URL}/api/games/${slug}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchSimilarGames(
  slug: string,
  lang?: "zh" | "en",
): Promise<GameListItem[]> {
  const qs = lang ? `?lang=${lang}` : "";
  const res = await fetch(`${BASE_URL}/api/games/${slug}/similar${qs}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = (await res.json()) as { items: GameListItem[] };
  return data.items;
}

/** AI Game Finder 推荐（自然语言 / 快捷条件） */
export async function fetchRecommendation(
  body: RecommendRequestBody,
): Promise<RecommendResponse> {
  const res = await fetch(`${BASE_URL}/api/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(data?.message ?? `API error: ${res.status}`);
  }
  return res.json();
}

/* ===== 游戏续玩存档（M6.5）===== */

/** 是否为 GamePix 嵌入地址（externalSave 仅对该源生效） */
export function isGamePixEmbed(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "gamepix.com" || h.endsWith(".gamepix.com");
  } catch {
    return false;
  }
}

/** 在 GamePix embed URL 上追加 externalSave=true（幂等） */
export function withExternalSave(url: string): string {
  try {
    const u = new URL(url);
    if (
      (u.hostname === "gamepix.com" || u.hostname.endsWith(".gamepix.com")) &&
      u.searchParams.get("externalSave") !== "true"
    ) {
      u.searchParams.set("externalSave", "true");
      return u.toString();
    }
  } catch {
    /* 非法 URL 原样返回 */
  }
  return url;
}

/** 匿名 uid；Cookie 不可用（无存储/禁 cookie）时返回 null */
export function getSaveUserId(): string | null {
  return getPersistedUserId();
}

/**
 * 读取某游戏存档。无存档 / 无法识别身份时返回 { data:null, saved:false }。
 */
export async function fetchGameSave(
  slug: string,
): Promise<GameSaveResponse> {
  const uid = getSaveUserId();
  const res = await fetch(`${BASE_URL}/api/games/${slug}/save`, {
    headers: uid ? { "x-user-id": uid } : {},
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/** 覆盖写入某游戏存档；返回是否真正落库（无身份时为 false） */
export async function putGameSave(
  slug: string,
  data: string,
): Promise<GameSavePutResponse> {
  const uid = getSaveUserId();
  if (!uid) return { saved: false };
  const res = await fetch(`${BASE_URL}/api/games/${slug}/save`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-user-id": uid },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/** 删除某游戏存档（「重新开始」清档）；无身份时为 false */
export async function clearGameSave(
  slug: string,
): Promise<GameSavePutResponse> {
  const uid = getSaveUserId();
  if (!uid) return { saved: false };
  const res = await fetch(`${BASE_URL}/api/games/${slug}/save`, {
    method: "DELETE",
    headers: { "x-user-id": uid },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
