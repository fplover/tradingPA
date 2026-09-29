import type { BarSeries } from '@/data/BarSeries';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import { theme } from '../theme';
import { drawCandles, type DrawGeometry } from './drawSeries';

/** 柱状图（Columns）：每 bar 一根开收实体竖柱（无影线），涨跌着色 */
export function drawColumns(
  ctx: CanvasRenderingContext2D,
  series: BarSeries,
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
): void {
  const spacing = viewport.spacing;
  const bodyW = Math.max(1, Math.min(spacing * 0.7, 30));
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.chartW, geo.chartH);
  ctx.clip();
  for (let i = from; i <= to; i++) {
    const bar = series.barAt(i)!;
    const xc = viewport.indexToX(i);
    if (xc < -10 || xc > geo.chartW + 10) continue;
    const up = bar.close >= bar.open;
    const yOpen = priceScale.priceToY(bar.open);
    const yClose = priceScale.priceToY(bar.close);
    const top = Math.min(yOpen, yClose);
    // 平盘（open === close）保留 1px 可见最小高度
    const bodyH = Math.max(1, Math.max(yOpen, yClose) - top);
    ctx.fillStyle = up ? theme.up : theme.down;
    ctx.fillRect(xc - bodyW / 2, top, bodyW, bodyH);
  }
  ctx.restore();
}

/**
 * 成交量蜡烛（Volume candles）：蜡烛宽度编码可见窗口内成交量占比（TV 同行为），
 * 颜色仍按涨跌语义；无有效成交量数据时降级为普通蜡烛（几何/颜色与 candles 一致）。
 */
export function drawVolumeCandles(
  ctx: CanvasRenderingContext2D,
  series: BarSeries,
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
): void {
  let maxVol = 0;
  for (let i = from; i <= to; i++) {
    const v = series.barAt(i)?.volume ?? 0;
    if (v > maxVol) maxVol = v;
  }
  if (!(maxVol > 0)) {
    // 数据源不存在成交量：降级普通蜡烛
    drawCandles(ctx, series, from, to, viewport, priceScale, geo);
    return;
  }
  const spacing = viewport.spacing;
  const baseW = Math.max(1, Math.min(spacing * 0.7, 30));
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.chartW, geo.chartH);
  ctx.clip();
  for (let i = from; i <= to; i++) {
    const bar = series.barAt(i)!;
    const xc = viewport.indexToX(i);
    if (xc < -10 || xc > geo.chartW + 10) continue;
    const up = bar.close >= bar.open;
    const color = up ? theme.up : theme.down;
    const bodyW = Math.max(1, baseW * (0.35 + 0.65 * (bar.volume / maxVol)));
    const x = xc - bodyW / 2;
    // 影线（高低竖线）
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(xc) + 0.5, priceScale.priceToY(bar.high));
    ctx.lineTo(Math.round(xc) + 0.5, priceScale.priceToY(bar.low));
    ctx.stroke();
    // 实体（开收之间）
    const yOpen = priceScale.priceToY(bar.open);
    const yClose = priceScale.priceToY(bar.close);
    const top = Math.min(yOpen, yClose);
    const bottom = Math.max(yOpen, yClose);
    const bodyH = Math.max(1, bottom - top);
    if (up) {
      ctx.fillStyle = theme.background;
      ctx.fillRect(x, top, bodyW, bodyH);
      ctx.strokeStyle = color;
      ctx.strokeRect(Math.round(x) + 0.5, Math.round(top) + 0.5, bodyW - 1, bodyH - 1);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(x, top, bodyW, bodyH);
    }
  }
  ctx.restore();
}
