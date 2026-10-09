import type { Viewport } from '../viewport/Viewport';
import type { BarSeries } from '@/data/BarSeries';
import type { Bar, ChartTypeId } from '@/types/market';
import type { IndicatorInstance } from '@/indicators/core/instance';
import type { PaneState } from './ChartState';
import { AXIS_WIDTH, type PriceAxisPos } from './ChartState';
import type { DrawGeometry } from './drawSeries';
import type { GridMode } from './drawAxes';
import { drawGrid, drawPriceAxis, drawLastPrice, drawPaneLegend, drawPaneButtons } from './drawAxes';
import { drawCandles } from './drawSeries';
import { drawIndicator, indicatorValuesAt } from './drawIndicator';
import { drawPinePaint, isCandleLike } from './drawPinePaint';
import { drawPineShapes } from './drawPineShapes';
import { autoscalePrice, autoscaleIndicators, type AutoscaleOptions } from './autoscale';
import {
  drawOhlc,
  drawLine,
  drawArea,
  drawBaseline,
  drawColumns,
  drawHighLow,
  drawStepLine,
  drawLineMarkers,
  drawHlcArea,
  drawVolumeCandles,
} from './seriesRenderers';
import { formatCompact } from '@/data/format';
import { theme, TV_FONT } from '../theme';
import { isTimeBasedChartType, vpRuntimeOf } from './ChartState';
import { drawSessionVolumeProfile, drawVolumeProfile } from './drawVolumeProfile';
import { drawCompareOverlay } from './drawCompare';
import type { CompareLegendInfo } from './legendTypes';

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
  /** 「当前」bar 与下标：非回放 = 真实末柱，回放中 = 回放游标处
   *  （最新价线/轴徽章必须取它，否则回放会显示未来价格） */
  currentBar(): Bar | undefined;
  currentIndex(): number;
  /** 画布宽（选中高亮贯穿含数值轴的全宽） */
  canvasW(): number;
  chartW(): number;
  /** 图表区左边界画布 x（价格轴在左时 = AXIS_WIDTH，绘制前按位 translate） */
  chartOffsetX(): number;
  /** 价格轴位置（right/left/none）：轴条/徽章/自动按钮随侧切换 */
  priceAxisPos(): PriceAxisPos;
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
   *  countdownText 由编排层每帧算一次后传入（多面板共用同一墙钟读数）。
   *  compare = 对比序列图例信息（P2-D；随 legend 每帧经 RenderPipeline 下发，null = 不叠加）。 */
  draw(
    ctx: CanvasRenderingContext2D,
    pane: PaneState,
    from: number,
    to: number,
    opts: AutoscaleOptions,
    countdownText: string | null,
    compare?: CompareLegendInfo | null,
  ): void {
    const geo: DrawGeometry = { chartW: this.host.chartW(), chartH: pane.height };
    // 价格轴在左时图表区整体右移一个轴宽：内容按 offset translate，
    // 轴条/徽章/自动按钮以本地负坐标画在轴条上（见 drawAxes.axisStripX）
    const pos = this.host.priceAxisPos();
    ctx.save();
    ctx.translate(this.host.chartOffsetX(), pane.y);

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
      // Pine bgcolor（P2-A①）：条件背景色带，画布层最底（先于 K 线）
      this.drawPinePaints(ctx, pane, geo, from, to, 'bg');
      this.drawPriceSeries(ctx, pane, geo, from, to);
      // Pine barcolor（P2-A①）：条件蜡烛体色覆绘（仅蜡烛族图表类型）
      if (isCandleLike(this.host.chartType())) this.drawPinePaints(ctx, pane, geo, from, to, 'bar');
      // Pine plotshape/plotchar（P2-A②）：条件标记图形，画在 K 线（含 barcolor 覆绘）之上
      this.drawPineMarkers(ctx, pane, geo, from, to);
      // Volume Profile（P1-F）：右缘横置直方图，先于画线/交易层（RenderPipeline 后绘，TV 同序）；
      // 仅时间轴类图表绘制（变换类无价格连续性），隐藏指标开关一并生效
      const vp = vpRuntimeOf(this.host.viewport);
      if (vp?.on && !this.host.hideStudies() && isTimeBasedChartType(this.host.chartType())) {
        // 会话模式（二期-G）：UTC 日逐段分布；区间模式：右缘单分布
        const vpArgs = {
          bars: this.host.series().raw(),
          from,
          to,
          viewport: this.host.viewport,
          priceScale: pane.priceScale,
          geo,
          model: vp.model,
          params: vp.params,
          dataEpoch: vp.dataEpoch,
          decimals: this.host.decimals(),
        };
        if (vp.params.mode === 'session') drawSessionVolumeProfile(ctx, vpArgs);
        else drawVolumeProfile(ctx, vpArgs);
      }
      // 主图叠加指标
      for (const inst of pane.indicators) {
        if (this.host.hideStudies() || !inst.isVisibleOn(this.host.timeframeId())) continue;
        drawIndicator(ctx, inst, this.host.series().raw(), from, to, this.host.viewport, pane.priceScale, geo);
      }
      // Compare 叠加（P2-D①）：唯一 call point，置于叠加指标之后——对比线画在面板
      // 最顶层，避免被指标曲线/填充遮挡（TV 对比序列同在最上层）；其坐标为归一化
      // 百分比副坐标，与主价格域/autoscale 完全隔离，先后次序不影响主序列几何。
      // percent 模式下与主序列同一坐标系：基准价取首根可见 bar 收盘（与下方
      // setPercentBase 同源），compare 序列本身不进 autoscale 价格域。
      if (compare) {
        drawCompareOverlay(
          ctx,
          compare,
          from,
          to,
          this.host.viewport,
          pane.priceScale,
          geo,
          this.host.percentOn(),
          this.host.series().barAt(from)?.close ?? null,
        );
      }
    }

    // 每面板数值轴：主面板全精度，副面板紧凑格式（K/M）
    if (pane.kind === 'price') {
      pane.priceScale.setPercentBase(this.host.percentOn() ? (this.host.series().barAt(from)?.close ?? null) : null);
    }
    drawPriceAxis(ctx, pane.priceScale, this.host.decimals(), geo, pane.kind !== 'price', pos);

    // 主图最新价：点线 + 价格轴方向着色徽章（徽章旁附带收盘倒计时）。
    // 取「当前 bar」而非真实末柱：回放中必须跟随回放游标，否则泄露未来价格。
    if (pane.kind === 'price') {
      const lastBar = this.host.currentBar();
      if (lastBar) {
        const i = this.host.currentIndex();
        const bs = this.host.series().raw();
        const prevClose = i > 0 ? bs[i - 1].close : lastBar.open;
        drawLastPrice(ctx, pane.priceScale, lastBar, prevClose, this.host.decimals(), geo, countdownText, pos);
      }
    }

    // 选中面板淡色高亮（内容与轴之后绘制，避免冲淡文字/按钮）；
    // 左轴时从左缘起绘，保证轴条与图表区同被高亮（右/无轴 = 原行为）
    pane.headerBtns = null;
    if (pane.id === this.host.selectedPaneId()) {
      ctx.fillStyle = theme.paneActive;
      ctx.fillRect(-this.host.chartOffsetX(), 0, this.host.canvasW(), geo.chartH);
    }

    // 副图面板：指标图例（左上角）+ 选中时的操作按钮（右上角）
    if (pane.kind === 'indicator' && pane.indicators.length > 0) {
      const inst = pane.indicators[0];
      const value = this.indicatorValueAt(inst, to);
      drawPaneLegend(
        ctx,
        inst.name,
        value === null ? '' : formatCompact(value),
        inst.def.plots[0]?.style.color ?? theme.axisText,
      );
      if (pane.id === this.host.selectedPaneId()) {
        pane.headerBtns = drawPaneButtons(ctx, geo);
      }
    }

    // 手动价格域指示：“自动”恢复按钮（价格轴底部，随轴侧落位）
    pane.autoBtn = null;
    if (pane.manual) {
      const text = '自动';
      ctx.font = `10px ${TV_FONT}`;
      const bw = ctx.measureText(text).width + 14;
      const bh = 16;
      const axisX = pos === 'left' ? -AXIS_WIDTH : geo.chartW; // 与 drawPriceAxis 同一轴条锚点
      const bx = axisX + (AXIS_WIDTH - bw) / 2;
      const by = geo.chartH - bh - 4;
      ctx.fillStyle = theme.autoBtnBg;
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

  /** Pine 绘图指令相位绘制（P2-A①）：主价格面板的全部可见指标实例，
   *  无 paint 旁路的实例在 drawPinePaint 内直接返回（computeExtra undefined）。 */
  private drawPinePaints(
    ctx: CanvasRenderingContext2D,
    pane: PaneState,
    geo: DrawGeometry,
    from: number,
    to: number,
    mode: 'bg' | 'bar',
  ): void {
    const bars = this.host.series().raw();
    for (const inst of pane.indicators) {
      if (this.host.hideStudies() || !inst.isVisibleOn(this.host.timeframeId())) continue;
      drawPinePaint(ctx, inst, bars, from, to, this.host.viewport, pane.priceScale, geo, mode);
    }
  }

  /** Pine plotshape/plotchar 标记绘制（P2-A②）：与 drawPinePaints 同遍历口径，
   *  无 shape 旁路（kind 不匹配）的实例在 drawPineShapes 内直接返回。 */
  private drawPineMarkers(
    ctx: CanvasRenderingContext2D,
    pane: PaneState,
    geo: DrawGeometry,
    from: number,
    to: number,
  ): void {
    const bars = this.host.series().raw();
    for (const inst of pane.indicators) {
      if (this.host.hideStudies() || !inst.isVisibleOn(this.host.timeframeId())) continue;
      drawPineShapes(ctx, inst, bars, from, to, this.host.viewport, pane.priceScale, geo);
    }
  }

  /** 图表类型 → 序列渲染器分发（面板局部坐标：绘制内容已通过 translate 偏移） */
  private drawPriceSeries(
    ctx: CanvasRenderingContext2D,
    pane: PaneState,
    geo: DrawGeometry,
    from: number,
    to: number,
  ): void {
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
