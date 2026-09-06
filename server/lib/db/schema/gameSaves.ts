import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { games } from "./games";

/**
 * 游戏续玩存档（M6.5）。
 *
 * 无账号体系，user_id 为匿名 `_gf_uid` Cookie UUID（PRD §41）。
 * 每个 (user_id, game_id) 仅保留一份最新存档，SAVE_DATA 到达即整体覆盖。
 *
 * data 为 opaque 的 GamePix externalSave 存档 blob（JSON 字符串的水得极深：
 * 前端存的是「player localStorage[namespace] 的 JSON.stringify 值」）。
 * 这里用 jsonb 存解析后的对象供将来查询/展示，回传时序列化回源格式。
 */
export const gameSaves = pgTable(
  "game_saves",
  {
    id: serial("id").primaryKey(),
    /** 匿名设备 ID（_gf_uid Cookie UUID） */
    userId: text("user_id").notNull(),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    /** 源存档负载（解析后的对象；回传时 JSON.stringify 回 source 格式） */
    data: jsonb("data").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("game_saves_user_game_uq").on(t.userId, t.gameId),
    index("game_saves_user_idx").on(t.userId),
  ],
);