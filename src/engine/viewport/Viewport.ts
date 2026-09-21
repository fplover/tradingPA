import type { TimeScaleOptions } from '@/types/market';

const DEFAULT_BAR_SPACING = 8;

const DEFAULTS: TimeScaleOptions = {
  rightOffset: 5,
  minBarSpacing: 0.001,
  maxBarSpacing: 120,
};

/**
 * 视口：管理可见范围（firstIndex + barSpacing），处理平移与缩放及边界钳制。
 * 这是所有交互（拖拽平移、滚轮缩放）的状态中心。
 */
export class Viewport {
  private firstIndex = 0;
  private barSpacing = DEFAULT_BAR_SPACING;
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
    this.firstIndex = this.count - Math.ceil(visibleCount) + this.options.rightOffset;
    this.clamp();
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
    // 缩小下限取 max(静态下限, min(铺满全部数据所需间距, 默认间距))：
    // 数据多时最小缩到"铺满宽度"，数据少时最小缩到默认间距
    const fitAll = this.count > 0 ? this.width / this.count : Infinity;
    const min = Math.max(this.options.minBarSpacing, Math.min(fitAll, DEFAULT_BAR_SPACING));
    return Math.min(this.options.maxBarSpacing, Math.max(min, spacing));
  }

  private clamp(): void {
    const visibleCount = this.width / this.barSpacing;
    // 最右：最后一根 K 线距右边缘保留 rightOffset 个 bar 的空隙
    const maxFirst = this.count - visibleCount + this.options.rightOffset;
    // 最左：第一根 K 线最多拖到画面中线
    const minFirst = -Math.ceil(visibleCount / 2);
    this.firstIndex = Math.max(minFirst, Math.min(maxFirst, this.firstIndex));
  }

  get first(): number {
    return this.firstIndex;
  }

  get spacing(): number {
    return this.barSpacing;
  }

  get barCount(): number {
    return this.count;
  }

  /** 视口是否贴在右边缘（实时更新时决定是否跟随滚动） */
  isAtRightEdge(): boolean {
    const visibleCount = this.width / this.barSpacing;
    const maxFirst = this.count - visibleCount + this.options.rightOffset;
    return this.firstIndex >= maxFirst - 0.5;
  }

  xToIndex(x: number): number {
    return x / this.barSpacing + this.firstIndex;
  }

  indexToX(index: number): number {
    return (index - this.firstIndex) * this.barSpacing;
  }
}
