-- T4.1 定时任务类型新增 analyze_games（M4 AI 画像分析）
-- 幂等：用 DO 块检查枚举值是否已存在，避免重复执行报错。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'analyze_games'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'cron_job_type')
  ) THEN
    ALTER TYPE "cron_job_type" ADD VALUE 'analyze_games';
  END IF;
END $$;
