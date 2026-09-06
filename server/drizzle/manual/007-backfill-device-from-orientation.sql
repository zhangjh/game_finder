-- 设备字段(mobile/desktop)改由源站横竖屏标识(portrait/landscape)推断，与采集适配器
-- (gamepix.ts)的映射保持一致：竖屏→手机、横屏→电脑、双横竖(orientation=all)→双端皆宜。
-- 存量数据一次回填；幂等，随每次部署重复执行结果不变。
UPDATE games
SET mobile = portrait,
    desktop = landscape;