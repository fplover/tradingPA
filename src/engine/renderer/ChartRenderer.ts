import { CanvasManager } from '../canvas/CanvasManager';
import { Viewport } from '../viewport/Viewport';
import { PriceScale } from '../scale/PriceScale';
import { Crosshair } from '../crosshair/Crosshair';
import { BarSeries } from '@/data/BarSeries';
import { theme } from '../theme';
import type { Bar } from '@/types/market';
import { drawCandles, type DrawGeometry } from './drawSeries';
import { drawGrid, drawPriceAxis, drawTimeAxis, drawBorders } from './drawAxes';
import { drawCrosshair, type LegendInfo } from './drawCrosshair';

const AXIS_WIDTH = 64;
const AXIS_HEIGHT = 24;

/**
 * 图表渲染器：拥有画布/视口/价格轴/数据/十字光标，rAF 合帧重绘。
 * 输入交互只改状态 + invalidate，实际绘制发生在每帧至多一次。
 */
export class ChartRenderer {
  private manager: CanvasManager;
  private viewport: Viewport;
  private priceScale = new PriceScale();
  private series = new BarSeries();
  private crosshair = new Crosshair();
  private legend: LegendInfo;
  private rafId = 0;
  private dirty = true;
  private disposed = false;

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
    this.series.replace(bars);
    this.viewport.setBarCount(bars.length);
    if (bars.length > 0) this.viewport.scrollToRealtime();
    this.manager.onResize(() => {
      this.viewport.setSize(this.manager.width - AXIS_WIDTH);
      this.priceScale.setSize(this.manager.height - AXIS_HEIGHT);
      this.invalidate();
    });
    this.priceScale.setSize(this.manager.height - AXIS_HEIGHT);
    this.bindInput(canvas);
  }

  setLegend(legend: Partial<LegendInfo>): void {
    this.legend = { ...this.legend, ...legend };
    this.invalidate();
  }

  setData(bars: Bar[]): void {
    this.series.replace(bars);
    this.viewport.setBarCount(bars.length);
    this.viewport.scrollToRealtime();
    this.crosshair.clear();
    this.invalidate();
  }

  /** 实时推送单根 K 线（更新时间戳的最后一根或追加） */
  updateBar(bar: Bar): void {
    this.series.update(bar);
    this.invalidate();
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

  /** 事件坐标 → 画布 CSS 像素坐标（不依赖 offsetX/Y，合成事件下也可靠） */
  private toLocal(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.manager.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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
      const { min, max } = this.priceScale.range;
      const span = max - min;
      const shift = (dy / Math.max(1, this.manager.height - AXIS_HEIGHT)) * span;
      this.priceScale.autoScale(min + shift, max + shift);
      this.invalidate();
    } else if (this.priceDragging) {
      const dy = y - this.priceYAtDragStart;
      const { min, max } = this.priceScale.range;
      const span = max - min;
      const shift = -(dy / Math.max(1, this.manager.height - AXIS_HEIGHT)) * span;
      this.priceScale.autoScale(min + shift, max + shift);
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
    const idx = Math.round(this.viewport.xToIndex(x));
    const bar = this.series.barAt(idx);
    if (bar) {
      this.crosshair.set(x, y, idx, bar.time, this.priceScale.yToPrice(y));
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
      const { min, max } = this.priceScale.range;
      const mid = (min + max) / 2;
      const half = ((max - min) / 2) * factor;
      this.priceScale.autoScale(mid - half, mid + half);
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

  private draw(): void {
    const t0 = performance.now();
    const ctx = this.manager.context;
    const w = this.manager.width;
    const h = this.manager.height;
    const geo: DrawGeometry = { chartW: w - AXIS_WIDTH, chartH: h - AXIS_HEIGHT };

    this.manager.beginFrame();
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, w, h);

    const count = this.series.length;
    if (count === 0) {
      this.lastFrameMs = performance.now() - t0;
      return;
    }

    const from = Math.max(0, Math.floor(this.viewport.first));
    const to = Math.min(count - 1, from + Math.ceil(geo.chartW / this.viewport.spacing));
    if (to < from) {
      this.lastFrameMs = performance.now() - t0;
      return;
    }

    // 价格自动适配（基于可见范围）
    let low = Infinity;
    let high = -Infinity;
    for (let i = from; i <= to; i++) {
      const bar = this.series.barAt(i)!;
      if (bar.low < low) low = bar.low;
      if (bar.high > high) high = bar.high;
    }
    this.priceScale.autoScale(low, high);

    drawGrid(ctx, this.viewport, this.priceScale, geo);
    drawCandles(ctx, this.series, from, to, this.viewport, this.priceScale, geo);
    drawPriceAxis(ctx, this.priceScale, this.legend.decimals, geo);
    drawTimeAxis(ctx, this.series, this.viewport, geo);

    const hoveredBar = this.crosshair.bar(this.series);
    drawCrosshair(
      ctx,
      this.crosshair,
      hoveredBar,
      this.series.last,
      this.viewport,
      this.priceScale,
      geo,
      this.legend,
    );
    drawBorders(ctx, geo);

    this.lastFrameMs = performance.now() - t0;
  }
}
