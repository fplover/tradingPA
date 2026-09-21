import type { TimeScaleOptions } from '@/types/market';

const DEFAULTS: TimeScaleOptions = {
  rightOffset: 5,
  minBarSpacing: 1,
  maxBarSpacing: 120,
};

/**
 * 视口：管理可见范围（firstIndex + barSpacing），处理平移与缩放及边界钳制。
 * 这是所有交互（拖拽平移、滚轮缩放）的状态中心。
 */
export class Viewport {
  private firstIndex = 0;
  private barSpacing = 8;
  private count = 0;
  private width = 0;
  private options: TimeScaleOptions = { ...DEFAULTS };

  constructor(width = 0) {
    this.width = width;
  }

  setSize(width: number): void {
    this.width = width;
  }

  setBarCount(count: number): void {
    this.count = count;
  }

  getOptions(): TimeScaleOptions {
    return this.options;
  }

  /** 初始定位：让最新 K 线贴右侧（留 rightOffset 空位） */
  scrollToRealtime(): void {
    const visibleCount = this.width / this.barSpacing;
    this.firstIndex = Math.max(0, this.count - Math.ceil(visibleCount) + this.options.rightOffset);
  }

  panByBars(bars: number): void {
    this.firstIndex += bars;
    this.clamp();
  }

  /** 以画布 x 位置为锚点缩放，保证该处的 bar 位置不动 */
  zoomAt(x: number, factor: number): void {
    const anchorIndex = this.xToIndex(x);
    const newSpacing = this.clampSpacing(this.barSpacing * factor);
    const anchorXBefore = this.indexToX(anchorIndex);
    this.barSpacing = newSpacing;
    const anchorXAfter = this.indexToX(anchorIndex);
    // 令 (anchor - first') * spacing' == anchorXBefore，推出 first' = first + dx / spacing'
    const dx = anchorXAfter - anchorXBefore;
    this.firstIndex += dx / this.barSpacing;
    this.clamp();
  }

  private clampSpacing(spacing: number): number {
    return Math.min(this.options.maxBarSpacing, Math.max(this.options.minBarSpacing, spacing));
  }

  private clamp(): void {
    const visibleCount = this.width / this.barSpacing;
    const maxFirst = this.count - 1 + this.options.rightOffset;
    const minFirst = -Math.ceil(visibleCount / 2);
    this.firstIndex = Math.min(maxFirst, Math.max(minFirst, this.firstIndex));
  }

  get first(): number {
    return this.firstIndex;
  }

  get spacing(): number {
    return this.barSpacing;
  }

  xToIndex(x: number): number {
    return x / this.barSpacing + this.firstIndex;
  }

  indexToX(index: number): number {
    return (index - this.firstIndex) * this.barSpacing;
  }
}
