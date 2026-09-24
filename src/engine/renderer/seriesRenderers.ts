import type { BarSeries } from '@/data/BarSeries';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import { theme } from '../theme';
import type { DrawGeometry } from './drawSeries';

/** 竹线图（OHLC bar）：左横=开盘，右横=收盘，竖线=高低 */
export function drawOhlc(
  ctx: CanvasRenderingContext2D,
  series: BarSeries,
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
): void {
  const spacing = viewport.spacing;
  const tickW = Math.max(1, Math.min(spacing * 0.25, 8));
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.chartW, geo.chartH);
  ctx.clip();
  ctx.lineWidth = 1;
  for (let i = from; i <= to; i++) {
    const bar = series.barAt(i)!;
    const xc = viewport.indexToX(i);
    if (xc < -10 || xc > geo.chartW + 10) continue;
    const up = bar.close >= bar.open;
    const color = up ? theme.up : theme.down;
    const yHigh = priceScale.priceToY(bar.high);
    const yLow = priceScale.priceToY(bar.low);
    const yOpen = priceScale.priceToY(bar.open);
    const yClose = priceScale.priceToY(bar.close);
    ctx.strokeStyle = color;
    ctx.beginPath();
    const x = Math.round(xc) + 0.5;
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.moveTo(x - tickW, Math.round(yOpen) + 0.5);
    ctx.lineTo(x, Math.round(yOpen) + 0.5);
    ctx.moveTo(x, Math.round(yClose) + 0.5);
    ctx.lineTo(x + tickW, Math.round(yClose) + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

/** 线形图：收盘价折线 */
export function drawLine(
  ctx: CanvasRenderingContext2D,
  series: BarSeries,
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
  color = '#2962ff',
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.chartW, geo.chartH);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let started = false;
  for (let i = from; i <= to; i++) {
    const bar = series.barAt(i)!;
    const x = viewport.indexToX(i);
    if (x < -10 || x > geo.chartW + 10) continue;
    const y = priceScale.priceToY(bar.close);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** 面积图：收盘价折线 + 向下渐变填充 */
export function drawArea(
  ctx: CanvasRenderingContext2D,
  series: BarSeries,
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
  color = '#2962ff',
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.chartW, geo.chartH);
  ctx.clip();
  ctx.beginPath();
  let started = false;
  let firstX = 0;
  let lastX = 0;
  for (let i = from; i <= to; i++) {
    const bar = series.barAt(i)!;
    const x = viewport.indexToX(i);
    if (x < -10 || x > geo.chartW + 10) continue;
    const y = priceScale.priceToY(bar.close);
    if (!started) {
      ctx.moveTo(x, y);
      firstX = x;
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
    lastX = x;
  }
  if (started) {
    const gradient = ctx.createLinearGradient(0, 0, 0, geo.chartH);
    gradient.addColorStop(0, color + '55');
    gradient.addColorStop(1, color + '00');
    ctx.lineTo(lastX, geo.chartH);
    ctx.lineTo(firstX, geo.chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    // 重新描边折线
    ctx.beginPath();
    started = false;
    for (let i = from; i <= to; i++) {
      const bar = series.barAt(i)!;
      const x = viewport.indexToX(i);
      if (x < -10 || x > geo.chartW + 10) continue;
      const y = priceScale.priceToY(bar.close);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

/** 基线图：收盘价相对基线（可见范围中点）着色 */
export function drawBaseline(
  ctx: CanvasRenderingContext2D,
  series: BarSeries,
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
  basePrice: number,
): void {
  drawLine(ctx, series, from, to, viewport, priceScale, geo, theme.up);
  // 基线上方用涨色、下方用跌色：分两段绘制
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.chartW, geo.chartH);
  ctx.clip();
  ctx.lineWidth = 2;
  for (let i = from; i < to; i++) {
    const b0 = series.barAt(i)!;
    const b1 = series.barAt(i + 1)!;
    const x0 = viewport.indexToX(i);
    const x1 = viewport.indexToX(i + 1);
    if (x1 < -10 || x0 > geo.chartW + 10) continue;
    const y0 = priceScale.priceToY(b0.close);
    const y1 = priceScale.priceToY(b1.close);
    ctx.strokeStyle = b1.close >= basePrice ? theme.up : theme.down;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  // 基线参考线
  const yb = priceScale.priceToY(basePrice);
  if (yb >= 0 && yb <= geo.chartH) {
    ctx.strokeStyle = theme.axisText;
    ctx.setLineDash([2, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(yb) + 0.5);
    ctx.lineTo(geo.chartW, Math.round(yb) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}
