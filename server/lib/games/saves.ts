/**
 * 游戏续玩存档查询层。
 *
 * data 是 GamePix externalSave 的 opaque blob（player localStorage[namespace]
 * 的 JSON.stringify 值）。DB 中以 jsonb 存解析后的对象以支持将来查询；
 * 对客户端则始终序列化为「源字符串」，与播放器 LOAD_DATA 期望的格式一致。
 */
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { gameSaves, games } from "@/lib/db/schema";

/** 取某用户对某游戏的存档；data 以源字符串形式返回（无存档→null） */
export async function getGameSave(
  userId: string,
  slug: string,
): Promise<{ data: string; updatedAt: Date } | null> {
  const rows = await db
    .select({
      data: gameSaves.data,
      updatedAt: gameSaves.updatedAt,
    })
    .from(gameSaves)
    .innerJoin(games, eq(gameSaves.gameId, games.id))
    .where(and(eq(games.slug, slug), eq(gameSaves.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { data: JSON.stringify(row.data), updatedAt: row.updatedAt };
}

/**
 * 覆盖写入/创建存档（upsert：每用户每游戏仅一份）。data 形如
 * '{"life":3,"level":7}'，解析后落 jsonb；更新 updated_at。
 */
export async function upsertGameSave(
  userId: string,
  slug: string,
  data: string,
): Promise<void> {
  // 先按 slug 解析出游戏 id
  const gameRow = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.slug, slug))
    .limit(1);
  if (gameRow.length === 0) return; // 游戏不存在，静默忽略

  const parsed = JSON.parse(data);
  await db
    .insert(gameSaves)
    .values({
      userId,
      gameId: gameRow[0].id,
      data: parsed,
    })
    .onConflictDoUpdate({
      target: [gameSaves.userId, gameSaves.gameId],
      set: {
        data: parsed,
        updatedAt: new Date(),
      },
    });
}

/** 删除某用户对某游戏的存档（「重新开始」时调用） */
export async function clearGameSave(
  userId: string,
  slug: string,
): Promise<void> {
  const gameRow = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.slug, slug))
    .limit(1);
  if (gameRow.length === 0) return;
  await db
    .delete(gameSaves)
    .where(
      and(eq(gameSaves.userId, userId), eq(gameSaves.gameId, gameRow[0].id)),
    );
}