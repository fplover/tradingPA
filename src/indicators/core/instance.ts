import type { Bar } from '@/types/market';
import type { IndicatorDef, IndicatorOutputs, ParamValue } from './types';

let seq = 0;

/**
 * 指标实例：定义 + 用户参数 + 窗口化计算缓存。
 * 只计算可见范围（+ lookback 上下文），平移/缩放时按需重算。
 */
export class IndicatorInstance {
  readonly uid = `ind_${++seq}`;
  params: Record<string, ParamValue>;

  constructor(
    readonly def: IndicatorDef,
    overrides?: Record<string, ParamValue>,
  ) {
    this.params = { ...defaultParams(def), ...overrides };
  }

  get id(): string {
    return this.def.id;
  }

  get name(): string {
    return this.def.name;
  }

  get overlay(): boolean {
    return this.def.overlay;
  }

  /** 在给定窗口上计算，输出与 bars 等长对齐（窗口外为 undefined） */
  computeWindow(bars: readonly Bar[], from: number, to: number): { outputs: IndicatorOutputs; ctxFrom: number } {
    const ctxFrom = Math.max(0, from - this.def.lookback);
    const ctx = bars.slice(ctxFrom, to + 1);
    const outputs = this.def.compute(ctx, this.params);
    return { outputs, ctxFrom };
  }
}

export function defaultParams(def: IndicatorDef): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const p of def.params) out[p.key] = p.default;
  return out;
}

export function paramLabel(def: IndicatorDef, key: string): string {
  return def.params.find((p) => p.key === key)?.label ?? key;
}
