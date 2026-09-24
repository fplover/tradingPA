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
  /** 复盘边缘：回放期间视口最右只能到此 index（null = 无限制） */
  private replayEdge: number | null = null;

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
    // 与 isAtRightEdge 使用同一公式，保证贴边判定精确
    this.firstIndex = this.count - visibleCount + this.options.rightOffset;
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
    // 最右：允许拖入右侧空白区（TV 行为，幅度为一整个视口=整个画布宽）；
    // 回放期间以复盘位置为数据边界（未来 K 线不可见）
    const dataEdge = this.replayEdge !== null ? this.replayEdge : this.count;
    const maxFirst = dataEdge - visibleCount + Math.max(this.options.rightOffset, visibleCount);
    // 最左：第一根 K 线最多拖到画面右缘（同样一整个视口）
    const minFirst = -Math.ceil(visibleCount);
    this.firstIndex = Math.max(minFirst, Math.min(maxFirst, this.firstIndex));
  }

  /** 设置复盘边缘（null = 取消），立即重新钳制 */
  setReplayEdge(index: number | null): void {
    this.replayEdge = index;
    this.clamp();
  }

  get first(): number {
    return this.firstIndex;
  }

  /** 公开设置首 index（带边界钳制），供多图表联动 */
  setFirstPublic(index: number): void {
    this.firstIndex = index;
    this.clamp();
  }

  /** 公开设置 bar 间距（带钳制），供多图表联动 */
  setBarSpacing(spacing: number): void {
    this.barSpacing = this.clampSpacing(spacing);
  }

  get spacing(): number {
    return this.barSpacing;
  }

  get barCount(): number {
    return this.count;
  }

  /** 视口是否正好贴在实时边缘（自动跟随滚动只在此时生效；拖入空白区后脱钩） */
  isAtRightEdge(): boolean {
    const visibleCount = this.width / this.barSpacing;
    const realtimeEdge = this.count - visibleCount + this.options.rightOffset;
    return Math.abs(this.firstIndex - realtimeEdge) <= 1;
  }

  xToIndex(x: number): number {
    return x / this.barSpacing + this.firstIndex;
  }

  indexToX(index: number): number {
    return (index - this.firstIndex) * this.barSpacing;
  }
}
