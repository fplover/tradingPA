import type { BarSeries } from '@/data/BarSeries';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import { theme } from '../theme';
import type { DrawGeometry } from './drawSeries';

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
): void {
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const price of priceScale.ticks(6)) {
    const y = Math.round(priceScale.priceToY(price)) + 0.5;
    if (y < 0 || y > geo.chartH) continue;
    ctx.moveTo(0, y);
    ctx.lineTo(geo.chartW, y);
  }
  const spacing = viewport.spacing;
  const step = Math.max(1, Math.ceil(80 / spacing));
  const count = viewport.barCount;
  const first = Math.max(0, Math.floor(viewport.first));
  for (let i = first; i < count; i += step) {
    const x = Math.round(viewport.indexToX(i)) + 0.5;
    if (x < 0 || x > geo.chartW) continue;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, geo.chartH);
  }
  ctx.stroke();
}

export function drawPriceAxis(
  ctx: CanvasRenderingContext2D,
  priceScale: PriceScale,
  decimals: number,
  geo: DrawGeometry,
): void {
  ctx.fillStyle = theme.background;
  ctx.fillRect(geo.chartW, 0, 64, geo.chartH);
  ctx.strokeStyle = theme.axisLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(geo.chartW + 0.5, 0);
  ctx.lineTo(geo.chartW + 0.5, geo.chartH);
  ctx.stroke();

  ctx.fillStyle = theme.axisText;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const price of priceScale.ticks(6)) {
    const y = priceScale.priceToY(price);
    if (y < 10 || y > geo.chartH - 2) continue;
    ctx.fillText(price.toFixed(decimals), geo.chartW + 6, y);
  }
}

export function drawTimeAxis(
  ctx: CanvasRenderingContext2D,
  series: BarSeries,
  viewport: Viewport,
  geo: DrawGeometry,
): void {
  const top = geo.chartH;
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, top, geo.chartW, 24);
  ctx.strokeStyle = theme.axisLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, top + 0.5);
  ctx.lineTo(geo.chartW, top + 0.5);
  ctx.stroke();

  ctx.fillStyle = theme.axisText;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const spacing = viewport.spacing;
  const step = Math.max(1, Math.ceil(80 / spacing));
  const from = Math.max(0, Math.floor(viewport.first));
  const to = Math.min(series.length - 1, from + Math.ceil(geo.chartW / spacing));
  for (let i = from; i <= to; i += step) {
    const bar = series.barAt(i)!;
    const x = viewport.indexToX(i);
    if (x < 30 || x > geo.chartW - 30) continue;
    ctx.fillText(formatTime(bar.time, spacing), x, top + 12);
  }
}

export function drawBorders(ctx: CanvasRenderingContext2D, geo: DrawGeometry): void {
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, geo.chartW - 1, geo.chartH - 1);
}

export function formatTime(time: number, spacing: number): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (spacing >= 300) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  if (spacing >= 60) return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
