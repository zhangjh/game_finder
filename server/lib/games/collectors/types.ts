/**
 * 采集器框架核心类型（T3.2，PRD §35）。
 *
 * 流程：Source Adapter（拉取 feed + 标准化）→ Pipeline
 * （Deduplicate → Detect Changes → 落库 draft）。
 * 所有 Adapter 输出统一的 NormalizedGameRecord，Pipeline 不感知源差异。
 */

/**
 * 标准化游戏记录：只包含"来自源的客观事实"。
 * AI 生成字段（中文标题/描述/体验画像等）不属于这里，由 M4 管道补充。
 */
export interface NormalizedGameRecord {
  /** 源站游戏唯一 ID（与 games.source_game_id 对应） */
  sourceGameId: string;
  /** 源站原始标题（入库时同时作为 title 的初始值） */
  titleOriginal: string;
  /** URL slug，小写 kebab-case；跨源冲突由 pipeline 处理 */
  slug: string;
  /** 源站原始描述，可能为空 */
  descriptionOriginal: string;
  thumbnail: string | null;
  /** 可嵌入 iframe 的游戏地址 */
  gameUrl: string;
  /** 源站分类（英文原文），进 tags；中文 genre 由映射或 AI 生成 */
  category: string | null;
  /** Adapter 尽力给出的中文类型名（top 分类词表映射）；无法映射为 null，留给 M4 AI */
  genre: string | null;
  /** 原始 tags（英文），与 category 合并去重后进 games.tags */
  rawTags: string[];
  /** ISO 日期字符串或 null */
  releaseDate: string | null;
  /** 源站最近更新时间（变更检测的依据） */
  sourceUpdatedAt: Date | null;
  portrait: boolean;
  landscape: boolean;
  mobile: boolean;
  desktop: boolean;
}

/** Adapter 拉取一页失败时抛出，pipeline 记录错误并中止该源同步 */
export class CollectorError extends Error {
  constructor(
    message: string,
    public readonly sourceCode: string,
  ) {
    super(message);
    this.name = "CollectorError";
  }
}

/**
 * 数据源适配器接口。
 * fetchPage(page) 返回该页记录；空数组或 null 表示已到末页。
 */
export interface SourceAdapter {
  /** 对应 game_sources.code */
  readonly code: string;
  /** 展示名，如 "GamePix"（首次同步时自动注册数据源） */
  readonly name: string;
  fetchPage(page: number): Promise<NormalizedGameRecord[] | null>;
}

export interface SyncOptions {
  /** 最多拉取页数（测试用）；不设或 null = 全量 */
  maxPages?: number | null;
  /** 页间延迟 ms，避免打爆源站 */
  pageDelayMs?: number;
}

export interface SyncStats {
  source: string;
  pages: number;
  fetched: number;
  inserted: number;
  updated: number;
  /** 源数据有变化但已发布、标记 needs_reanalysis 的数量 */
  flaggedForReanalysis: number;
  unchanged: number;
  /** 从源中消失、被下线(offline)的数量 */
  offline: number;
  /** 是否跑完了全部页（false = 被 maxPages 截断，跳过下架检测） */
  completed: boolean;
  error?: string;
}
