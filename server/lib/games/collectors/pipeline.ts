/**
 * 采集同步管道（T3.2，PRD §35）。
 *
 * Collect（adapter.fetchPage）→ Normalize（adapter 内完成）
 * → Deduplicate（(source_id, source_game_id) 唯一约束 + slug 冲突处理）
 * → Detect Changes（source_updated_at 等源字段比对）
 * → 落库（新游戏 status=draft；变化游戏更新源字段；消失游戏 offline）
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { gameSources, games } from "@/lib/db/schema";
import type {
  NormalizedGameRecord,
  SourceAdapter,
  SyncOptions,
  SyncStats,
} from "./types";

/** NOT IN 分块的批大小（PG 参数上限 65535，留足余量） */
const SQL_CHUNK = 1_000;

function* chunks<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}

const sameInstant = (a: Date | null, b: Date | null): boolean =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

/** 源字段是否有变化（date_modified 为主，标题/地址/缩略图兜底防漏） */
function isChanged(
  existing: { sourceUpdatedAt: Date | null; titleOriginal: string; gameUrl: string; thumbnail: string | null },
  rec: NormalizedGameRecord,
): boolean {
  return (
    !sameInstant(existing.sourceUpdatedAt, rec.sourceUpdatedAt) ||
    existing.titleOriginal !== rec.titleOriginal ||
    existing.gameUrl !== rec.gameUrl ||
    existing.thumbnail !== rec.thumbnail
  );
}

/** 保证 slug 全站唯一：被其他游戏占用时追加源内 ID 后缀 */
async function resolveSlugConflicts(
  sourceId: number,
  records: NormalizedGameRecord[],
): Promise<Map<string, string /* sourceGameId → final slug */>> {
  const candidates = [...new Set(records.map((r) => r.slug))];
  const taken = new Set<string>();
  for (const chunk of chunks(candidates, SQL_CHUNK)) {
    const rows = await db
      .select({ slug: games.slug, sourceId: games.sourceId, sourceGameId: games.sourceGameId })
      .from(games)
      .where(inArray(games.slug, chunk));
    for (const row of rows) {
      // 同一游戏的旧记录占用不算冲突（更新时保留原 slug）
      if (row.sourceId !== sourceId || !records.some((r) => r.sourceGameId === row.sourceGameId)) {
        taken.add(row.slug);
      }
    }
  }

  const result = new Map<string, string>();
  const usedInBatch = new Set<string>();
  for (const rec of records) {
    let slug = rec.slug;
    if (taken.has(slug)) {
      slug = `${rec.slug}-${rec.sourceGameId.toLowerCase()}`;
      let n = 2;
      while (taken.has(slug) || usedInBatch.has(slug)) {
        slug = `${rec.slug}-${rec.sourceGameId.toLowerCase()}-${n++}`;
      }
    }
    // 批内去重（同页不可能同 sourceGameId，但 slug 可能撞）
    while (usedInBatch.has(slug)) {
      slug = `${slug}-x`;
    }
    usedInBatch.add(slug);
    result.set(rec.sourceGameId, slug);
  }
  return result;
}

/** 注册/获取数据源行 */
async function ensureSourceRow(adapter: SourceAdapter): Promise<number> {
  const existing = await db
    .select({ id: gameSources.id })
    .from(gameSources)
    .where(eq(gameSources.code, adapter.code))
    .limit(1);
  if (existing.length > 0) return existing[0].id;

  const inserted = await db
    .insert(gameSources)
    .values({ code: adapter.code, name: adapter.name, apiType: "json_feed" })
    .onConflictDoNothing({ target: gameSources.code })
    .returning({ id: gameSources.id });
  if (inserted.length > 0) return inserted[0].id;

  // 并发插入竞态兜底
  const again = await db
    .select({ id: gameSources.id })
    .from(gameSources)
    .where(eq(gameSources.code, adapter.code))
    .limit(1);
  return again[0].id;
}

function toInsertValues(
  sourceId: number,
  rec: NormalizedGameRecord,
  slug: string,
) {
  const tags = [...new Set([rec.category, ...rec.rawTags].filter(Boolean) as string[])];
  return {
    sourceId,
    sourceGameId: rec.sourceGameId,
    // 入库初始值：展示字段先放原文，M4 AI 中文化后覆盖
    title: rec.titleOriginal,
    titleOriginal: rec.titleOriginal,
    slug,
    description: rec.descriptionOriginal,
    descriptionOriginal: rec.descriptionOriginal,
    thumbnail: rec.thumbnail,
    gameUrl: rec.gameUrl,
    releaseDate: rec.releaseDate,
    sourceUpdatedAt: rec.sourceUpdatedAt,
    genre: rec.genre,
    tags: JSON.stringify(tags),
    portrait: rec.portrait,
    landscape: rec.landscape,
    mobile: rec.mobile,
    desktop: rec.desktop,
    // 元数据目前是英文原文，M4 翻译后置 zh
    metadataLanguage: "en" as const,
    gameLanguage: "en",
    status: "draft" as const,
  };
}

export async function syncSource(
  adapter: SourceAdapter,
  options: SyncOptions = {},
): Promise<SyncStats> {
  const stats: SyncStats = {
    source: adapter.code,
    pages: 0,
    fetched: 0,
    inserted: 0,
    updated: 0,
    flaggedForReanalysis: 0,
    unchanged: 0,
    offline: 0,
    completed: false,
  };

  const sourceId = await ensureSourceRow(adapter);
  const seenIds: string[] = [];

  try {
    for (let page = 1; ; page++) {
      if (options.maxPages != null && page > options.maxPages) break;

      const records = await adapter.fetchPage(page);
      if (records == null) {
        stats.completed = true;
        break;
      }
      stats.pages++;
      stats.fetched += records.length;

      // 批内按 source_game_id 去重（feed 不该重复，防御）
      const byId = new Map<string, NormalizedGameRecord>();
      for (const rec of records) byId.set(rec.sourceGameId, rec);
      const pageRecords = [...byId.values()];
      const pageIds = pageRecords.map((r) => r.sourceGameId);
      seenIds.push(...pageIds);

      // 现有记录（含 offline 的——重新出现需要复活）
      const existingRows = await db
        .select({
          id: games.id,
          sourceGameId: games.sourceGameId,
          slug: games.slug,
          status: games.status,
          sourceUpdatedAt: games.sourceUpdatedAt,
          titleOriginal: games.titleOriginal,
          gameUrl: games.gameUrl,
          thumbnail: games.thumbnail,
        })
        .from(games)
        .where(and(eq(games.sourceId, sourceId), inArray(games.sourceGameId, pageIds)));
      const existing = new Map(existingRows.map((r) => [r.sourceGameId, r]));

      const toInsert: NormalizedGameRecord[] = [];
      for (const rec of pageRecords) {
        const prev = existing.get(rec.sourceGameId);
        if (!prev) {
          toInsert.push(rec);
          continue;
        }
        // 曾下架又重新出现的游戏：复活为 draft 重新走 AI 流程
        if (prev.status === "offline") {
          await db
            .update(games)
            .set({
              status: "draft",
              titleOriginal: rec.titleOriginal,
              descriptionOriginal: rec.descriptionOriginal,
              thumbnail: rec.thumbnail,
              gameUrl: rec.gameUrl,
              releaseDate: rec.releaseDate,
              sourceUpdatedAt: rec.sourceUpdatedAt,
              portrait: rec.portrait,
              landscape: rec.landscape,
              mobile: rec.mobile,
              desktop: rec.desktop,
              updatedAt: new Date(),
            })
            .where(eq(games.id, prev.id));
          stats.updated++;
          continue;
        }
        if (!isChanged(prev, rec)) {
          stats.unchanged++;
          continue;
        }
        // 有变化：只更新"源事实"字段，不动 AI 生成字段
        const needsReanalysis = prev.status === "published" || prev.status === "pending";
        await db
          .update(games)
          .set({
            titleOriginal: rec.titleOriginal,
            descriptionOriginal: rec.descriptionOriginal,
            thumbnail: rec.thumbnail,
            gameUrl: rec.gameUrl,
            releaseDate: rec.releaseDate,
            sourceUpdatedAt: rec.sourceUpdatedAt,
            portrait: rec.portrait,
            landscape: rec.landscape,
            mobile: rec.mobile,
            desktop: rec.desktop,
            ...(needsReanalysis ? { needsReanalysis: true } : {}),
            updatedAt: new Date(),
          })
          .where(eq(games.id, prev.id));
        stats.updated++;
        if (needsReanalysis) stats.flaggedForReanalysis++;
      }

      if (toInsert.length > 0) {
        const slugMap = await resolveSlugConflicts(sourceId, toInsert);
        const inserted = await db
          .insert(games)
          .values(
            toInsert.map((rec) => toInsertValues(sourceId, rec, slugMap.get(rec.sourceGameId)!)),
          )
          // 并发/重复同步兜底：冲突说明刚被别人插入，跳过即可
          .onConflictDoNothing({ target: [games.sourceId, games.sourceGameId] })
          .returning({ id: games.id });
        stats.inserted += inserted.length;
      }

      if (options.pageDelayMs) {
        await new Promise((r) => setTimeout(r, options.pageDelayMs));
      }
    }

    // 全量跑完才做下架检测（被 maxPages 截断时 seenIds 不完整，跳过）
    if (stats.completed) {
      const seenSet = new Set(seenIds);
      const activeRows = await db
        .select({ id: games.id, sourceGameId: games.sourceGameId })
        .from(games)
        .where(
          and(
            eq(games.sourceId, sourceId),
            inArray(games.status, ["draft", "pending", "published"]),
          ),
        );
      const offlineIds = activeRows
        .filter((r) => !seenSet.has(r.sourceGameId))
        .map((r) => r.id);
      for (const chunk of chunks(offlineIds, SQL_CHUNK)) {
        const res = await db
          .update(games)
          .set({ status: "offline", updatedAt: new Date() })
          .where(inArray(games.id, chunk))
          .returning({ id: games.id });
        stats.offline += res.length;
      }
    }

    await db
      .update(gameSources)
      .set({ lastSyncAt: new Date(), lastSyncStatus: "ok", updatedAt: new Date() })
      .where(eq(gameSources.id, sourceId));
  } catch (err) {
    stats.error = err instanceof Error ? err.message : String(err);
    await db
      .update(gameSources)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: `error: ${stats.error}`.slice(0, 200),
        errorCount: sql`${gameSources.errorCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(gameSources.id, sourceId));
  }

  return stats;
}
