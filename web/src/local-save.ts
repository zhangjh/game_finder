/**
 * 本地部署游戏（同源 /local-games/...）localStorage 存档桥（B1）。
 *
 * 背景：本地游戏 iframe sandbox 允许 allow-same-origin，因此 iframe 与父页
 * 共享同一 localStorage。平台通过「整命名空间快照」实现通用存档：
 *   - 启动续玩：把服务端存档（某游戏的 localStorage 快照）写回父页 localStorage，
 *     iframe 加载后自然读到（同源）；
 *   - 过程保存：监听 window 'storage' 事件（iframe 同源写入会触发父页该事件），
 *     防抖采集当前 localStorage 全量 → PUT 服务端，按 slug + 匿名 uid 隔离。
 *
 * 这样无需修改任何游戏源码即可对"自己已使用 localStorage 的游戏"（约 30%）
 * 获得持久化 + 跨设备同步；同时规避了同源下跨游戏 key 冲突导致的互相覆盖。
 *
 * 父页自身业务 key（收藏 / 语种 / 最近搜索）做白名单保护，避免被游戏快照覆盖/清除。
 *
 * 同源前提：生产环境本地游戏的 `gameUrl` 是 R2 绝对地址
 * （https://r2.playwhat.cc/local-games/...），这些文件经 Cloudflare Pages
 * `_redirects` 以 200 代理回同源 `/local-games/...`（见 web/public/_redirects）。
 * iframe 一律使用 `toSameOriginLocalUrl()` 转换后的**同源**地址，才能与父页
 * 共享 localStorage（跨源 iframe 无法读取彼此 storage）。
 */
/**
 * 父页 SPA 自身使用的 localStorage key，禁止被游戏的快照操作影响
 */
export const APP_STORAGE_KEYS = [
  "game-finder:favorites",
  "ui-lang",
  "game-finder:recent-searches",
] as const;

/** 本地部署游戏判定：按 /local-games/ 路径前缀识别（兼容 R2 绝对地址与同源相对地址） */
export function isLocalGameUrl(url: string): boolean {
  try {
    return new URL(url, window.location.href).pathname.startsWith(
      "/local-games/",
    );
  } catch {
    return false;
  }
}

/**
 * 把本地游戏 URL 转成同源相对地址：`https://r2.playwhat.cc/local-games/...`
 * → `/local-games/...`。CF Pages `_redirects` 会把 /local-games/* 以 200
 * 代理回 R2，浏览器看到的仍是本站 origin —— B1 同源 localStorage 桥的前提。
 */
export function toSameOriginLocalUrl(url: string): string {
  try {
    const u = new URL(url, window.location.href);
    if (u.pathname.startsWith("/local-games/")) {
      return u.pathname + u.search + u.hash;
    }
  } catch {
    /* 非法 URL 原样返回 */
  }
  return url;
}

/** 采集当前 localStorage 全量快照。隐私模式/禁用时返回空快照。 */
export function snapshotLocalStorage(): { raw: string; keys: string[] } {
  const entries: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k == null) continue;
      entries[k] = localStorage.getItem(k) ?? "";
    }
  } catch {
    /* localStorage 不可用（无痕/禁用）→ 空快照，保持静默降级 */
  }
  return { raw: JSON.stringify(entries), keys: Object.keys(entries) };
}

/**
 * 把服务端存档的 localStorage 快照写回本机（iframe 同源加载后自然可见）。
 * 仅覆盖快照中出现过的 key；父页自身业务 key 即算出现在快照中也被跳过
 * （游戏数据永远不允许覆盖平台 UI 状态），且不会清掉快照外的父页业务 key。
 */
export function restoreLocalStorage(raw: string | null): void {
  if (!raw) return;
  try {
    const entries = JSON.parse(raw) as Record<string, string>;
    if (!entries || typeof entries !== "object") return;
    for (const [k, v] of Object.entries(entries)) {
      if ((APP_STORAGE_KEYS as readonly string[]).includes(k)) continue;
      try {
        localStorage.setItem(k, v);
      } catch {
        /* 单键写入失败不阻断其余键 */
      }
    }
  } catch {
    /* 非对象/坏 JSON：忽略 */
  }
}

/**
 * 「重新开始」时清理该游戏的本地 key：删除上一份快照中出现过的键
 * （白名单内的父页业务键除外），使游戏能以空档重新开始。
 */
export function clearLocalStorageForGame(prevKeys: string[]): void {
  for (const k of prevKeys ?? []) {
    if ((APP_STORAGE_KEYS as readonly string[]).includes(k)) continue;
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}