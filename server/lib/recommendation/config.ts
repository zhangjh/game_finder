/**
 * 推荐 Pipeline 配置（M5，PRD §42）。
 *
 * Hybrid Ranking 初版权重为「拍脑袋定值」（任务拆解 T5.3），
 * 集中放此处便于 M6 有行为数据后调参。
 */

/** Hybrid Ranking 各分项权重（总和无需为 1，scoreDetail 各分项已归一化 0~1） */
export const RANKING_WEIGHTS = {
  /** Intent 条件命中度（结构化画像 vs GameIntent） */
  intentMatch: 0.45,
  /** pgvector 语义相似度（query 向量 / 参考游戏向量） */
  semantic: 0.25,
  /** GameScore 总分（0~10 → 0~1；冷启动无分数时为 0） */
  gameScore: 0.1,
  /** 流行度（playCount 对数归一；M6 前区分度低） */
  popularity: 0.1,
  /** 新鲜度（publishedAt 指数衰减，半衰期 30 天） */
  freshness: 0.1,
} as const;

/** random 场景的返回数量（"随便推荐" 无需长列表；常规搜索按语义阈值决定数量） */
export const TOP_N = 5;

/** 一律保证的最少返回数量（阈值过滤不足时兜底，PRD §42 绝不空转） */
export const MIN_RESULTS = 3;

/** 语义召回相似度阈值（cosine 0~1）：≥ 该值的结果全量返回，不设数量上限 */
export const SEMANTIC_SIM_THRESHOLD = 0.75;

/** 五路召回各路配额（PRD §42 Candidate Recall） */
export const RECALL_QUOTA = {
  /** ① SQL 条件召回（硬条件 + 软条件） */
  sql: 40,
  /** ② 关键词召回（ILIKE 标题/标签；M5 简易 FTS） */
  keyword: 20,
  /** ③ pgvector 语义召回 */
  vector: 30,
  /** ④ 热门游戏兜底 */
  popular: 15,
  /** ⑤ 相似游戏扩展（similar_to 场景，game_relations） */
  relations: 10,
} as const;

/**
 * Hard Filter 后不足 MIN_RESULTS 时的放宽顺序（PRD §42 Filter）。
 * 人数/设备/状态是硬条件不可放宽；放宽的是软条件（时长/心情/难度上限）。
 */
export const RELAX_STEPS = ["sessionLength", "mood", "ratingCaps"] as const;
