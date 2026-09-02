/**
 * 后端 API client。
 * API 地址通过 Vite 环境变量注入：
 *   开发：.env.local 里 VITE_API_BASE_URL=http://localhost:3000
 *   生产（CF Pages 构建时）：VITE_API_BASE_URL=https://api.example.com
 */
import type {
  GameDetail,
  GameListItem,
  GameListResponse,
} from "@game-finder/shared";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export type GameListQueryParams = {
  genre?: string;
  duration?: number;
  players?: number | "multi";
  platform?: "mobile" | "desktop";
  q?: string;
  sort?: "popular" | "newest" | "score" | "random";
  page?: number;
  pageSize?: number;
};

export async function fetchGames(
  params: GameListQueryParams = {},
): Promise<GameListResponse> {
  const sp = new URLSearchParams();
  if (params.genre) sp.set("genre", params.genre);
  if (params.duration) sp.set("duration", String(params.duration));
  if (params.players) sp.set("players", String(params.players));
  if (params.platform) sp.set("platform", params.platform);
  if (params.q) sp.set("q", params.q);
  if (params.sort) sp.set("sort", params.sort);
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
): Promise<GameListItem[]> {
  const res = await fetch(`${BASE_URL}/api/games/${slug}/similar`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = (await res.json()) as { items: GameListItem[] };
  return data.items;
}
