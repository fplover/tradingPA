import { useSyncExternalStore } from 'react';
import { pineRuntimeErrors, subscribePineRuntimeErrors } from '@/indicators/pine/compile';

/**
 * Pine 运行期错误订阅（UI 出口）：compute 兜底捕获的错误（如用户把周期改成 0）
 * 编译期 dry-run 用默认值发现不了，经此通道接到图例设置面板与编辑器控制台。
 * 快照为不可变 Map（脚本 id → 错误消息），useSyncExternalStore 直接订阅。
 */

/** 全部 Pine 脚本的运行期错误快照 */
export function usePineRuntimeErrors(): ReadonlyMap<string, string> {
  return useSyncExternalStore(subscribePineRuntimeErrors, pineRuntimeErrors, pineRuntimeErrors);
}

/** 单个脚本（指标 id）的运行期错误；无则 undefined */
export function usePineRuntimeError(id: string): string | undefined {
  return usePineRuntimeErrors().get(id);
}
