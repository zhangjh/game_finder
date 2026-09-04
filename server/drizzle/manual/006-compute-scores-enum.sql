-- T6.3 定时任务类型新增 compute_scores（M6 GameScore 每日计算）
-- 幂等：DO 块检查枚举值是否已存在，避免重复执行报错。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'compute_scores'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'cron_job_type')
  ) THEN
    ALTER TYPE "cron_job_type" ADD VALUE 'compute_scores';
  END IF;
END $$;
