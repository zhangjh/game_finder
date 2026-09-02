import {
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const sourceStatusEnum = pgEnum("source_status", [
  "active",
  "paused",
  "error",
]);

/**
 * 数据源（PRD §7/§36）：GamePix / Gamezop / GameMonetize / Famobi …
 * 采集器注册表 + 同步状态跟踪。
 */
export const gameSources = pgTable(
  "game_sources",
  {
    id: serial("id").primaryKey(),
    /** 来源标识，如 gamepix / gamezop */
    code: text("code").notNull(),
    name: text("name").notNull(),
    baseUrl: text("base_url"),
    /** 采集适配器类型，M3 实现各 adapter */
    apiType: text("api_type").notNull().default("json_feed"),
    status: sourceStatusEnum("status").notNull().default("active"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncStatus: text("last_sync_status"),
    /** 累计错误数，admin 数据源页展示（PRD §36） */
    errorCount: integer("error_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("game_sources_code_uq").on(t.code)],
);
