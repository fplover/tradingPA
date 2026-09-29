import type { Viewport } from '../viewport/Viewport';
import type { BarSeries } from '@/data/BarSeries';
import type { ChartTypeId } from '@/types/market';
import type { IndicatorInstance } from '@/indicators/core/instance';
import type { PaneState } from './ChartState';
import { AXIS_WIDTH } from './ChartState';
import type { DrawGeometry } from './drawSeries';
import type { GridMode } from './drawAxes';
import { drawGrid, drawPriceAxis, drawLastPrice, drawPaneLegend, drawPaneButtons } from './drawAxes';
import { drawCandles } from './drawSeries';
import { drawIndicator, indicatorValuesAt } from './drawIndicator';
import { autoscalePrice, autoscaleIndicators, type AutoscaleOptions } from './autoscale';
import { drawOhlc, drawLine, drawArea, drawBaseline, drawColumns, drawHighLow, drawStepLine, drawLineMarkers, drawHlcArea, drawVolumeCandles } from './seriesRenderers';
import { formatCompact } from '@/data/format';
import { theme, TV_FONT } from '../theme';
import { isTimeBasedChartType, vpRuntimeOf } from './ChartState';
import { drawVolumeProfile } from './drawVolumeProfile';

/**
 * 单面板渲染（D 批次拆分④；架构映射：ChartRenderer draw() 的面板循环体与
 * drawPriceSeries 图表类型分发）。帧编排在 RenderPipeline，此处只画一个面板：
 * 自适应 → 网格 → 序列/指标 → 数值轴 → 最新价 → 选中高亮 → 图例/按钮 → 自动按钮。
 */

/** PaneRenderer 宿主契约（ChartController 提供；getter 随图表类型与尺寸变化） */
export interface PaneRenderHost {
  readonly viewport: Viewport;
  /** 当前渲染序列（砖块/HA 为变换结果） */
  series(): BarSeries;
  /** 画布宽（选中高亮贯穿含数值轴的全宽） */
  canvasW(): number;
  chartW(): number;
  chartType(): ChartTypeId;
  gridMode(): GridMode;
  hideStudies(): boolean;
  /** 图例 timeframeId（指标按周期可见性） */
  timeframeId(): string | undefined;
  decimals(): number;
  percentOn(): boolean;
  selectedPaneId(): string;
}

export class PaneRenderer {
  constructor(private host: PaneRenderHost) {}

  /** 绘制单面板内容（面板局部坐标：调用方已 translate 到 pane.y）。
   *  countdownText 由编排层每帧算一次后传入（多面板共用同一墙钟读数）。 */
  draw(ctx: CanvasRenderingContext2D, pane: PaneState, from: number, to: number, opts: AutoscaleOptions, countdownText: string | null): void {
    const geo: DrawGeometry = { chartW: this.host.chartW(), chartH: pane.height };
    ctx.save();
    ctx.translate(0, pane.y);

    if (pane.kind === 'indicator') {
      autoscaleIndicators(pane, this.host.series(), from, to, opts);
      drawGrid(ctx, this.host.viewport, pane.priceScale, geo, this.host.gridMode());
      for (const inst of pane.indicators) {
        if (this.host.hideStudies() || !inst.isVisibleOn(this.host.timeframeId())) continue;
        drawIndicator(ctx, inst, this.host.series().raw(), from, to, this.host.viewport, pane.priceScale, geo);
      }
    } else {
      autoscalePrice(pane, this.host.series(), from, to, opts);
      drawGrid(ctx, this.host.viewport, pane.priceScale, geo, this.host.gridMode());
      this.drawPriceSeries(ctx, pane, geo, from, to);
      // Volume Profile（P1-F）：右缘横置直方图，先于画线/交易层（RenderPipeline 后绘，TV 同序）；
      // 仅时间轴类图表绘制（变换类无价格连续性），隐藏指标开关一并生效
      const vp = vpRuntimeOf(this.host.viewport);
      if (vp?.on && !this.host.hideStudies() && isTimeBasedChartType(this.host.chartType())) {
        drawVolumeProfile(ctx, this.host.series().raw(), from, to, pane.priceScale, geo, vp.model, vp.params, vp.dataEpoch, this.host.decimals());
      }
      // 主图叠加指标
      for (const inst of pane.indicators) {
        if (this.host.hideStudies() || !inst.isVisibleOn(this.host.timeframeId())) continue;
        drawIndicator(ctx, inst, this.host.series().raw(), from, to, this.host.viewport, pane.priceScale, geo);
      }
    }

    // 每面板数值轴：主面板全精度，副面板紧凑格式（K/M）
    if (pane.kind === 'price') {
      pane.priceScale.setPercentBase(this.host.percentOn() ? (this.host.series().barAt(from)?.close ?? null) : null);
    }
    drawPriceAxis(ctx, pane.priceScale, this.host.decimals(), geo, pane.kind !== 'price');

    // 主图最新价：点线 + 右轴方向着色徽章（徽章旁附带收盘倒计时）
    if (pane.kind === 'price') {
      const bs = this.host.series().raw();
      if (bs.length > 0) {
        const lastBar = bs[bs.length - 1];
        const prevClose = bs.length > 1 ? bs[bs.length - 2].close : lastBar.open;
        drawLastPrice(ctx, pane.priceScale, lastBar, prevClose, this.host.decimals(), geo, countdownText);
      }
    }

    // 选中面板淡色高亮（内容与轴之后绘制，避免冲淡文字/按钮）
    pane.headerBtns = null;
    if (pane.id === this.host.selectedPaneId()) {
      ctx.fillStyle = theme.paneActive;
      ctx.fillRect(0, 0, this.host.canvasW(), geo.chartH);
    }

    // 副图面板：指标图例（左上角）+ 选中时的操作按钮（右上角）
    if (pane.kind === 'indicator' && pane.indicators.length > 0) {
      const inst = pane.indicators[0];
      const value = this.indicatorValueAt(inst, to);
      drawPaneLegend(ctx, inst.name, value === null ? '' : formatCompact(value), inst.def.plots[0]?.style.color ?? theme.axisText);
      if (pane.id === this.host.selectedPaneId()) {
        pane.headerBtns = drawPaneButtons(ctx, geo);
      }
    }

    // 手动价格域指示：“自动”恢复按钮（价格轴底部）
    pane.autoBtn = null;
    if (pane.manual) {
      const text = '自动';
      ctx.font = `10px ${TV_FONT}`;
      const bw = ctx.measureText(text).width + 14;
      const bh = 16;
      const bx = geo.chartW + (AXIS_WIDTH - bw) / 2;
      const by = geo.chartH - bh - 4;
      ctx.fillStyle = theme.tooltipBg;
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = theme.axisLine;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      ctx.fillStyle = theme.axisText;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, bx + bw / 2, by + bh / 2);
      pane.autoBtn = { x: bx, y: by, w: bw, h: bh };
    }

    ctx.restore();
  }

  /** 指标在指定 index 的首个 plot 值（副图图例用） */
  private indicatorValueAt(inst: IndicatorInstance, index: number): number | null {
    const vals = indicatorValuesAt(inst, this.host.series().raw(), Math.max(0, index - 50), index);
    return vals.length > 0 ? vals[0].value : null;
  }

  /** 图表类型 → 序列渲染器分发（面板局部坐标：绘制内容已通过 translate 偏移） */
  private drawPriceSeries(ctx: CanvasRenderingContext2D, pane: PaneState, geo: DrawGeometry, from: number, to: number): void {
    const vs = this.host.viewport;
    const ps = pane.priceScale;
    const series = this.host.series();
    switch (this.host.chartType()) {
      case 'ohlc':
        drawOhlc(ctx, series, from, to, vs, ps, geo);
        break;
      case 'line':
        drawLine(ctx, series, from, to, vs, ps, geo);
        break;
      case 'step-line':
        drawStepLine(ctx, series, from, to, vs, ps, geo);
        break;
      case 'line-markers':
        drawLineMarkers(ctx, series, from, to, vs, ps, geo);
        break;
      case 'area':
        drawArea(ctx, series, from, to, vs, ps, geo);
        break;
      case 'hlc-area':
        drawHlcArea(ctx, series, from, to, vs, ps, geo);
        break;
      case 'columns':
        drawColumns(ctx, series, from, to, vs, ps, geo);
        break;
      case 'high-low':
        drawHighLow(ctx, series, from, to, vs, ps, geo);
        break;
      case 'baseline': {
        let low = Infinity;
        let high = -Infinity;
        for (let i = from; i <= to; i++) {
          const c = series.barAt(i)!.close;
          if (c < low) low = c;
          if (c > high) high = c;
        }
        drawBaseline(ctx, series, from, to, vs, ps, geo, (low + high) / 2);
        break;
      }
      case 'volume-candles':
        drawVolumeCandles(ctx, series, from, to, vs, ps, geo);
        break;
      default:
        // candles / hollow / heikin-ashi / renko / kagi / line-break / pnf / range
        drawCandles(ctx, series, from, to, vs, ps, geo);
    }
  }
}
