-- T2.1 补充约束与索引（drizzle-kit 无法生成的部分）

-- 体验属性 1~5 值域约束（PRD §12）
ALTER TABLE "games" ADD CONSTRAINT "games_difficulty_check" CHECK ("difficulty" BETWEEN 1 AND 5);
ALTER TABLE "games" ADD CONSTRAINT "games_cognitive_load_check" CHECK ("cognitive_load" BETWEEN 1 AND 5);
ALTER TABLE "games" ADD CONSTRAINT "games_complexity_check" CHECK ("complexity" BETWEEN 1 AND 5);
ALTER TABLE "games" ADD CONSTRAINT "games_pace_check" CHECK ("pace" BETWEEN 1 AND 5);
ALTER TABLE "games" ADD CONSTRAINT "games_stress_level_check" CHECK ("stress_level" BETWEEN 1 AND 5);
ALTER TABLE "games" ADD CONSTRAINT "games_replayability_check" CHECK ("replayability" BETWEEN 1 AND 5);

-- 时长区间合法性
ALTER TABLE "games" ADD CONSTRAINT "games_session_length_check"
  CHECK ("session_length_min" IS NULL OR "session_length_max" IS NULL OR "session_length_min" <= "session_length_max");

-- 玩家人数区间合法性
ALTER TABLE "games" ADD CONSTRAINT "games_players_check"
  CHECK ("min_players" >= 1 AND "max_players" >= "min_players");

-- 向量相似度 HNSW 索引（cosine 距离，PRD §28）
CREATE INDEX IF NOT EXISTS "game_embeddings_hnsw_idx"
  ON "game_embeddings" USING hnsw ("embedding" vector_cosine_ops);
