-- 定时任务类型新增 embedding_games（补偿已发布游戏缺失的 embedding 向量）
-- 历史背景：003 迁移曾移除 embedding_games（当时并入 analyze_games 即时生成），
-- 但发布时 embedding 失败的游戏无补偿路径，故重新启用独立补偿任务（手动触发）。
-- 幂等：DO 块检查枚举值是否已存在，避免重复执行报错。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'embedding_games'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'cron_job_type')
  ) THEN
    ALTER TYPE "cron_job_type" ADD VALUE 'embedding_games';
  END IF;
END $$;
