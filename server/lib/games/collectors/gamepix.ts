/**
 * GamePix 采集 Adapter（T3.3）。
 *
 * 数据源：JSON Feed v1.1（https://feeds.gamepix.com/v2/json）
 * 文档化行为（实测）：
 * - pagination 仅允许 12/24/48/96，本 adapter 用 96
 * - 排序 order=quality（默认），末页(last_page_url)之后返回
 *   HTTP 400 "Page number request out of bound"（而非空列表），
 *   adapter 将其视为正常翻页结束信号
 * - 每项含 id / namespace(slug) / title / description(可空) / category /
 *   orientation(all|portrait|landscape) / banner_image / image / url(embed)
 *   / date_published / date_modified
 * - embed url 自带 sid 参数，直接可播放（含收入分成追踪）
 *
 * 环境变量：GAMEPIX_SID（publisher/site id，商务分配，当前 7E317）
 */
import { CollectorError, type NormalizedGameRecord, type SourceAdapter } from "./types";

const FEED_BASE_URL =
  process.env.GAMEPIX_FEED_BASE_URL ?? "https://feeds.gamepix.com/v2/json";

/** API 允许的分页大小（实测 500 会报 validation error） */
const PAGE_SIZE = 96;

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;

/** GamePix category → 中文类型（top 词表；覆盖不了的返回 null 交给 M4 AI） */
const CATEGORY_ZH: Record<string, string> = {
  action: "动作",
  adventure: "冒险",
  arcade: "街机",
  board: "棋盘",
  brain: "益智",
  card: "纸牌",
  casual: "休闲",
  clicker: "放置",
  "dress-up": "换装",
  farming: "模拟经营",
  fighting: "格斗",
  "first-person-shooter": "射击",
  "games-for-girls": "女生",
  "hyper-casual": "超休闲",
  io: "IO 对战",
  "match-3": "三消",
  memory: "记忆",
  platformer: "平台跳跃",
  puzzle: "解谜",
  racing: "竞速",
  runner: "跑酷",
  shooting: "射击",
  shooter: "射击",
  simulation: "模拟",
  skill: "技巧",
  sports: "体育",
  strategy: "策略",
  "two-player": "双人",
  war: "战争",
  zombie: "僵尸",
};

/* ---------- 原始 item 的窄化（feed 无 schema，逐字段防御） ---------- */

interface RawGamePixItem {
  id?: unknown;
  title?: unknown;
  namespace?: unknown;
  description?: unknown;
  category?: unknown;
  orientation?: unknown;
  banner_image?: unknown;
  image?: unknown;
  url?: unknown;
  date_published?: unknown;
  date_modified?: unknown;
}

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

const asDate = (v: unknown): Date | null => {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "Wed, 12 Nov 2025 12:34:52 GMT" → "2025-11-12" */
const asDateOnly = (v: unknown): string | null => {
  const d = asDate(v);
  return d ? d.toISOString().slice(0, 10) : null;
};

function normalizeItem(raw: RawGamePixItem): NormalizedGameRecord | null {
  const sourceGameId = asString(raw.id);
  const title = asString(raw.title);
  const namespace = asString(raw.namespace);
  const gameUrl = asString(raw.url);
  if (!sourceGameId || !title || !namespace || !gameUrl) return null;

  const orientation =
    raw.orientation === "portrait" || raw.orientation === "landscape"
      ? raw.orientation
      : "all";
  const category = asString(raw.category);

  return {
    sourceGameId,
    titleOriginal: title,
    slug: namespace.toLowerCase(),
    descriptionOriginal: asString(raw.description) ?? "",
    // banner 320px 比 icon 105px 清晰，作为卡片缩略图
    thumbnail: asString(raw.banner_image) ?? asString(raw.image),
    gameUrl,
    category,
    genre: category ? (CATEGORY_ZH[category] ?? null) : null,
    rawTags: category ? [category] : [],
    releaseDate: asDateOnly(raw.date_published),
    sourceUpdatedAt: asDate(raw.date_modified),
    portrait: orientation !== "landscape",
    landscape: orientation !== "portrait",
    // GamePix 全部是 HTML5 网页游戏：浏览器即玩，桌面/移动端均可打开
    mobile: true,
    desktop: true,
  };
}

export function createGamePixAdapter(): SourceAdapter {
  const sid = process.env.GAMEPIX_SID;
  if (!sid) {
    throw new Error("GAMEPIX_SID 环境变量未设置（GamePix 商务分配的 site id）");
  }
  const feedUrl = (page: number) =>
    `${FEED_BASE_URL}?sid=${encodeURIComponent(sid)}&pagination=${PAGE_SIZE}&order=quality&page=${page}`;

  async function fetchPage(page: number): Promise<NormalizedGameRecord[] | null> {
    const url = feedUrl(page);

    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: { "User-Agent": "GameFinderBot/0.1 (+sync job)" },
        });
        if (res.status === 400) {
          // 越过末页：feed 返回 400 "Page number request out of bound"
          // （实测行为，2026-09），视为翻页结束而非错误
          return null;
        }
        if (!res.ok) {
          throw new Error(`feed HTTP ${res.status}`);
        }
        const data = (await res.json()) as { items?: RawGamePixItem[] };
        const items = Array.isArray(data.items) ? data.items : [];
        const records = items
          .map(normalizeItem)
          .filter((r): r is NormalizedGameRecord => r !== null);
        // 空页 = 超过末页，同步结束
        return records.length > 0 ? records : null;
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    throw new CollectorError(
      `GamePix feed 拉取失败（page ${page}）: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
      "gamepix",
    );
  }

  return { code: "gamepix", name: "GamePix", fetchPage };
}
