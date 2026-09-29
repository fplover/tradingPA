import type { BarSeries } from '@/data/BarSeries';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import { theme } from '../theme';
import type { DrawGeometry } from './drawSeries';
import { seriesLineColor } from './seriesTheme';

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

/** 阶梯线（Step line）：收盘价阶梯推进——先水平保持前值，后垂直跳变到本 bar */
export function drawStepLine(
  ctx: CanvasRenderingContext2D,
  series: BarSeries,
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
  color?: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.chartW, geo.chartH);
  ctx.clip();
  ctx.strokeStyle = color ?? seriesLineColor();
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let started = false;
  let prevY = 0;
  for (let i = from; i <= to; i++) {
    const bar = series.barAt(i)!;
    const x = viewport.indexToX(i);
    if (x < -10 || x > geo.chartW + 10) continue;
    const y = priceScale.priceToY(bar.close);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, prevY); // 先水平：前值推进到本 bar 时刻
      ctx.lineTo(x, y); // 后垂直：跳变到本 bar 收盘
    }
    prevY = y;
  }
  ctx.stroke();
  ctx.restore();
}

/** 带标记线形（Line with markers）：收盘价折线 + 每 bar 收盘点小圆标记 */
export function drawLineMarkers(
  ctx: CanvasRenderingContext2D,
  series: BarSeries,
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
  color?: string,
): void {
  const lineColor = color ?? seriesLineColor();
  // 折线复用 drawLine：与线形图完全一致的几何与线宽
  drawLine(ctx, series, from, to, viewport, priceScale, geo, lineColor);
  // 过密（间距 < 3px）时退化为纯线形，避免标记糊成一片
  if (viewport.spacing < 3) return;
  const r = Math.max(1.5, Math.min(viewport.spacing * 0.22, 3.5));
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.chartW, geo.chartH);
  ctx.clip();
  ctx.fillStyle = lineColor;
  for (let i = from; i <= to; i++) {
    const bar = series.barAt(i)!;
    const x = viewport.indexToX(i);
    if (x < -10 || x > geo.chartW + 10) continue;
    const y = priceScale.priceToY(bar.close);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
