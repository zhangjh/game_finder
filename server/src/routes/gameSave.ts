/**
 * GET/PUT /api/games/:slug/save — 游戏续玩存档（M6.5）。
 *
 * 无账号体系：身份为匿名 `_gf_uid` Cookie UUID，前端经 `x-user-id` 请求头
 * 传递并回写 Cookie（见 middleware/uid.ts）。
 *
 * - GET  返回 { data: string|null, updatedAt: string|null }，data 为
 *   GamePix externalSave 存档原始字符串（无存档时 data=null）。
 * - PUT  请求体 { data: string }，整体覆盖该用户该游戏的存档。
 *   仅当能解析出用户身份时才落库；无身份（浏览器禁 cookie/uid 拿不到）
 *   返回 200 + { saved:false }，前端据此保持现状（不跳转源站）。
 */
import { Router } from "express";

import { clearGameSave, getGameSave, upsertGameSave } from "@/lib/games/saves";

import { resolveUserId } from "../middleware/uid";

export const gameSaveRouter = Router();

/** PUT 前的 data 负载校验：必须是合法的源字符串且能被解析为对象 */
function parseSaveData(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 512 * 1024) return null;
  try {
    const v = JSON.parse(raw);
    // 播放器期望其 localStorage[namespace] 的值为「对象」，
    // 但兼容顶层标量/数组都整体透传。
    if (v === null || v === undefined) return null;
    return raw;
  } catch {
    return null;
  }
}

gameSaveRouter.get("/:slug/save", async (req, res) => {
  const { slug } = req.params;
  const userId = resolveUserId(req, res);
  if (!userId) {
    res.json({ data: null, updatedAt: null, saved: false });
    return;
  }
  try {
    const save = await getGameSave(userId, slug);
    res.json({
      data: save ? save.data : null,
      updatedAt: save ? save.updatedAt.toISOString() : null,
      saved: !!save,
    });
  } catch (err) {
    console.error("[api/games/:slug/save] get failed:", err);
    res.status(500).json({ error: "failed_to_get_save" });
  }
});

gameSaveRouter.put("/:slug/save", async (req, res) => {
  const { slug } = req.params;
  const data = parseSaveData((req.body as { data?: unknown } | undefined)?.data);
  if (!data) {
    res.status(400).json({ error: "bad_request", message: "data 必填且为合法 JSON" });
    return;
  }
  const userId = resolveUserId(req, res);
  if (!userId) {
    // 与前端约定：无身份时不落库，返回 saved:false 保持现状
    res.json({ saved: false });
    return;
  }
  try {
    await upsertGameSave(userId, slug, data);
    res.json({ saved: true });
  } catch (err) {
    console.error("[api/games/:slug/save] put failed:", err);
    res.status(500).json({ error: "failed_to_save" });
  }
});

gameSaveRouter.delete("/:slug/save", async (req, res) => {
  const { slug } = req.params;
  const userId = resolveUserId(req, res);
  if (!userId) {
    res.json({ saved: false });
    return;
  }
  try {
    await clearGameSave(userId, slug);
    res.json({ saved: true });
  } catch (err) {
    console.error("[api/games/:slug/save] delete failed:", err);
    res.status(500).json({ error: "failed_to_clear_save" });
  }
});