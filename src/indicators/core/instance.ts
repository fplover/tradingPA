import type { Bar } from '@/types/market';
import type { IndicatorDef, IndicatorOutputs, ParamValue, PlotStyle } from './types';
import type { PlotStyleOverride } from '@/store/indicatorStore';

let seq = 0;

/**
 * 窗口脏缓存容量：一帧内每指标最多 2 个活窗口（绘制/autoscale 窗口 + 图例
 * 50 根回看窗口），留一倍余量给十字光标移动时的窗口滑移；FIFO + 命中提级，
 * 超出即淘汰最旧，内存有界。
 */
const WINDOW_CACHE_LIMIT = 6;

/** 脏缓存条目：与一次 computeWindow(bars, from, to) 的全部输入绑定 */
interface WindowCacheEntry {
  /** bars 数组引用：replace/prepend/变换序列重建均换引用 → 失效 */
  barsRef: readonly Bar[];
  /** 末 bar 对象引用：新 bar（time 变）与实时 tick（同 time、新对象）都换引用 → 失效 */
  lastBarRef: Bar | undefined;
  from: number;
  to: number;
  paramsVersion: number;
  /** params 浅快照：防御调用方绕过 applyOptions 就地修改 params 字段 */
  paramsSnapshot: Record<string, ParamValue>;
  outputs: IndicatorOutputs;
  /** computeExtra 旁路输出（Pine paint 用）：与 outputs 同窗口、同失效周期 */
  extra: unknown;
  ctxFrom: number;
}

function paramsEqual(a: Record<string, ParamValue>, b: Record<string, ParamValue>): boolean {
  if (a === b) return true;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/** 输出 record 与各 plot 数组的副本：缓存结果禁调用方就地修改。
 *  现有三个消费方（draw/autoscale/legend）均只读；副本保证未来的写入方也不会
 *  污染缓存。值逐项相同（slice 保序保洞），对数值零影响。 */
function copyOutputs(outputs: IndicatorOutputs): IndicatorOutputs {
  const out: IndicatorOutputs = {};
  for (const k of Object.keys(outputs)) out[k] = outputs[k].slice();
  return out;
}

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

  /** params 版本号：applyOptions 值变化时自增（脏缓存键的一部分） */
  private paramsVersion = 0;
  /** 窗口脏缓存：键 `${from}:${to}`，容量有界（见 WINDOW_CACHE_LIMIT） */
  private windowCache = new Map<string, WindowCacheEntry>();

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
    const nextParams = { ...defaultParams(this.def), ...options.params };
    // 仅值变化时 bump：UI 层每次 store 变更都会全量下发 options，同值重下发
    // 不应失效缓存（否则平移/实时帧会被设置面板的无关抖动拖累）
    if (!paramsEqual(this.params, nextParams)) this.paramsVersion++;
    this.params = nextParams;
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

  /**
   * 在给定窗口上计算，输出与 bars 等长对齐（窗口外为 undefined）。
   *
   * 脏缓存（架构评估 #4）：键 = bars 引用 + 末 bar 引用 + from/to 窗口 +
   * params 版本号。四条失效路径全部自动命中——新 bar（time 变，末 bar 换
   * 引用）/ 实时 tick（同 time 新 bar 对象，引用同样换）/ bars 替换
   * （replace/prepend/变换序列重建换数组引用）/ 窗口变化 / 参数变化。
   * 平移、缩放、十字光标移动等数据未变的帧直接命中，不再重算。
   *
   * 同帧复用：autoscale（indicatorRange）、绘制（drawIndicator）、图例
   * （indicatorValuesAt）三个消费方对同一 (instance, window) 的调用共享
   * 这一次计算——缓存落在实例上，调用点零改动。
   *
   * 返回的 outputs 是副本：调用方只读，禁就地修改（改副本不影响缓存）。
   */
  computeWindow(bars: readonly Bar[], from: number, to: number): { outputs: IndicatorOutputs; ctxFrom: number; extra: unknown } {
    const lastBar = bars.length > 0 ? bars[bars.length - 1] : undefined;
    const key = `${from}:${to}`;
    const hit = this.windowCache.get(key);
    if (hit && this.isCacheHit(hit, bars, lastBar)) {
      // 命中提级到最新，避免活跃窗口被滑移窗口挤出
      this.windowCache.delete(key);
      this.windowCache.set(key, hit);
      return { outputs: copyOutputs(hit.outputs), ctxFrom: hit.ctxFrom, extra: hit.extra };
    }
    const ctxFrom = Math.max(0, from - this.def.lookback);
    const ctx = bars.slice(ctxFrom, to + 1);
    const outputs = this.def.compute(ctx, this.params);
    const extra = this.def.computeExtra?.(ctx, this.params);
    this.windowCache.set(key, {
      barsRef: bars,
      lastBarRef: lastBar,
      from,
      to,
      paramsVersion: this.paramsVersion,
      paramsSnapshot: { ...this.params },
      outputs,
      extra,
      ctxFrom,
    });
    if (this.windowCache.size > WINDOW_CACHE_LIMIT) {
      const oldest = this.windowCache.keys().next().value;
      if (oldest !== undefined) this.windowCache.delete(oldest);
    }
    return { outputs: copyOutputs(outputs), ctxFrom, extra };
  }

  private isCacheHit(entry: WindowCacheEntry, bars: readonly Bar[], lastBar: Bar | undefined): boolean {
    return (
      entry.barsRef === bars &&
      entry.lastBarRef === lastBar &&
      entry.paramsVersion === this.paramsVersion &&
      paramsEqual(entry.paramsSnapshot, this.params)
    );
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
