import type { Crosshair } from '../crosshair/Crosshair';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import { theme, TV_FONT } from '../theme';
import type { DrawGeometry } from './drawSeries';
import { formatTime } from './drawAxes';
import type { LegendInfo } from './legendTypes';

/** 十字光标：虚线 + 价格轴标签 + 时间轴标签 */
export function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  crosshair: Crosshair,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
  legend: LegendInfo,
  paneY = 0,
  paneHeight = geo.chartH,
): void {
  if (!crosshair.visible) return;

  // 虚线（水平限悬停面板内，垂直吸附 bar 中心并贯穿全高）
  const snapX = viewport.indexToX(crosshair.barIndex);
  ctx.strokeStyle = theme.crosshair;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, Math.round(crosshair.y) + 0.5);
  ctx.lineTo(geo.chartW, Math.round(crosshair.y) + 0.5);
  ctx.moveTo(Math.round(snapX) + 0.5, paneY);
  ctx.lineTo(Math.round(snapX) + 0.5, paneY + paneHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // 价格轴标签（价格按悬停面板的相对坐标换算，标签钳制在该面板内）
  const price = priceScale.yToPrice(crosshair.y - paneY);
  drawAxisLabel(ctx, geo.chartW + 1, crosshair.y, priceScale.toLabel(price, legend.decimals), 'price', {
    minY: paneY,
    maxY: paneY + paneHeight - 18,
  });

  // 时间轴标签（水平 clamp 在图表宽度内）
  const time = crosshair.barIndex >= 0 ? crosshair.time : 0;
  if (time > 0) {
    drawAxisLabel(ctx, snapX, geo.chartH + 1, formatTime(time, viewport.spacing), 'time', {
      minX: 0,
      maxX: geo.chartW,
    });
  }
}

function drawAxisLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  kind: 'price' | 'time',
  bounds?: { minY?: number; maxY?: number; minX?: number; maxX?: number },
): void {
  ctx.font = `11px ${TV_FONT}`;
  const w = ctx.measureText(text).width + 12;
  const h = 18;
  let bx: number;
  let by: number;
  if (kind === 'price') {
    // 价格标签贴价格轴左缘，垂直方向钳制在悬停面板内（TV 同行为）
    bx = x + 2;
    by = y - h / 2;
    if (bounds?.minY !== undefined) by = Math.max(by, bounds.minY);
    if (bounds?.maxY !== undefined) by = Math.min(by, bounds.maxY);
  } else {
    // 时间标签水平居中于光标，左右越界时 clamp 在时间轴内（maxX 指标签右缘上限）
    bx = x - w / 2;
    by = y + 3;
    if (bounds?.minX !== undefined) bx = Math.max(bx, bounds.minX);
    if (bounds?.maxX !== undefined) bx = Math.min(bx, bounds.maxX - w);
  }
  ctx.fillStyle = theme.tooltipBg;
  ctx.fillRect(bx, by, w, h);
  ctx.fillStyle = theme.axisLabelText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + w / 2, by + h / 2);
}
