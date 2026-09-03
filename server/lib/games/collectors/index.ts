/**
 * 采集器注册表：源 code → adapter 工厂。
 * 新增数据源（Gamezop / GameMonetize…）在此注册即可接入同步管道。
 */
import { createGamePixAdapter } from "./gamepix";
import type { SourceAdapter } from "./types";

export * from "./types";
export { syncSource } from "./pipeline";

const ADAPTER_FACTORIES: Record<string, () => SourceAdapter> = {
  gamepix: createGamePixAdapter,
};

/** 获取全部已注册 adapter（Gamezop 等 T3.4 接入后追加） */
export function allAdapters(): SourceAdapter[] {
  return Object.values(ADAPTER_FACTORIES)
    .map((create) => {
      try {
        return create();
      } catch {
        // 环境变量缺失等注册期错误：跳过该源，不影响其他源同步
        return null;
      }
    })
    .filter((a): a is SourceAdapter => a !== null);
}

export function getAdapter(code: string): SourceAdapter | null {
  const create = ADAPTER_FACTORIES[code];
  if (!create) return null;
  try {
    return create();
  } catch {
    return null;
  }
}
