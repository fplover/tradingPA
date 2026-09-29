import type { BarSeries } from '@/data/BarSeries';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import type { DrawGeometry } from './drawSeries';
import { seriesLineColor } from './seriesTheme';

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

/** HLC 面积（HLC area）：按 HLC 中值（典型价 (h+l+c)/3）绘制的面积图 */
export function drawHlcArea(
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
    const y = priceScale.priceToY((bar.high + bar.low + bar.close) / 3);
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
    gradient.addColorStop(0, lineColor + '55');
    gradient.addColorStop(1, lineColor + '00');
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
      const y = priceScale.priceToY((bar.high + bar.low + bar.close) / 3);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}
