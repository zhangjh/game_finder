import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { games } from "./games";

/** 行为事件类型全集（PRD §25） */
export const gameEventTypeEnum = pgEnum("game_event_type", [
  "game_impression",
  "game_click",
  "game_start",
  "game_30s",
  "game_2min",
  "game_5min",
  "game_exit",
  "game_replay",
  "favorite",
  "recommendation_impression",
  "recommendation_click",
]);

/**
 * 用户行为事件（PRD §25）。无账号体系，user_id 为匿名 Cookie UUID（PRD §41）。
 * 表按天增长很快，先不分区，量级上来后再考虑按月分区。
 */
export const userEvents = pgTable(
  "user_events",
  {
    id: serial("id").primaryKey(),
    /** 匿名设备 ID（Cookie UUID） */
    userId: text("user_id").notNull(),
    eventType: gameEventTypeEnum("event_type").notNull(),
    gameId: integer("game_id").references(() => games.id, {
      onDelete: "set null",
    }),
    /** 推荐上下文：request_id + 结果排名，用于归因（PRD §26） */
    context: jsonb("context"),
    /** 冗余的会话时间（秒），仅 game_exit 等事件携带 */
    sessionSeconds: integer("session_seconds"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("user_events_user_idx").on(t.userId),
    index("user_events_game_idx").on(t.gameId),
    index("user_events_type_idx").on(t.eventType),
    index("user_events_created_idx").on(t.createdAt),
  ],
);

/**
 * 推荐请求（PRD §19/§43）：原始输入 + 解析出的 GameIntent。
 * 可解释、可测试、可统计的基础。
 */
export const recommendationRequests = pgTable(
  "recommendation_requests",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id"),
    /** 用户原始输入（自然语言或快捷条件） */
    rawInput: text("raw_input").notNull(),
    /** Intent Parser 输出的结构化 GameIntent JSON */
    intent: jsonb("intent"),
    /** 解析是否成功；失败时走降级路径 */
    parsedOk: boolean("parsed_ok").notNull().default(true),
    /** 最终返回结果数 */
    resultCount: integer("result_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("recommendation_requests_created_idx").on(t.createdAt)],
);

/**
 * 推荐结果（PRD §43）：每次请求返回的 3~5 款 + 各自的得分构成，
 * 结合 user_events 的归因可计算推荐成功率（PRD §26/§52）。
 */
export const recommendationResults = pgTable(
  "recommendation_results",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => recommendationRequests.id, { onDelete: "cascade" }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    /** 展示排名（1~5） */
    rank: integer("rank").notNull(),
    /** Hybrid Ranking 各分项得分 JSON，可解释性依据 */
    scoreDetail: jsonb("score_detail"),
    /** 模板化推荐理由（PRD §44） */
    reason: text("reason"),
  },
  (t) => [
    index("recommendation_results_request_idx").on(t.requestId),
    index("recommendation_results_game_idx").on(t.gameId),
  ],
);
