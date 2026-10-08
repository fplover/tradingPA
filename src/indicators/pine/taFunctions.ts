import type { S } from './series';
import { FNS_MATH } from './ta-math';
import { FNS_MOMENTUM } from './ta-momentum';
import { FNS_OVERLAP } from './ta-overlap';
import type { FnDef, TaCtx } from './ta-shared';

/**
 * Pine 子集函数注册表装配与统一分发：ta.*（既有 10 个 + 新增 ~21 个）与 math.*。
 * 族条目按职责拆至 ta-overlap / ta-momentum / ta-math（声明式数据），
 * 共享层（类型/参数校验/序列实现）在 ta-shared.ts；
 * 窗口/序列数学优先复用 series.ts 与 core/math（同源，不重复实现）；
 * 依赖 OHLCV 的实现在 taCore.ts。
 */

export type { TaCtx } from './ta-shared';

export const FNS: Record<string, FnDef> = {
  ...FNS_OVERLAP,
  ...FNS_MOMENTUM,
  ...FNS_MATH,
};

export const PINE_FN_NAMES: ReadonlySet<string> = new Set(Object.keys(FNS));

/** 统一函数分发：ta.* / math.*；未知函数由调用方（validate/解释器）报错 */
export function callFunction(name: string, args: S[], ctx: TaCtx): S | S[] {
  const def = FNS[name];
  if (!def) throw new Error(`不支持的函数「${name}」`);
  if (args.length < def.min || args.length > def.max) {
    throw new Error(
      `「${name}」参数数量应为 ${def.min}${def.max !== def.min ? `-${def.max}` : ''}，实际 ${args.length}`,
    );
  }
  return def.fn(args, ctx);
}
