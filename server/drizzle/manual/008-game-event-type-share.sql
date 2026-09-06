-- 详情页分享按钮埋点：game_event_type 新增 share 值。
-- 幂等：DO 块检查枚举值是否已存在，避免重复执行报错。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'share'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'game_event_type')
  ) THEN
    ALTER TYPE "game_event_type" ADD VALUE 'share';
  END IF;
END $$;
