import type { BarSeries } from '@/data/BarSeries';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import { theme } from '../theme';

export interface DrawGeometry {
  chartW: number;
  chartH: number;
}

/**
 * 蜡烛渲染（含 LOD）：
 * - spacing >= 4px：标准蜡烛（实体 + 影线）
 * - spacing < 4px：细线模式，每像素列聚合 high/low，单次 path 描边
 */
export function drawCandles(
  ctx: CanvasRenderingContext2D,
  series: BarSeries,
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
): void {
  if (to < from) return;
  const spacing = viewport.spacing;
  const thin = spacing < 4;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.chartW, geo.chartH);
  ctx.clip();

  if (thin) {
    drawThinBars(ctx, series, from, to, viewport, priceScale, geo);
  } else {
    const bodyW = Math.max(1, Math.min(spacing * 0.7, 30));
    drawFullCandles(ctx, series, from, to, viewport, priceScale, geo, bodyW);
  }
  ctx.restore();
}

function drawThinBars(
  ctx: CanvasRenderingContext2D,
  series: BarSeries,
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
): void {
  // 按像素列聚合：一列内取最低 low 与最高 high
  const columns = new Map<number, { low: number; high: number; up: boolean }>();
  for (let i = from; i <= to; i++) {
    const bar = series.barAt(i)!;
    const x = Math.round(viewport.indexToX(i));
    if (x < 0 || x > geo.chartW) continue;
    const col = columns.get(x);
    if (!col) {
      columns.set(x, { low: bar.low, high: bar.high, up: bar.close >= bar.open });
    } else {
      if (bar.low < col.low) col.low = bar.low;
      if (bar.high > col.high) col.high = bar.high;
    }
  }
  // 每个像素列一次 moveTo/lineTo，最后单次 stroke
  ctx.lineWidth = 1;
  for (const [x, col] of columns) {
    ctx.strokeStyle = col.up ? theme.up : theme.down;
    ctx.beginPath();
    const px = x + 0.5;
    ctx.moveTo(px, priceScale.priceToY(col.high));
    ctx.lineTo(px, priceScale.priceToY(col.low));
    ctx.stroke();
  }
}

function drawFullCandles(
  ctx: CanvasRenderingContext2D,
  series: BarSeries,
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
  bodyW: number,
): void {
  // 影线批量单次描边
  ctx.lineWidth = 1;
  for (const pass of [0, 1]) {
    ctx.beginPath();
    for (let i = from; i <= to; i++) {
      const bar = series.barAt(i)!;
      const xCenter = viewport.indexToX(i);
      const x = xCenter - bodyW / 2;
      if (x > geo.chartW || x + bodyW < 0) continue;
      const up = bar.close >= bar.open;
      if ((pass === 0) === !up) continue; // pass0 画阳线，pass1 画阴线
      const color = up ? theme.up : theme.down;
      ctx.strokeStyle = color;
      const xc = Math.round(xCenter) + 0.5;
      ctx.moveTo(xc, priceScale.priceToY(bar.high));
      ctx.lineTo(xc, priceScale.priceToY(bar.low));
    }
    ctx.stroke();

    for (let i = from; i <= to; i++) {
      const bar = series.barAt(i)!;
      const xCenter = viewport.indexToX(i);
      const x = xCenter - bodyW / 2;
      if (x > geo.chartW || x + bodyW < 0) continue;
      const up = bar.close >= bar.open;
      if ((pass === 0) === !up) continue;
      const color = up ? theme.up : theme.down;
      const yOpen = priceScale.priceToY(bar.open);
      const yClose = priceScale.priceToY(bar.close);
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
  }
}
