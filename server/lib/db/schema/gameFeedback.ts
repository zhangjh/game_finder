import {
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { games } from "./games";

/** 用户反馈类型：游戏不可玩 / 游戏语言错误（英语不属于语言错误） */
export const gameFeedbackTypeEnum = pgEnum("game_feedback_type", [
  "not_playable",
  "wrong_language",
]);

/** 后台处理状态 */
export const gameFeedbackStatusEnum = pgEnum("game_feedback_status", [
  "pending",
  "resolved",
  "dismissed",
]);

/**
 * 游戏质量反馈（后台反馈专区数据）。
 *
 * 详情页「反馈」按钮提交，无账号体系，user_id 为匿名 `_gf_uid` Cookie UUID。
 * 后台可在此复核并直接下架确有问题的游戏（下架仍走 games.status='offline'）。
 */
export const gameFeedback = pgTable(
  "game_feedback",
  {
    id: serial("id").primaryKey(),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    /** 匿名设备 ID（_gf_uid Cookie UUID） */
    userId: text("user_id").notNull(),
    feedbackType: gameFeedbackTypeEnum("feedback_type").notNull(),
    status: gameFeedbackStatusEnum("status").notNull().default("pending"),
    /** 可选补充说明，如具体语言（俄语）或问题描述 */
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("game_feedback_status_idx").on(t.status),
    index("game_feedback_game_idx").on(t.gameId),
    index("game_feedback_created_idx").on(t.createdAt),
  ],
);