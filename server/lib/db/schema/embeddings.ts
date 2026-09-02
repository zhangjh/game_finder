import {
  index,
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";

import { games } from "./games";

/**
 * pgvector 向量列。1536 维对应 OpenAI text-embedding-3-small。
 */
export const vector1536 = customType<{ data: string; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
});

/**
 * 游戏向量（PRD §28）：Game Metadata + Description + Mechanics + Experience Profile
 * 拼接后 embedding，用于相似游戏 / 自然语言召回 / 推荐候选召回。
 * HNSW 索引在迁移 SQL 中补充（drizzle-kit 不生成向量索引）。
 */
export const gameEmbeddings = pgTable(
  "game_embeddings",
  {
    gameId: integer("game_id")
      .primaryKey()
      .references(() => games.id, { onDelete: "cascade" }),
    embedding: vector1536("embedding").notNull(),
    /** 生成该向量所用的画像摘要文本 hash，画像更新后据此判断需否重算 */
    contentHash: text("content_hash").notNull(),
    model: text("model").notNull().default("text-embedding-3-small"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("game_embeddings_model_idx").on(t.model)],
);

/**
 * GameScore v0（PRD §24）：各分量 + 加权总分。
 * 权重 30/20/20/15/10/5，由 jobs/compute-scores 每日重算（M6）。
 */
export const gameScores = pgTable("game_scores", {
  gameId: integer("game_id")
    .primaryKey()
    .references(() => games.id, { onDelete: "cascade" }),
  /** 0~10 总分 */
  totalScore: real("total_score").notNull().default(0),
  /** 各分量原始值，JSON 字符串，便于调权重时无需回填 */
  components: text("components").notNull().default("{}"),
  /** 行为数据量（样本数），冷启动判断用 */
  sampleSize: integer("sample_size").notNull().default(0),
  computedAt: timestamp("computed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * 相似游戏关系（PRD §27）：向量相似度 + 结构化加权（Genre/SubGenre/Mechanics/
 * Difficulty/Pace/SessionLength/CognitiveLoad）预计算 Top-K，M4 的 job 维护。
 */
export const gameRelations = pgTable(
  "game_relations",
  {
    id: serial("id").primaryKey(),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    relatedGameId: integer("related_game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    similarity: real("similarity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("game_relations_pair_uq").on(t.gameId, t.relatedGameId),
    index("game_relations_game_idx").on(t.gameId),
  ],
);
