import { CanvasManager } from '../canvas/CanvasManager';
import { Viewport } from '../viewport/Viewport';
import { PriceScale } from '../scale/PriceScale';
import { Crosshair } from '../crosshair/Crosshair';
import { BarSeries } from '@/data/BarSeries';
import { theme } from '../theme';
import type { Bar, ChartTypeId } from '@/types/market';
import { heikinAshi, renko, kagi, lineBreak, pointAndFigure, rangeBars, atr, type BrickOptions } from '@/data/transforms';
import { IndicatorInstance } from '@/indicators/core/instance';
import { getIndicatorDef } from '@/indicators/registry';
import { drawCandles, type DrawGeometry } from './drawSeries';
import { drawGrid, drawPriceAxis, drawTimeAxis, drawBorders } from './drawAxes';
import { drawOhlc, drawLine, drawArea, drawBaseline, drawVolume } from './seriesRenderers';
import { drawCrosshair, type LegendInfo } from './drawCrosshair';
import { drawIndicator, indicatorRange, indicatorValuesAt } from './drawIndicator';

const AXIS_WIDTH = 64;
const AXIS_HEIGHT = 24;
const PANE_GAP = 0;

type PaneKind = 'price' | 'volume' | 'indicator';

interface PaneState {
  id: string;
  kind: PaneKind;
  heightRatio: number;
  priceScale: PriceScale;
  indicators: IndicatorInstance[];
  y: number;
  height: number;
}

/** 砖块类图表类型的默认参数（按 ATR 自适应） */
function brickOptions(bars: Bar[]): BrickOptions {
  const size = atr(bars.slice(-200)) || (bars[bars.length - 1]?.close ?? 1) * 0.001;
  return { brickSize: size, reversal: size * 3, lineCount: 3 };
}

/**
 * 图表渲染器：拥有画布/视口/多面板/数据/十字光标，rAF 合帧重绘。
 * 面板模型：index 0 为主价格面板，其余为副面板（成交量等，M3 起挂指标）。
 */
export class ChartRenderer {
  private manager: CanvasManager;
  private viewport: Viewport;
  private panes: PaneState[] = [];
  private baseSeries = new BarSeries();
  /** 当前图表类型下实际渲染的序列（砖块/HA 为变换结果） */
  private displaySeries: BarSeries = this.baseSeries;
  private crosshair = new Crosshair();
  private legend: LegendInfo;
  private rafId = 0;
  private dirty = true;
  private disposed = false;
  private hoveredPaneId = 'main';

  private chartType: ChartTypeId = 'candles';
  private logScale = false;
  private brickOpts: BrickOptions = {};

  /** 最近一帧绘制耗时（ms），供性能监控与测试 */
  lastFrameMs = 0;

  // 拖拽状态
  private dragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private priceDragging = false;
  private priceYAtDragStart = 0;

  constructor(canvas: HTMLCanvasElement, bars: Bar[] = [], legend?: Partial<LegendInfo>) {
    this.manager = new CanvasManager(canvas);
    this.viewport = new Viewport(this.manager.width - AXIS_WIDTH);
    this.legend = { symbol: 'BTC/USDT', interval: '1m', decimals: 2, ...legend };
    this.baseSeries.replace(bars);
    this.brickOpts = brickOptions(bars);
    this.panes = [this.createPane('main', 'price', 3)];
    this.viewport.setBarCount(this.displaySeries.length);
    this.manager.onResize(() => {
      this.viewport.setSize(this.manager.width - AXIS_WIDTH);
      this.invalidate();
    });
    this.bindInput(canvas);
    this.applyData(true);
  }

  private createPane(id: string, kind: PaneKind, heightRatio: number): PaneState {
    return { id, kind, heightRatio, priceScale: new PriceScale(), indicators: [], y: 0, height: 0 };
  }

  // ---------- 公开 API ----------

  setLegend(legend: Partial<LegendInfo>): void {
    this.legend = { ...this.legend, ...legend };
    this.invalidate();
  }

  setData(bars: Bar[]): void {
    this.baseSeries.replace(bars);
    this.brickOpts = brickOptions(bars);
    this.applyData(true);
  }

  /** 实时推送单根 K 线：贴在右边缘时跟随滚动，否则保持当前视图 */
  updateBar(bar: Bar): void {
    const atRightEdge = this.viewport.isAtRightEdge();
    this.baseSeries.update(bar);
    this.applyData(atRightEdge);
  }

  setChartType(type: ChartTypeId): void {
    this.chartType = type;
    this.applyData(true);
  }

  setLogScale(on: boolean): void {
    this.logScale = on;
    for (const pane of this.panes) pane.priceScale.setLogMode(on);
    this.invalidate();
  }

  setVolumePaneVisible(visible: boolean): void {
    const has = this.panes.some((p) => p.kind === 'volume');
    if (visible && !has) {
      this.panes.push(this.createPane('volume', 'volume', 1));
      this.invalidate();
    } else if (!visible && has) {
      this.panes = this.panes.filter((p) => p.kind !== 'volume');
      this.invalidate();
    }
  }

  // ---------- 指标 ----------

  /** 添加指标：overlay 进主面板，否则新建独立副图面板。返回实例 uid */
  addIndicator(id: string, overrides?: Record<string, string | number | boolean>): string | null {
    const def = getIndicatorDef(id);
    if (!def) return null;
    const instance = new IndicatorInstance(def, overrides);
    if (def.overlay) {
      this.panes[0].indicators.push(instance);
    } else {
      this.panes.push(this.createPane(`pane_${instance.uid}`, 'indicator', 1));
      this.panes[this.panes.length - 1].indicators.push(instance);
    }
    this.invalidate();
    return instance.uid;
  }

  removeIndicator(uid: string): void {
    for (const pane of this.panes) {
      const idx = pane.indicators.findIndex((i) => i.uid === uid);
      if (idx >= 0) pane.indicators.splice(idx, 1);
    }
    // 指标面板空了就移除
    this.panes = this.panes.filter((p) => !(p.kind === 'indicator' && p.indicators.length === 0));
    this.invalidate();
  }

  updateIndicatorParams(uid: string, params: Record<string, string | number | boolean>): void {
    for (const pane of this.panes) {
      const inst = pane.indicators.find((i) => i.uid === uid);
      if (inst) {
        inst.params = { ...inst.params, ...params };
        this.invalidate();
        return;
      }
    }
  }

  /** 全部激活指标（供 UI 列表） */
  listIndicators(): Array<{ uid: string; id: string; name: string; overlay: boolean; params: Record<string, string | number | boolean> }> {
    const out: Array<{ uid: string; id: string; name: string; overlay: boolean; params: Record<string, string | number | boolean> }> = [];
    for (const pane of this.panes) {
      for (const inst of pane.indicators) {
        out.push({ uid: inst.uid, id: inst.id, name: inst.name, overlay: inst.overlay, params: inst.params });
      }
    }
    return out;
  }

  /** 默认指标组合模板（localStorage 由 UI 层持久化） */
  exportIndicatorTemplate(): Array<{ id: string; params: Record<string, string | number | boolean> }> {
    return this.listIndicators().map(({ id, params }) => ({ id, params }));
  }

  importIndicatorTemplate(list: Array<{ id: string; params?: Record<string, string | number | boolean> }>): void {
    for (const pane of this.panes) pane.indicators = [];
    this.panes = this.panes.filter((p) => p.kind !== 'indicator');
    for (const item of list) this.addIndicator(item.id, item.params);
  }

  /** 数据/图表类型变化后：重建 displaySeries 并重置视口 */
  private applyData(resetView: boolean): void {
    const transformTypes: ChartTypeId[] = [
      'heikin-ashi',
      'renko',
      'kagi',
      'line-break',
      'point-figure',
      'range',
    ];
    if (transformTypes.includes(this.chartType)) {
      const bars = this.materialize();
      const opts = this.brickOpts;
      const transformed =
        this.chartType === 'heikin-ashi'
          ? heikinAshi(bars)
          : this.chartType === 'renko'
            ? renko(bars, opts.brickSize ?? 1)
            : this.chartType === 'kagi'
              ? kagi(bars, opts.reversal ?? 1)
              : this.chartType === 'line-break'
                ? lineBreak(bars, opts.lineCount ?? 3)
                : this.chartType === 'point-figure'
                  ? pointAndFigure(bars, opts.brickSize ?? 1, 3)
                  : rangeBars(bars, opts.brickSize ?? 1);
      this.displaySeries = new BarSeries();
      this.displaySeries.replace(transformed);
    } else {
      this.displaySeries = this.baseSeries;
    }
    this.viewport.setBarCount(this.displaySeries.length);
    if (resetView && this.displaySeries.length > 0) this.viewport.scrollToRealtime();
    this.crosshair.clear();
    this.invalidate();
  }

  private materialize(): Bar[] {
    const bars: Bar[] = [];
    const n = this.baseSeries.length;
    for (let i = 0; i < n; i++) bars.push(this.baseSeries.barAt(i)!);
    return bars;
  }

  start(): void {
    if (this.rafId || this.disposed) return;
    const loop = () => {
      if (this.disposed) return;
      if (this.dirty) {
        this.dirty = false;
        this.draw();
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.unbindInput(this.manager.canvas);
    this.manager.dispose();
  }

  invalidate(): void {
    this.dirty = true;
  }

  // ---------- 输入 ----------

  private toLocal(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.manager.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private paneAt(y: number): PaneState {
    for (const pane of this.panes) {
      if (y >= pane.y && y < pane.y + pane.height) return pane;
    }
    return this.panes[0];
  }

  private onPointerDown = (e: PointerEvent) => {
    const { x, y } = this.toLocal(e);
    const inPriceAxis = x > this.manager.width - AXIS_WIDTH;
    const inTimeAxis = y > this.manager.height - AXIS_HEIGHT;
    this.manager.canvas.setPointerCapture(e.pointerId);
    if (inPriceAxis) {
      this.priceDragging = true;
      this.priceYAtDragStart = y;
    } else if (!inTimeAxis) {
      this.dragging = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.crosshair.clear();
      this.invalidate();
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const { x, y } = this.toLocal(e);
    if (this.dragging) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.viewport.panByBars(-dx / this.viewport.spacing);
      const pane = this.paneAt(y);
      const { min, max } = pane.priceScale.range;
      const span = max - min;
      const shift = (dy / Math.max(1, pane.height)) * span;
      pane.priceScale.autoScale(min + shift, max + shift);
      this.invalidate();
    } else if (this.priceDragging) {
      const dy = y - this.priceYAtDragStart;
      const pane = this.paneAt(y);
      const { min, max } = pane.priceScale.range;
      const span = max - min;
      const shift = -(dy / Math.max(1, pane.height)) * span;
      pane.priceScale.autoScale(min + shift, max + shift);
      this.invalidate();
    } else {
      this.updateCrosshair(x, y);
    }
  };

  private updateCrosshair(x: number, y: number): void {
    const chartW = this.manager.width - AXIS_WIDTH;
    const chartH = this.manager.height - AXIS_HEIGHT;
    if (x < 0 || x > chartW || y < 0 || y > chartH) {
      this.crosshair.clear();
      this.invalidate();
      return;
    }
    const pane = this.paneAt(y);
    this.hoveredPaneId = pane.id;
    const idx = Math.round(this.viewport.xToIndex(x));
    const bar = this.displaySeries.barAt(idx);
    if (bar) {
      const price = pane.priceScale.yToPrice(y - pane.y);
      this.crosshair.set(x, y, idx, bar.time, price);
    } else {
      this.crosshair.clear();
    }
    this.invalidate();
  }

  private onPointerUp = (e: PointerEvent) => {
    this.dragging = false;
    this.priceDragging = false;
    if (this.manager.canvas.hasPointerCapture(e.pointerId)) {
      this.manager.canvas.releasePointerCapture(e.pointerId);
    }
  };

  private onPointerLeave = () => {
    this.crosshair.clear();
    this.invalidate();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const { x } = this.toLocal(e);
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      const { y } = this.toLocal(e);
      const pane = this.paneAt(y);
      const { min, max } = pane.priceScale.range;
      const mid = (min + max) / 2;
      const half = ((max - min) / 2) * factor;
      pane.priceScale.autoScale(mid - half, mid + half);
    } else {
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      this.viewport.zoomAt(x, factor);
    }
    this.invalidate();
  };

  private bindInput(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private unbindInput(canvas: HTMLCanvasElement) {
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    canvas.removeEventListener('wheel', this.onWheel);
  }

  // ---------- 绘制 ----------

  private layout(): void {
    const chartH = this.manager.height - AXIS_HEIGHT;
    const total = this.panes.reduce((s, p) => s + p.heightRatio, 0);
    let y = 0;
    for (const pane of this.panes) {
      pane.height = (chartH * pane.heightRatio) / total - PANE_GAP;
      pane.y = y;
      y += pane.height + PANE_GAP;
      pane.priceScale.setSize(pane.height);
    }
  }

  private visibleRange(): { from: number; to: number } {
    const count = this.displaySeries.length;
    const from = Math.max(0, Math.floor(this.viewport.first));
    const to = Math.min(count - 1, from + Math.ceil((this.manager.width - AXIS_WIDTH) / this.viewport.spacing));
    return { from, to };
  }

  /** 指标计算用的只读 bar 数组（零拷贝） */
  private barsArray(): readonly Bar[] {
    return this.displaySeries.raw();
  }

  private draw(): void {
    const t0 = performance.now();
    const ctx = this.manager.context;
    const w = this.manager.width;
    const h = this.manager.height;

    this.manager.beginFrame();
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, w, h);

    if (this.displaySeries.length === 0) {
      this.lastFrameMs = performance.now() - t0;
      return;
    }
    this.layout();

    const { from, to } = this.visibleRange();
    if (to < from) {
      this.lastFrameMs = performance.now() - t0;
      return;
    }

    for (const pane of this.panes) {
      const geo: DrawGeometry = { chartW: w - AXIS_WIDTH, chartH: pane.height };
      ctx.save();
      ctx.translate(0, pane.y);

      if (pane.kind === 'volume') {
        this.autoscaleVolume(pane, from, to);
        drawGrid(ctx, this.viewport, pane.priceScale, geo);
        drawVolume(ctx, this.displaySeries, from, to, this.viewport, pane.priceScale, geo);
      } else if (pane.kind === 'indicator') {
        this.autoscaleIndicators(pane, from, to);
        drawGrid(ctx, this.viewport, pane.priceScale, geo);
        for (const inst of pane.indicators) {
          drawIndicator(ctx, inst, this.barsArray(), from, to, this.viewport, pane.priceScale, geo);
        }
      } else {
        this.autoscalePrice(pane, from, to);
        drawGrid(ctx, this.viewport, pane.priceScale, geo);
        this.drawPriceSeries(ctx, pane, geo, from, to);
        // 主图叠加指标
        for (const inst of pane.indicators) {
          drawIndicator(ctx, inst, this.barsArray(), from, to, this.viewport, pane.priceScale, geo);
        }
      }

      // 每面板价格轴
      if (pane.kind === 'price') {
        drawPriceAxis(ctx, pane.priceScale, this.legend.decimals, geo);
      } else {
        ctx.fillStyle = theme.background;
        ctx.fillRect(geo.chartW, 0, AXIS_WIDTH, geo.chartH);
        ctx.strokeStyle = theme.axisLine;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(geo.chartW + 0.5, 0);
        ctx.lineTo(geo.chartW + 0.5, geo.chartH);
        ctx.stroke();
      }

      ctx.restore();
    }

    // 共享时间轴 + 边框 + 十字光标（全画布坐标）
    const mainGeo: DrawGeometry = { chartW: w - AXIS_WIDTH, chartH: h - AXIS_HEIGHT };
    drawTimeAxis(ctx, this.displaySeries, this.viewport, mainGeo);
    drawBorders(ctx, mainGeo);

    const hoveredPane = this.panes.find((p) => p.id === this.hoveredPaneId) ?? this.panes[0];
    const hoveredBar = this.crosshair.bar(this.displaySeries);
    // 主图叠加指标在悬停 bar 上的值（图例展示）
    const legendIndicators: Array<{ name: string; values: Array<{ label: string; value: number }> }> = [];
    const mainPane = this.panes[0];
    const legendIndex = this.crosshair.visible && hoveredBar ? this.crosshair.barIndex : this.displaySeries.length - 1;
    if (mainPane.indicators.length > 0 && legendIndex >= 0) {
      const bars = this.barsArray();
      for (const inst of mainPane.indicators) {
        legendIndicators.push({ name: inst.name, values: indicatorValuesAt(inst, bars, Math.max(0, legendIndex - 50), legendIndex) });
      }
    }
    drawCrosshair(
      ctx,
      this.crosshair,
      hoveredBar,
      this.displaySeries.last,
      this.viewport,
      hoveredPane.priceScale,
      mainGeo,
      this.legend,
      hoveredPane.y,
      hoveredPane.height,
      legendIndicators,
    );

    this.lastFrameMs = performance.now() - t0;
  }

  private autoscalePrice(pane: PaneState, from: number, to: number): void {
    let low = Infinity;
    let high = -Infinity;
    for (let i = from; i <= to; i++) {
      const bar = this.displaySeries.barAt(i)!;
      if (bar.low < low) low = bar.low;
      if (bar.high > high) high = bar.high;
    }
    // 叠加指标参与主图价格域
    const bars = this.barsArray();
    for (const inst of pane.indicators) {
      const r = indicatorRange(inst, bars, from, to);
      if (r.low < low) low = r.low;
      if (r.high > high) high = r.high;
    }
    if (low === Infinity) return;
    pane.priceScale.autoScale(low, high);
    pane.priceScale.setLogMode(this.logScale);
  }

  private autoscaleIndicators(pane: PaneState, from: number, to: number): void {
    let low = Infinity;
    let high = -Infinity;
    const bars = this.barsArray();
    for (const inst of pane.indicators) {
      const r = indicatorRange(inst, bars, from, to);
      if (r.low < low) low = r.low;
      if (r.high > high) high = r.high;
    }
    if (low === Infinity) return;
    // 含零轴（histogram 需要）
    pane.priceScale.autoScale(Math.min(low, 0), Math.max(high, 0));
  }

  private autoscaleVolume(pane: PaneState, from: number, to: number): void {
    let max = 0;
    for (let i = from; i <= to; i++) {
      const v = this.displaySeries.barAt(i)!.volume;
      if (v > max) max = v;
    }
    pane.priceScale.autoScale(0, max * 1.1 || 1);
  }

  private drawPriceSeries(
    ctx: CanvasRenderingContext2D,
    pane: PaneState,
    geo: DrawGeometry,
    from: number,
    to: number,
  ): void {
    // 面板局部坐标：绘制内容已通过 translate 偏移
    const vs = this.viewport;
    const ps = pane.priceScale;
    switch (this.chartType) {
      case 'ohlc':
        drawOhlc(ctx, this.displaySeries, from, to, vs, ps, geo);
        break;
      case 'line':
        drawLine(ctx, this.displaySeries, from, to, vs, ps, geo);
        break;
      case 'area':
        drawArea(ctx, this.displaySeries, from, to, vs, ps, geo);
        break;
      case 'baseline': {
        let low = Infinity;
        let high = -Infinity;
        for (let i = from; i <= to; i++) {
          const c = this.displaySeries.barAt(i)!.close;
          if (c < low) low = c;
          if (c > high) high = c;
        }
        drawBaseline(ctx, this.displaySeries, from, to, vs, ps, geo, (low + high) / 2);
        break;
      }
      default:
        // candles / hollow / heikin-ashi / renko / kagi / line-break / pnf / range
        drawCandles(ctx, this.displaySeries, from, to, vs, ps, geo);
    }
  }
}
