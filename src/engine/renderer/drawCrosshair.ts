import type { Bar } from '@/types/market';
import type { Crosshair } from '../crosshair/Crosshair';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import { theme } from '../theme';
import type { DrawGeometry } from './drawSeries';
import { formatTime } from './drawAxes';

export interface LegendInfo {
  symbol: string;
  interval: string;
  decimals: number;
}

/** 十字光标：虚线 + 价格轴标签 + 时间轴标签 + 左上角 OHLCV 图例 */
export function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  crosshair: Crosshair,
  hoveredBar: Bar | undefined,
  lastBar: Bar | undefined,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
  legend: LegendInfo,
): void {
  if (!crosshair.visible) return;

  // 虚线（水平吸附鼠标 y，垂直吸附 bar 中心）
  const snapX = viewport.indexToX(crosshair.barIndex);
  ctx.strokeStyle = theme.crosshair;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, Math.round(crosshair.y) + 0.5);
  ctx.lineTo(geo.chartW, Math.round(crosshair.y) + 0.5);
  ctx.moveTo(Math.round(snapX) + 0.5, 0);
  ctx.lineTo(Math.round(snapX) + 0.5, geo.chartH);
  ctx.stroke();
  ctx.setLineDash([]);

  // 价格轴标签
  const price = priceScale.yToPrice(crosshair.y);
  drawAxisLabel(ctx, geo.chartW + 1, crosshair.y, price.toFixed(legend.decimals), 'price');

  // 时间轴标签
  const time = crosshair.barIndex >= 0 ? crosshair.time : 0;
  if (time > 0) {
    drawAxisLabel(ctx, snapX, geo.chartH + 1, formatTime(time, viewport.spacing), 'time');
  }

  // 图例
  drawLegend(ctx, hoveredBar ?? lastBar, legend);
}

function drawAxisLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  kind: 'price' | 'time',
): void {
  ctx.font = '11px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 12;
  const h = 18;
  let bx = x - w / 2;
  let by = y - h / 2;
  if (kind === 'price') {
    bx = x + 2;
    by = Math.max(0, Math.min(by, 9999));
  } else {
    bx = Math.max(0, bx);
    by = y + 3;
  }
  ctx.fillStyle = '#2a2e39';
  ctx.fillRect(bx, by, w, h);
  ctx.fillStyle = '#d1d4dc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + w / 2, by + h / 2);
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  bar: Bar | undefined,
  legend: LegendInfo,
): void {
  if (!bar) return;
  const d = legend.decimals;
  const change = bar.open !== 0 ? ((bar.close - bar.open) / bar.open) * 100 : 0;
  const up = bar.close >= bar.open;
  const color = up ? theme.up : theme.down;

  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const title = `${legend.symbol} · ${legend.interval}`;
  ctx.fillStyle = '#d1d4dc';
  ctx.fillText(title, 8, 8);

  const fields: Array<[string, string, string]> = [
    ['开', bar.open.toFixed(d), '#d1d4dc'],
    ['高', bar.high.toFixed(d), theme.up],
    ['低', bar.low.toFixed(d), theme.down],
    ['收', bar.close.toFixed(d), color],
    ['', `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`, color],
    ['量', formatVolume(bar.volume), '#d1d4dc'],
  ];
  let x = 8;
  const y = 28;
  for (const [label, value, c] of fields) {
    if (label) {
      ctx.fillStyle = '#787b86';
      ctx.fillText(label, x, y);
      x += ctx.measureText(label).width + 4;
    }
    ctx.fillStyle = c;
    ctx.fillText(value, x, y);
    x += ctx.measureText(value).width + 10;
  }
}

function formatVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return v.toFixed(2);
}
