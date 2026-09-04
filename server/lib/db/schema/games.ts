import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { gameSources } from "./sources";

export const gameStatusEnum = pgEnum("game_status", [
  "draft", // 采集入库，待 AI 分析
  "pending", // AI 分析失败 / 质检不过，待人工处理
  "published", // 已发布，前台可见
  "offline", // 源下架 / URL 失效，自动或手动下线
]);

export const metadataLanguageEnum = pgEnum("metadata_language", ["zh", "en"]);

/** 体验属性值域 1~5 的复用列定义（PRD §12） */
const experienceRating = (name: string) =>
  smallint(name).notNull().default(3);

/**
 * 游戏主表（PRD §10~16）。
 *
 * 设计要点：
 * - (source_id, source_game_id) 唯一约束 → 采集去重（任务拆解 T2.1）
 * - 体验属性用 smallint + CHECK 而非 enum，便于后续调参
 * - metadata_language（我们的中文包装层）与 game_language（游戏本体语言）
 *   严格区分，避免误导用户（PRD §8.1）
 */
export const games = pgTable(
  "games",
  {
    id: serial("id").primaryKey(),

    /* ===== 基础信息（PRD §10.1）===== */
    sourceId: integer("source_id")
      .notNull()
      .references(() => gameSources.id),
    sourceGameId: text("source_game_id").notNull(),

    /** 中文展示名（AI 生成或人工） */
    title: text("title").notNull(),
    /** 源站原始名 */
    titleOriginal: text("title_original").notNull(),
    slug: text("slug").notNull(),

    description: text("description").notNull().default(""),
    descriptionOriginal: text("description_original").notNull().default(""),
    descriptionZh: text("description_zh").notNull().default(""),

    thumbnail: text("thumbnail"),
    /** JSON 数组字符串，截图 URL 列表 */
    screenshots: text("screenshots").notNull().default("[]"),

    gameUrl: text("game_url").notNull(),
    developer: text("developer"),
    publisher: text("publisher"),
    releaseDate: text("release_date"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),

    /* ===== 类型（PRD §11）===== */
    /** 中文类型名，如 塔防 / Roguelike / 解谜 */
    genre: text("genre"),
    subGenre: text("sub_genre"),
    /** JSON 数组字符串 */
    tags: text("tags").notNull().default("[]"),
    /** JSON 数组字符串，如 ["resource_management","wave_defense"] */
    mechanics: text("mechanics").notNull().default("[]"),

    /* ===== 体验属性 1~5（PRD §12）===== */
    difficulty: experienceRating("difficulty"),
    cognitiveLoad: experienceRating("cognitive_load"),
    complexity: experienceRating("complexity"),
    pace: experienceRating("pace"),
    stressLevel: experienceRating("stress_level"),
    replayability: experienceRating("replayability"),

    /* ===== 时长（PRD §13，分钟）===== */
    sessionLengthMin: integer("session_length_min"),
    sessionLengthMax: integer("session_length_max"),

    /* ===== 玩家模式（PRD §14）===== */
    singlePlayer: boolean("single_player").notNull().default(true),
    multiplayer: boolean("multiplayer").notNull().default(false),
    minPlayers: integer("min_players").notNull().default(1),
    maxPlayers: integer("max_players").notNull().default(1),
    coop: boolean("coop").notNull().default(false),
    competitive: boolean("competitive").notNull().default(false),

    /* ===== 设备与操作（PRD §15/§16）===== */
    desktop: boolean("desktop").notNull().default(true),
    mobile: boolean("mobile").notNull().default(false),
    tablet: boolean("tablet").notNull().default(false),
    portrait: boolean("portrait").notNull().default(false),
    landscape: boolean("landscape").notNull().default(true),
    /** JSON 数组字符串：mouse/keyboard/touch/gamepad */
    inputMethods: text("input_methods").notNull().default('["mouse"]'),

    /* ===== 心情标签（PRD §17 AI 输出）===== */
    /** JSON 数组字符串：casual/relaxing/focus/brain_burn/exciting… */
    mood: text("mood").notNull().default("[]"),

    /* ===== 语言（PRD §8.1）===== */
    metadataLanguage: metadataLanguageEnum("metadata_language")
      .notNull()
      .default("zh"),
    gameLanguage: text("game_language").notNull().default("en"),

    /* ===== 状态与运营 ===== */
    status: gameStatusEnum("status").notNull().default("draft"),
    /** AI 画像是否人工修正过（admin AI 管理页，PRD §36） */
    profileManuallyEdited: boolean("profile_manually_edited")
      .notNull()
      .default(false),
    /**
     * 源数据发生变化，待重新 AI 分析（T3.5 变更检测）。
     * 已发布(published)的游戏源更新后置 true，M4 分析 job 消费后复位。
     */
    needsReanalysis: boolean("needs_reanalysis").notNull().default(false),
    /**
     * AI 分析连续失败次数（LLM 失败或质检不过）。
     * 达到 ANALYZE_MAX_FAILS 后退出分析候选池，防止不可修复的游戏
     * （如缩略图缺失的质检失败）被每轮任务无限重分析烧 token。
     */
    analysisFailCount: smallint("analysis_fail_count").notNull().default(0),
    /** 简单流行度计数：M6 前用启动次数近似，GameScore 接管后弱化 */
    playCount: integer("play_count").notNull().default(0),

    /* ===== 健康巡检（T3.6，PRD §34）===== */
    /** 最近一次巡检时间（每次巡检一批最久未检的） */
    healthCheckedAt: timestamp("health_checked_at", { withTimezone: true }),
    /** 连续失败次数；成功清零，达到阈值自动下线 */
    healthFailCount: smallint("health_fail_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("games_source_game_uq").on(t.sourceId, t.sourceGameId),
    uniqueIndex("games_slug_uq").on(t.slug),
    index("games_status_idx").on(t.status),
    index("games_genre_idx").on(t.genre),
    index("games_published_at_idx").on(t.publishedAt),
    index("games_play_count_idx").on(t.playCount),
  ],
);

/** 1~5 值域 CHECK 由迁移 SQL 补充（drizzle 目前不直接支持 CHECK 约束声明） */
