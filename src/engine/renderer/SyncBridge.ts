import { theme } from '../theme';
import type { BarSeries } from '@/data/BarSeries';
import type { Viewport } from '../viewport/Viewport';
import type { ViewportTimeRange } from '@/store/syncBus';

/** 视口索引空间状态（联动广播/接收的既有契约形状） */
interface ViewportState {
  first: number;
  spacing: number;
}

/**
 * 跨图表联动边界（D 批次拆分①；架构映射：ChartRenderer 联动字段/cb、publish 点、参考线绘制）。
 *
 * 职责单一：持有联动状态（同步十字光标时间 / 视口提交回调 / 十字光标时间回调），
 * 提供索引空间 ↔ 时间空间换算（TV 时间轴同步语义），绘制跨图表参考线。
 * 依赖只向下：Viewport / BarSeries / theme，不依赖 ChartRenderer——
 * viewport 构造注入；displaySeries、画布宽、重绘请求经 getter 注入
 * （前者随图表类型变换、后二者随尺寸变化，不能快照）。
 */
export class SyncBridge {
  private syncCrosshairTime: number | null = null;
  private viewportCommitCb: ((v: ViewportState) => void) | null = null;
  private crosshairTimeCb: ((t: number | null) => void) | null = null;

  constructor(
    private viewport: Viewport,
    private series: () => BarSeries,
    private chartWidth: () => number,
    private invalidate: () => void,
  ) {}

  // ---------- 十字光标同步 ----------

  /** 外部图表十字光标时间（绘制垂直参考线） */
  setSyncCrosshair(time: number | null): void {
    this.syncCrosshairTime = time;
    this.invalidate();
  }

  /** 注册本地十字光标所在 bar 时间回调（发布给外部图表） */
  onCrosshairTime(cb: ((t: number | null) => void) | null): void {
    this.crosshairTimeCb = cb;
  }

  /** 本地十字光标时间 → 通知订阅方（ChartRenderer.updateCrosshair 调用） */
  publishCrosshairTime(time: number | null): void {
    this.crosshairTimeCb?.(time);
  }

  // ---------- 视口同步 ----------

  /** 外部视口变化（索引空间广播，既有 API 契约） */
  setSyncViewport(v: ViewportState): void {
    this.viewport.setBarSpacing(v.spacing);
    this.viewport.setFirstPublic(v.first);
    this.invalidate();
  }

  /** 当前视口（索引空间） */
  getViewport(): ViewportState {
    return { first: this.viewport.first, spacing: this.viewport.spacing };
  }

  /** 视口提交（拖拽/缩放结束）→ 广播给外部图表（发布点） */
  publishViewport(): void {
    this.viewportCommitCb?.(this.getViewport());
  }

  /** 注册视口提交回调（Chart.tsx 经此接 syncBus） */
  onViewportCommit(cb: ((v: ViewportState) => void) | null): void {
    this.viewportCommitCb = cb;
  }

  // ---------- 时间空间换算（TV 时间轴同步语义） ----------

  /** 联动发布：当前视口的时间空间范围 {fromTime, toTime}。
   *  跨周期/跨品种图表按各自 series 换算，因此广播时间而非索引（索引空间跨周期会错位）。 */
  getViewportTimeRange(): ViewportTimeRange {
    const first = this.viewport.first;
    return {
      fromTime: timeAtFractionalIndex(this.series(), first),
      toTime: timeAtFractionalIndex(this.series(), first + this.chartWidth() / this.viewport.spacing),
    };
  }

  /** 联动接收：按时间范围对齐视口——用自己的 series 把 {fromTime, toTime}
   *  换算回索引/间距。无效载荷（非有限值/空区间/空序列）安全忽略，不扰动当前视口。 */
  setViewportTimeRange(range: ViewportTimeRange): void {
    if (!Number.isFinite(range.fromTime) || !Number.isFinite(range.toTime) || range.toTime <= range.fromTime) return;
    const series = this.series();
    if (series.length === 0) return;
    const fromIdx = series.fractionalIndexAt(range.fromTime);
    const toIdx = series.fractionalIndexAt(range.toTime);
    const visible = toIdx - fromIdx;
    if (!(visible > 0)) return;
    this.viewport.setBarSpacing(this.chartWidth() / visible);
    this.viewport.setFirstPublic(fromIdx);
    this.invalidate();
  }

  // ---------- 参考线 ----------

  /**
   * 联动参考线：其他图表十字光标时间的垂直虚线（全画布坐标，调用方已 translate 归零）。
   * 小数 index 插值定位——跨周期图表的时间戳不落在 bar 上时也能对齐。
   * 本地十字光标可见时不画（避免双线）。
   */
  drawReferenceLine(
    ctx: CanvasRenderingContext2D,
    chartW: number,
    chartH: number,
    localCrosshairVisible: boolean,
  ): void {
    if (this.syncCrosshairTime === null || localCrosshairVisible) return;
    const sx = this.viewport.indexToX(this.series().fractionalIndexAt(this.syncCrosshairTime));
    if (sx < 0 || sx > chartW) return;
    ctx.strokeStyle = theme.crosshair;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(Math.round(sx) + 0.5, 0);
    ctx.lineTo(Math.round(sx) + 0.5, chartH);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** 小数 index → 时间（BarSeries.fractionalIndexAt 的逆运算：相邻 bar 线性插值，范围外按统一间隔外推）。
 *  供视口联动把索引空间的 {first, 右缘} 换算成时间空间的 {fromTime, toTime}。 */
function timeAtFractionalIndex(series: BarSeries, index: number): number {
  const n = series.length;
  if (n === 0) return 0;
  const raw = series.raw();
  const iv = n > 1 ? raw[1].time - raw[0].time : 60_000;
  if (index <= 0) return raw[0].time + index * iv;
  const last = n - 1;
  if (index >= last) return raw[last].time + (index - last) * iv;
  const lo = Math.floor(index);
  return raw[lo].time + (index - lo) * (raw[lo + 1].time - raw[lo].time);
}
