import { CanvasManager } from '../canvas/CanvasManager';
import { Viewport } from '../viewport/Viewport';
import { PriceScale } from '../scale/PriceScale';
import { theme } from '../theme';
import type { Bar } from '@/types/market';

const AXIS_WIDTH = 64; // 右侧价格轴宽度
const AXIS_HEIGHT = 24; // 底部时间轴高度

/**
 * 图表渲染器（M0）：网格 + 蜡烛 + 价格/时间轴 + 拖拽平移 + 滚轮缩放。
 * rAF 合帧：交互只置 dirty 标志，每帧最多重绘一次。
 */
export class ChartRenderer {
  private manager: CanvasManager;
  private viewport: Viewport;
  private priceScale = new PriceScale();
  private bars: Bar[] = [];
  private rafId = 0;
  private dirty = true;
  private disposed = false;

  // 拖拽状态
  private dragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private priceDragging = false;
  private priceYAtDragStart = 0;

  constructor(canvas: HTMLCanvasElement, bars: Bar[] = []) {
    this.manager = new CanvasManager(canvas);
    this.viewport = new Viewport(this.manager.width - AXIS_WIDTH);
    this.bars = bars;
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

  setData(bars: Bar[]): void {
    this.bars = bars;
    this.viewport.setBarCount(bars.length);
    this.viewport.scrollToRealtime();
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
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.dragging) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.viewport.panByBars(-dx / this.viewport.spacing);
      // 垂直拖拽：平移价格范围
      const { min, max } = this.priceScale.range;
      const span = max - min;
      const shift = (dy / Math.max(1, this.manager.height - AXIS_HEIGHT)) * span;
      this.priceScale.autoScale(min + shift, max + shift);
      this.invalidate();
    } else if (this.priceDragging) {
      const { y } = this.toLocal(e);
      const dy = y - this.priceYAtDragStart;
      const { min, max } = this.priceScale.range;
      const span = max - min;
      const shift = -(dy / Math.max(1, this.manager.height - AXIS_HEIGHT)) * span;
      this.priceScale.autoScale(min + shift, max + shift);
      this.invalidate();
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    this.dragging = false;
    this.priceDragging = false;
    if (this.manager.canvas.hasPointerCapture(e.pointerId)) {
      this.manager.canvas.releasePointerCapture(e.pointerId);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const { x } = this.toLocal(e);
    if (e.ctrlKey || e.metaKey) {
      // ctrl+wheel：缩放价格轴（拉伸价格范围）
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
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private unbindInput(canvas: HTMLCanvasElement) {
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    canvas.removeEventListener('wheel', this.onWheel);
  }

  // ---------- 绘制 ----------

  private draw(): void {
    const ctx = this.manager.context;
    const w = this.manager.width;
    const h = this.manager.height;
    const chartW = w - AXIS_WIDTH;
    const chartH = h - AXIS_HEIGHT;

    this.manager.beginFrame();
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, w, h);

    if (this.bars.length === 0) return;

    // 可见范围
    const { from, to } = this.viewportRange();
    if (to < from) return;
    const visible = this.bars.slice(from, to + 1);
    if (visible.length === 0) return;

    // 价格自动适配
    let low = Infinity;
    let high = -Infinity;
    for (const b of visible) {
      if (b.low < low) low = b.low;
      if (b.high > high) high = b.high;
    }
    this.priceScale.autoScale(low, high);

    this.drawGrid(ctx, chartW, chartH, from, to);
    this.drawCandles(ctx, chartW, chartH, from, to);
    this.drawPriceAxis(ctx, chartW, chartH);
    this.drawTimeAxis(ctx, chartW, chartH, from, to);
    this.drawBorders(ctx, chartW, chartH);
  }

  private viewportRange(): { from: number; to: number } {
    const spacing = this.viewport.spacing;
    const first = Math.floor(this.viewport.first);
    const visibleCount = Math.ceil((this.manager.width - AXIS_WIDTH) / spacing);
    const to = Math.min(this.bars.length - 1, first + visibleCount);
    return { from: Math.max(0, first), to };
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    chartW: number,
    chartH: number,
    from: number,
    to: number,
  ): void {
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const price of this.priceScale.ticks(6)) {
      const y = Math.round(this.priceScale.priceToY(price)) + 0.5;
      if (y < 0 || y > chartH) continue;
      ctx.moveTo(0, y);
      ctx.lineTo(chartW, y);
    }
    // 垂直网格：约每 80px 一根
    const spacing = this.viewport.spacing;
    const step = Math.max(1, Math.ceil(80 / spacing));
    for (let i = from; i <= to; i += step) {
      const x = Math.round(this.viewport.indexToX(i)) + 0.5;
      if (x < 0 || x > chartW) continue;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, chartH);
    }
    ctx.stroke();
  }

  private drawCandles(
    ctx: CanvasRenderingContext2D,
    chartW: number,
    chartH: number,
    from: number,
    to: number,
  ): void {
    const spacing = this.viewport.spacing;
    const bodyW = Math.max(1, Math.min(spacing * 0.7, 30));
    const wickW = 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, chartW, chartH);
    ctx.clip();

    for (let i = from; i <= to; i++) {
      const bar = this.bars[i];
      const xCenter = this.viewport.indexToX(i);
      const x = xCenter - bodyW / 2;
      if (x > chartW || x + bodyW < 0) continue;
      const up = bar.close >= bar.open;
      const color = up ? theme.up : theme.down;
      const wickColor = up ? theme.upWick : theme.downWick;

      const yHigh = this.priceScale.priceToY(bar.high);
      const yLow = this.priceScale.priceToY(bar.low);
      const yOpen = this.priceScale.priceToY(bar.open);
      const yClose = this.priceScale.priceToY(bar.close);

      // 影线
      ctx.strokeStyle = wickColor;
      ctx.lineWidth = wickW;
      ctx.beginPath();
      const xc = Math.round(xCenter) + 0.5;
      ctx.moveTo(xc, yHigh);
      ctx.lineTo(xc, yLow);
      ctx.stroke();

      // 实体
      const top = Math.min(yOpen, yClose);
      const bottom = Math.max(yOpen, yClose);
      const bodyH = Math.max(1, bottom - top);
      if (up) {
        ctx.fillStyle = theme.background;
        ctx.fillRect(x, top, bodyW, bodyH);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(x) + 0.5, Math.round(top) + 0.5, bodyW - 1, bodyH - 1);
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(x, top, bodyW, bodyH);
      }
    }
    ctx.restore();
  }

  private drawPriceAxis(
    ctx: CanvasRenderingContext2D,
    chartW: number,
    chartH: number,
  ): void {
    ctx.fillStyle = theme.background;
    ctx.fillRect(chartW, 0, AXIS_WIDTH, chartH);
    ctx.strokeStyle = theme.axisLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartW + 0.5, 0);
    ctx.lineTo(chartW + 0.5, chartH);
    ctx.stroke();

    ctx.fillStyle = theme.axisText;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const decimals = PriceScale.decimalsFor(this.bars[this.bars.length - 1].close);
    for (const price of this.priceScale.ticks(6)) {
      const y = this.priceScale.priceToY(price);
      if (y < 10 || y > chartH - 2) continue;
      ctx.fillText(price.toFixed(decimals), chartW + 6, y);
    }
  }

  private drawTimeAxis(
    ctx: CanvasRenderingContext2D,
    chartW: number,
    chartH: number,
    from: number,
    to: number,
  ): void {
    const top = chartH;
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, top, chartW, AXIS_HEIGHT);
    ctx.strokeStyle = theme.axisLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, top + 0.5);
    ctx.lineTo(chartW, top + 0.5);
    ctx.stroke();

    ctx.fillStyle = theme.axisText;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const spacing = this.viewport.spacing;
    const step = Math.max(1, Math.ceil(80 / spacing));
    for (let i = from; i <= to; i += step) {
      const bar = this.bars[i];
      const x = this.viewport.indexToX(i);
      if (x < 30 || x > chartW - 30) continue;
      ctx.fillText(formatTime(bar.time, spacing), x, top + AXIS_HEIGHT / 2);
    }
  }

  private drawBorders(
    ctx: CanvasRenderingContext2D,
    chartW: number,
    chartH: number,
  ): void {
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, chartW - 1, chartH - 1);
  }
}

function formatTime(time: number, spacing: number): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (spacing >= 300) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }
  if (spacing >= 60) {
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
