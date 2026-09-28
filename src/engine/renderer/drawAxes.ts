import type { BarSeries } from '@/data/BarSeries';
import type { Bar } from '@/types/market';
import { formatCompact } from '@/data/format';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import { theme, TV_FONT } from '../theme';
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

/** 紧凑数字格式见 @/data/format（画布与 UI 共用） */

/** 价格轴文字距轴右缘的内缩（TV 规格） */
const AXIS_TEXT_INSET = 58;

export function drawPriceAxis(
  ctx: CanvasRenderingContext2D,
  priceScale: PriceScale,
  decimals: number,
  geo: DrawGeometry,
  compact = false,
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
  ctx.font = `11px ${TV_FONT}`;
  // TV 价格轴标签右对齐贴轴右缘（alignLabels 默认 right），留 6px 呼吸
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const price of priceScale.ticks(6)) {
    const y = priceScale.priceToY(price);
    if (y < 10 || y > geo.chartH - 2) continue;
    ctx.fillText(compact ? formatCompact(price) : priceScale.toLabel(price, decimals), geo.chartW + AXIS_TEXT_INSET, y);
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
  ctx.font = `11px ${TV_FONT}`;
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

/** 副图面板图例：指标名（指标色）+ 最新值，置于面板左上角（TV 风格） */
export function drawPaneLegend(
  ctx: CanvasRenderingContext2D,
  name: string,
  value: string,
  color: string,
): void {
  ctx.font = `11px ${TV_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = color;
  ctx.fillText(name, 8, 6);
  const x = 8 + ctx.measureText(name).width + 6;
  ctx.fillStyle = theme.axisText;
  ctx.fillText(value, x, 6);
}

/** 最新价：横贯图表的点线 + 右轴方向着色徽章（TradingView 默认开启）。
 *  countdown：收盘倒计时文本（TV：徽章旁实时 mm:ss），null/undefined 不绘制 */
export function drawLastPrice(
  ctx: CanvasRenderingContext2D,
  priceScale: PriceScale,
  last: Bar,
  prevClose: number,
  decimals: number,
  geo: DrawGeometry,
  countdown?: string | null,
): void {
  const y = Math.round(priceScale.priceToY(last.close)) + 0.5;
  if (y < -20 || y > geo.chartH + 20) return;
  const color = last.close >= prevClose ? theme.up : theme.down;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(geo.chartW, y);
  ctx.stroke();
  ctx.setLineDash([]);

  const text = priceScale.toLabel(last.close, decimals);
  ctx.font = `11px ${TV_FONT}`;
  const w = Math.max(58, ctx.measureText(text).width + 12);
  const h = 18;
  const by = Math.min(Math.max(y - h / 2, 1), geo.chartH - h - 1);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(geo.chartW + 2, by, w, h, 3);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, geo.chartW + 2 + w / 2, by + h / 2 + 0.5);

  // 收盘倒计时：徽章下方右对齐贴徽章右缘；底部空间不足时上翻到徽章上方
  if (countdown) {
    ctx.font = `11px ${TV_FONT}`;
    ctx.fillStyle = theme.axisText;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const belowY = by + h + 9;
    const cy = belowY <= geo.chartH - 6 ? belowY : Math.max(by - 9, 8);
    ctx.fillText(countdown, geo.chartW + 2 + w, cy);
  }
  ctx.restore();
}

export interface PaneButtonRects {
  settings: { x: number; y: number; w: number; h: number };
  remove: { x: number; y: number; w: number; h: number };
}

/** 选中面板右上角的操作按钮（设置/移除），返回命中区（面板局部坐标） */
export function drawPaneButtons(ctx: CanvasRenderingContext2D, geo: DrawGeometry): PaneButtonRects {
  const size = 18;
  const y = 3;
  const remove = { x: geo.chartW - 6 - size, y, w: size, h: size };
  const settings = { x: remove.x - 2 - size, y, w: size, h: size };
  ctx.save();
  ctx.strokeStyle = theme.axisText;
  ctx.lineWidth = 1.2;
  drawGearIcon(ctx, settings.x + size / 2, settings.y + size / 2, 5.5);
  drawXIcon(ctx, remove.x + size / 2, remove.y + size / 2, 4.5);
  ctx.restore();
  return { settings, remove };
}

function drawGearIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }
}

function drawXIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.62, cy - r * 0.62);
  ctx.lineTo(cx + r * 0.62, cy + r * 0.62);
  ctx.moveTo(cx + r * 0.62, cy - r * 0.62);
  ctx.lineTo(cx - r * 0.62, cy + r * 0.62);
  ctx.stroke();
}

export function formatTime(time: number, spacing: number): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (spacing >= 300) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  if (spacing >= 60) return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
