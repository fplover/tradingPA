import type { Bar } from '@/types/market';
import type { IndicatorDef, IndicatorOutputs, ParamValue, PlotStyle } from './types';
import type { PlotStyleOverride } from '@/store/indicatorStore';

let seq = 0;

export interface IndicatorOptions {
  params?: Record<string, ParamValue>;
  styles?: Record<string, PlotStyleOverride>;
  precision?: number;
  displayName?: string;
  visibleTimeframes?: string[];
}

/**
 * 指标实例：定义 + 用户参数/样式覆盖 + 窗口化计算缓存。
 * 只计算可见范围（+ lookback 上下文），平移/缩放时按需重算。
 */
export class IndicatorInstance {
  readonly uid = `ind_${++seq}`;
  params: Record<string, ParamValue>;
  styles: Record<string, PlotStyleOverride>;
  precision?: number;
  displayName?: string;
  visibleTimeframes?: string[];

  constructor(
    readonly def: IndicatorDef,
    options?: IndicatorOptions,
  ) {
    this.params = { ...defaultParams(def), ...options?.params };
    this.styles = options?.styles ?? {};
    this.precision = options?.precision;
    this.displayName = options?.displayName;
    this.visibleTimeframes = options?.visibleTimeframes;
  }

  applyOptions(options: IndicatorOptions): void {
    this.params = { ...defaultParams(this.def), ...options.params };
    this.styles = options.styles ?? {};
    this.precision = options.precision;
    this.displayName = options.displayName;
    this.visibleTimeframes = options.visibleTimeframes;
  }

  get id(): string {
    return this.def.id;
  }

  get name(): string {
    return this.displayName || this.def.name;
  }

  get overlay(): boolean {
    return this.def.overlay;
  }

  /** 合并定义样式与用户覆盖；hidden 的 plot 由调用方跳过 */
  styleFor(plotKey: string, base: PlotStyle): PlotStyle {
    const o = this.styles[plotKey];
    if (!o) return base;
    return { ...base, color: o.color ?? base.color, lineWidth: o.lineWidth ?? base.lineWidth, kind: o.kind ?? base.kind };
  }

  isPlotHidden(plotKey: string): boolean {
    return this.styles[plotKey]?.hidden === true;
  }

  isVisibleOn(timeframeId: string | undefined): boolean {
    if (!this.visibleTimeframes || this.visibleTimeframes.length === 0) return true;
    if (!timeframeId) return true;
    return this.visibleTimeframes.includes(timeframeId);
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
