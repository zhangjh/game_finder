-- T4.2 调整：移除已废弃的定时任务枚举值 embedding_games（embedding 已并入 analyze_games
-- 发布后即时生成，不再有独立 embedding_games 任务）。
--
-- 注意：Postgres 不支持直接 DROP enum value，此处通过重建类型移除。
-- 若旧库已应用 003 且有 embedding_games 值，本脚本会将其移除；
-- 若旧库从未应用（无该值）则本脚本保持幂等不报错。
-- 运行时幂等清理见 scripts/apply-ai-enums.mjs（会自动跳过被 row 引用的值）。
DO $$
BEGIN
  -- 仅当枚举中存在 embedding_games 且无 cron_jobs 行引用它时才移除
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'embedding_games'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'cron_job_type')
  ) AND NOT EXISTS (
    SELECT 1 FROM cron_jobs WHERE type::text = 'embedding_games'
  ) THEN
    -- 重建枚举类型以移除 embedding_games
    CREATE TYPE cron_job_type_new AS ENUM (
      'sync_games', 'health_check', 'detect_duplicates',
      'analyze_games', 'relation_games'
    );
    ALTER TABLE cron_jobs ALTER COLUMN type TYPE cron_job_type_new
      USING type::text::cron_job_type_new;
    DROP TYPE "cron_job_type";
    ALTER TYPE cron_job_type_new RENAME TO "cron_job_type";
  END IF;
END $$;
