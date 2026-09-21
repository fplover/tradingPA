import type { PriceScaleOptions } from '@/types/market';

const DEFAULTS: PriceScaleOptions = {
  paddingTop: 0.08,
  paddingBottom: 0.08,
};

/**
 * 价格坐标：price <-> y 像素换算。
 * M0 仅支持线性模式，对数模式在 M2 引入。
 */
export class PriceScale {
  private min = 0;
  private max = 1;
  private height = 0;
  private options: PriceScaleOptions = { ...DEFAULTS };

  setSize(height: number): void {
    this.height = height;
  }

  setOptions(options: Partial<PriceScaleOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /** 根据可见 K 线的最低价/最高价自动适配价格范围 */
  autoScale(low: number, high: number): void {
    const span = high - low || Math.max(1e-9, high * 0.001);
    const pad = span * 0.1;
    this.min = low - pad;
    this.max = high + pad;
    this.applyPadding();
  }

  private applyPadding(): void {
    const span = this.max - this.min || 1e-9;
    const padTop = span * this.options.paddingTop;
    const padBottom = span * this.options.paddingBottom;
    this.min -= padBottom;
    this.max += padTop;
  }

  get range(): { min: number; max: number } {
    return { min: this.min, max: this.max };
  }

  priceToY(price: number): number {
    const { min, max } = this;
    const ratio = (price - min) / (max - min || 1e-9);
    return this.height * (1 - ratio);
  }

  yToPrice(y: number): number {
    const ratio = 1 - y / (this.height || 1);
    return this.min + ratio * (this.max - this.min);
  }

  /** 生成美观的价格轴刻度值（约 targetCount 个） */
  ticks(targetCount = 6): number[] {
    const { min, max } = this;
    const span = max - min;
    if (span <= 0 || this.height <= 0) return [];
    const rough = span / targetCount;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
    const first = Math.ceil(min / step) * step;
    const ticks: number[] = [];
    for (let v = first; v <= max; v += step) {
      ticks.push(Number(v.toPrecision(12)));
    }
    return ticks;
  }

  /** 根据数值动态选择小数位 */
  static decimalsFor(price: number): number {
    if (price >= 1000) return 2;
    if (price >= 1) return 3;
    return 6;
  }
}
