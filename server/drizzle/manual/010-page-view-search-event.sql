-- 流量看板（DANTE-7/T9.6）：game_event_type 新增 page_view、search_query 两个事件。
--
-- page_view：SPA 每次路由访问上报，context 携带 { path, referrer, utm_source,
--   utm_medium, utm_campaign, utm_content, utm_term }，是渠道归因/落地页的
--   数据基础。
-- search_query：传统关键词搜索执行上报，context 携带 { mode, q }，用于与
--   AI 推荐（recommendation_requests）做行为对比。
-- 幂等：DO 块检查枚举值是否已存在，避免重复执行报错。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'page_view'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'game_event_type')
  ) THEN
    ALTER TYPE "game_event_type" ADD VALUE 'page_view';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'search_query'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'game_event_type')
  ) THEN
    ALTER TYPE "game_event_type" ADD VALUE 'search_query';
  END IF;
END $$;