-- T4.4 定时任务类型新增 relation_games（M4 相似游戏预计算）
-- 说明：原 T4.2 的 embedding_games 独立任务已取消（embedding 并入 analyze_games 发布后即时生成），
-- 因此此处不再新增 embedding_games。若旧库已有该枚举值，由 scripts/apply-ai-enums.mjs 幂等清理。
-- 幂等：DO 块逐值检查，避免重复执行报错。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'relation_games'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'cron_job_type')
  ) THEN
    ALTER TYPE "cron_job_type" ADD VALUE 'relation_games';
  END IF;
END $$;
