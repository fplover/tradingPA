import type { BarSeries } from '@/data/BarSeries';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import { theme } from '../theme';
import type { DrawGeometry } from './drawSeries';

/** 竹线/高低图共用几何：高低竖线 + 左横=开盘 + 右横=收盘 */
function drawOhlcBars(
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
  drawOhlcBars(ctx, series, from, to, viewport, priceScale, geo);
}

/** 高低图（High-low）：与竹线图同几何——高低竖线 + 左开右收短 tick（TV 独立风格入口） */
export function drawHighLow(
  ctx: CanvasRenderingContext2D,
  series: BarSeries,
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
): void {
  drawOhlcBars(ctx, series, from, to, viewport, priceScale, geo);
}
