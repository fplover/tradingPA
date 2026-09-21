import type { PriceScaleOptions } from '@/types/market';

const DEFAULTS: PriceScaleOptions = {
  paddingTop: 0.08,
  paddingBottom: 0.08,
};

/**
 * 价格坐标：price <-> y 像素换算，支持线性/对数模式。
 */
export class PriceScale {
  private min = 0;
  private max = 1;
  private height = 0;
  private logMode = false;
  private options: PriceScaleOptions = { ...DEFAULTS };

  setSize(height: number): void {
    this.height = height;
  }

  setLogMode(on: boolean): void {
    this.logMode = on;
  }

  get isLog(): boolean {
    return this.logMode;
  }

  setOptions(options: Partial<PriceScaleOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /** 根据可见 K 线的最低价/最高价自动适配价格范围（对数模式用乘法留白） */
  autoScale(low: number, high: number): void {
    if (this.logMode && low > 0 && high > 0) {
      this.min = low * (1 - 0.1);
      this.max = high * (1 + 0.1);
      return;
    }
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

  /** 平移价格域（不重新留白，供拖拽用） */
  shift(delta: number): void {
    this.min += delta;
    this.max += delta;
  }

  /** 直接设置价格域（不留白，供价格轴缩放用） */
  setRange(min: number, max: number): void {
    this.min = min;
    this.max = max;
  }

  private get usable(): boolean {
    return this.logMode && this.min > 0 && this.max > 0;
  }

  priceToY(price: number): number {
    const { min, max } = this;
    if (this.usable) {
      const lmin = Math.log(min);
      const lmax = Math.log(max);
      const ratio = (Math.log(Math.max(price, 1e-9)) - lmin) / (lmax - lmin || 1e-9);
      return this.height * (1 - ratio);
    }
    const ratio = (price - min) / (max - min || 1e-9);
    return this.height * (1 - ratio);
  }

  yToPrice(y: number): number {
    const ratio = 1 - y / (this.height || 1);
    if (this.usable) {
      const lmin = Math.log(this.min);
      const lmax = Math.log(this.max);
      return Math.exp(lmin + ratio * (lmax - lmin));
    }
    return this.min + ratio * (this.max - this.min);
  }

  /** 生成美观的价格轴刻度值（约 targetCount 个） */
  ticks(targetCount = 6): number[] {
    const { min, max } = this;
    if (this.usable) {
      // 对数模式：在 log 空间取整刻度再映射回价格
      const lmin = Math.log(min);
      const lmax = Math.log(max);
      const rough = (lmax - lmin) / targetCount;
      const mag = Math.pow(10, Math.floor(Math.log10(rough)));
      const norm = rough / mag;
      const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
      const ticks: number[] = [];
      for (let v = Math.ceil(lmin / step) * step; v <= lmax; v += step) {
        ticks.push(Number(Math.exp(v).toPrecision(12)));
      }
      return ticks;
    }
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
