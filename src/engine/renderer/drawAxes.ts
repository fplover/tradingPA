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
  // 网格线统一为 1 物理像素（DPR 自适应），比 1 CSS 像素更细且边缘清晰
  const dpr = window.devicePixelRatio || 1;
  const align = (v: number) => (Math.round(v * dpr) + 0.5) / dpr;
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1 / dpr;
  ctx.beginPath();
  for (const price of priceScale.ticks(6)) {
    const y = align(priceScale.priceToY(price));
    if (y < 0 || y > geo.chartH) continue;
    ctx.moveTo(0, y);
    ctx.lineTo(geo.chartW, y);
  }
  // 垂直网格线：以 step 倍数对齐的 index 步进，覆盖整个画布宽度
  // （含右侧无 K 线的空白区：rightOffset 间隙 / 拖拽越界空白 / 回放未来区）
  const spacing = viewport.spacing;
  const step = Math.max(1, Math.ceil(80 / spacing));
  const startIdx = Math.floor(viewport.first / step) * step;
  const endIdx = viewport.first + geo.chartW / spacing;
  for (let i = startIdx; i <= endIdx; i += step) {
    const x = align(viewport.indexToX(i));
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
  // 与垂直网格线同一锚点（step 的倍数），标签才落在网格线上
  const startIdx = Math.floor(viewport.first / step) * step;
  const endIdx = viewport.first + geo.chartW / spacing;
  const last = series.length - 1;
  for (let i = startIdx; i <= endIdx; i += step) {
    if (i < 0 || i > last) continue; // 仅标注有 K 线的位置（空白区不标）
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
