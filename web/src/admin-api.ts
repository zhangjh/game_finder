/**
 * 管理后台 API client（T2.3）。
 * Cookie 会话跨域：credentials: "include"（Express CORS 已开 credentials）。
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

async function adminFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE_URL}/api/admin${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

export async function adminLogin(password: string): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/api/admin/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  return res.ok;
}

export async function adminLogout(): Promise<void> {
  await adminFetch("/logout", { method: "POST" });
}

export async function adminCheckSession(): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/api/admin/session`, {
    credentials: "include",
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { authed: boolean };
  return data.authed;
}

// ===== 类型 =====

export type AdminGameStatus = "draft" | "pending" | "published" | "offline";

export interface AdminGameListItem {
  id: number;
  sourceGameId: string;
  title: string;
  titleOriginal: string;
  slug: string;
  thumbnail: string | null;
  genre: string | null;
  status: AdminGameStatus;
  playCount: number;
  needsReanalysis: boolean;
  healthFailCount: number;
  createdAt: string;
  sourceCode: string;
  sourceName: string;
}

export interface AdminGamesResponse {
  items: AdminGameListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminSource {
  id: number;
  code: string;
  name: string;
  baseUrl: string | null;
  apiType: string;
  status: "active" | "paused" | "error";
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  errorCount: number;
  gameCount: number;
  gamesByStatus: Record<string, number>;
}

export interface AdminOverview {
  totalGames: number;
  byStatus: Record<string, number>;
  sourceCount: number;
  duplicatesPending: number;
}

export interface AdminDuplicatePair {
  id: number;
  similarity: number;
  reason: string;
  keepId: number;
  keepTitle: string;
  keepSlug: string | null;
  keepStatus: AdminGameStatus | null;
  keepThumbnail: string | null;
  dupId: number;
  dupTitle: string;
  dupSlug: string | null;
  dupStatus: AdminGameStatus | null;
  dupThumbnail: string | null;
}

export interface AdminDuplicatesResponse {
  items: AdminDuplicatePair[];
  total: number;
  page: number;
  pageSize: number;
}

// ===== API =====

export function fetchAdminOverview(): Promise<AdminOverview> {
  return adminFetch("/overview");
}

export function fetchAdminGames(params: {
  status?: AdminGameStatus;
  q?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminGamesResponse> {
  const sp = new URLSearchParams();
  if (params.status) sp.set("status", params.status);
  if (params.q) sp.set("q", params.q);
  if (params.sort) sp.set("sort", params.sort);
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  return adminFetch(`/games?${sp}`);
}

export function fetchAdminGameDetail(
  id: number,
): Promise<Record<string, unknown>> {
  return adminFetch(`/games/${id}`);
}

export function setAdminGameStatus(
  id: number,
  status: AdminGameStatus,
): Promise<{ id: number; status: AdminGameStatus }> {
  return adminFetch(`/games/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

export function fetchAdminSources(): Promise<AdminSource[]> {
  return adminFetch("/sources");
}

export function fetchAdminDuplicates(
  page = 1,
): Promise<AdminDuplicatesResponse> {
  return adminFetch(`/duplicates?page=${page}`);
}

export function mergeAdminDuplicate(
  pairId: number,
  keep: "keep" | "dup",
): Promise<{ pair: { id: number }; keptId: number; offlinedId: number }> {
  return adminFetch(`/duplicates/${pairId}/merge`, {
    method: "POST",
    body: JSON.stringify({ keep }),
  });
}

export function dismissAdminDuplicate(
  pairId: number,
): Promise<{ id: number }> {
  return adminFetch(`/duplicates/${pairId}/dismiss`, { method: "POST" });
}

// ===== 定时任务 =====

export type AdminCronJobType = "sync_games" | "health_check" | "detect_duplicates";
export type AdminCronJobStatus = "enabled" | "disabled";

export interface AdminCronJob {
  id: number;
  type: AdminCronJobType;
  name: string;
  description: string | null;
  schedule: string;
  status: AdminCronJobStatus;
  params: Record<string, unknown> | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunDurationMs: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCronJobRun {
  id: number;
  jobId: number;
  status: "ok" | "error" | "running";
  trigger: "schedule" | "manual";
  result: Record<string, unknown> | null;
  error: string | null;
  durationMs: number | null;
  startedAt: string;
  finishedAt: string | null;
}

export function fetchAdminCronJobs(): Promise<{ items: AdminCronJob[] }> {
  return adminFetch("/cron-jobs");
}

export function createAdminCronJob(input: {
  type: AdminCronJobType;
  name: string;
  description?: string;
  schedule: string;
  status?: AdminCronJobStatus;
  params?: Record<string, unknown>;
}): Promise<AdminCronJob> {
  return adminFetch("/cron-jobs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAdminCronJob(
  id: number,
  input: {
    name?: string;
    description?: string | null;
    schedule?: string;
    status?: AdminCronJobStatus;
    params?: Record<string, unknown>;
  },
): Promise<AdminCronJob> {
  return adminFetch(`/cron-jobs/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function setAdminCronJobStatus(
  id: number,
  status: AdminCronJobStatus,
): Promise<AdminCronJob> {
  return adminFetch(`/cron-jobs/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

export function triggerAdminCronJob(id: number): Promise<{
  jobId: number;
  status: string;
  durationMs: number;
}> {
  return adminFetch(`/cron-jobs/${id}/trigger`, { method: "POST" });
}

export function fetchAdminCronJobRuns(
  id: number,
  limit = 20,
): Promise<{ items: AdminCronJobRun[] }> {
  return adminFetch(`/cron-jobs/${id}/runs?limit=${limit}`);
}

export function deleteAdminCronJob(id: number): Promise<{ ok: boolean }> {
  return adminFetch(`/cron-jobs/${id}`, { method: "DELETE" });
}
