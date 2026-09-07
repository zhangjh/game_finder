/**
 * 游戏收藏 hook（基于 localStorage）。
 *
 * 由于当前没有登录体系，收藏数据仅存储在浏览器本地：
 * - 清除浏览器数据 / 换设备后收藏将丢失
 * - 各提示文案已在 toggleFavorite 返回值中暴露，调用方可据此展示 tips
 *
 * 设计要点：
 * - 用 CustomEvent("favorites-change") 实现跨组件同步
 * - 存储 GameListItem 的子集（仅卡片/列表展示所需字段），避免存全量详情
 * - 兼容 SSR / 隐私模式：localStorage 不可用时静默降级
 */
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "game-finder:favorites";

/** 收藏夹中单条记录的最小字段集 */
export interface FavoriteItem {
  id: number;
  slug: string;
  title: string;
  titleOriginal: string;
  description: string;
  thumbnail: string | null;
  genre: string | null;
  tags: string;
  difficulty: number;
  cognitiveLoad: number;
  sessionLengthMin: number | null;
  sessionLengthMax: number | null;
  multiplayer: boolean;
  minPlayers: number;
  maxPlayers: number;
  mobile: boolean;
  playCount: number;
  gameLanguage: string;
  totalScore: number | null;
  sourceQualityScore: number | null;
  /** 收藏时间（ISO 字符串），用于排序 */
  favoritedAt: string;
}

/** toggleFavorite 的输入类型：拥有 FavoriteItem 除 favoritedAt 外的所有字段。
 *  GameListItem 和 GameDetail 都满足此约束。 */
type FavoriteInput = Omit<FavoriteItem, "favoritedAt">;

type FavoritesMap = Record<number, FavoriteItem>;

/* ---------- storage helpers ---------- */

function readStorage(): FavoritesMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorage(map: FavoritesMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    // 通知同页面/不同组件的订阅者
    window.dispatchEvent(new CustomEvent("favorites-change"));
  } catch {
    // 隐私模式 / 容量超限：静默降级
  }
}

/* ---------- public API ---------- */

/** 从游戏对象提取收藏所需的最小字段集 */
function toFavoriteItem(game: FavoriteInput): FavoriteItem {
  return {
    id: game.id,
    slug: game.slug,
    title: game.title,
    titleOriginal: game.titleOriginal,
    description: game.description,
    thumbnail: game.thumbnail,
    genre: game.genre,
    tags: game.tags,
    difficulty: game.difficulty,
    cognitiveLoad: game.cognitiveLoad,
    sessionLengthMin: game.sessionLengthMin,
    sessionLengthMax: game.sessionLengthMax,
    multiplayer: game.multiplayer,
    minPlayers: game.minPlayers,
    maxPlayers: game.maxPlayers,
    mobile: game.mobile,
    playCount: game.playCount,
    gameLanguage: game.gameLanguage,
    totalScore: game.totalScore,
    sourceQualityScore: game.sourceQualityScore ?? null,
    favoritedAt: new Date().toISOString(),
  };
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoritesMap>(readStorage());

  useEffect(() => {
    const sync = () => setFavorites(readStorage());
    window.addEventListener("favorites-change", sync);
    // 同标签页 localStorage change 事件（不同标签页间同步）
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("favorites-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const isFavorite = useCallback(
    (id: number) => id in favorites,
    [favorites],
  );

  const toggleFavorite = useCallback(
    (game: FavoriteInput): { added: boolean } => {
      const map = readStorage();
      if (game.id in map) {
        delete map[game.id];
        writeStorage(map);
        return { added: false };
      }
      map[game.id] = toFavoriteItem(game);
      writeStorage(map);
      return { added: true };
    },
    [],
  );

  const removeFavorite = useCallback((id: number) => {
    const map = readStorage();
    delete map[id];
    writeStorage(map);
  }, []);

  const list = Object.values(favorites).sort(
    (a, b) =>
      new Date(b.favoritedAt).getTime() - new Date(a.favoritedAt).getTime(),
  );

  const count = list.length;

  return { favorites, list, count, isFavorite, toggleFavorite, removeFavorite };
}
