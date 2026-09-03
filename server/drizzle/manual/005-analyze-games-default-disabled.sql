-- analyze_games 改为默认停用：不再每 30 分钟独立调度，
-- 改为同步完成后自动跟随运行，此任务仅保留供后台手工触发。
UPDATE cron_jobs
SET status = 'disabled', updated_at = now()
WHERE type = 'analyze_games' AND status = 'enabled';