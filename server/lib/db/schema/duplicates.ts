import {
  index,
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { games } from "./games";

/**
 * 疑似重复游戏对（T3.7，PRD §34 "重复游戏 → Merge"）。
 *
 * 由 detect-duplicates 巡检任务写入（slug 规范化 + 标题 trigram 相似度），
 * status=pending 等待管理后台（T2.3）人工确认 Merge / 驳回。
 * merged/dismissed 记录保留，防止同一对反复上报。
 */
export const suspectedDuplicates = pgTable(
  "suspected_duplicates",
  {
    id: serial("id").primaryKey(),
    /** 保留的游戏 */
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    /** 疑似重复、候选被合并的游戏 */
    duplicateOfGameId: integer("duplicate_of_game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    /** 0~1，slug 完全匹配为 1.0，标题相似度取 trigram 值 */
    similarity: real("similarity").notNull(),
    /** slug | title */
    reason: text("reason").notNull(),
    /** pending | merged | dismissed */
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("suspected_dup_pair_uq").on(t.gameId, t.duplicateOfGameId),
    index("suspected_dup_status_idx").on(t.status),
  ],
);
