import type { BarSeries } from '@/data/BarSeries';
import type { Bar } from '@/types/market';
import { formatCompact } from '@/data/format';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import { theme, TV_FONT } from '../theme';
import type { DrawGeometry } from './drawSeries';
import { PALETTE } from '@/engine/palette';
import { AXIS_WIDTH, chartAreaOffsetX, type PriceAxisPos } from './chartPanes';

/** 网格模式：TV 图表设置「画布」页四态 */
export type GridMode = 'none' | 'horizontal' | 'vertical' | 'both';

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
  mode: GridMode = 'both',
): void {
  if (mode === 'none') return;
  // 网格线统一为 1 物理像素（DPR 自适应），比 1 CSS 像素更细且边缘清晰
  const dpr = window.devicePixelRatio || 1;
  const align = (v: number) => (Math.round(v * dpr) + 0.5) / dpr;
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1 / dpr;
  ctx.beginPath();
  if (mode !== 'vertical') {
    for (const price of priceScale.ticks(6)) {
      const y = align(priceScale.priceToY(price));
      if (y < 0 || y > geo.chartH) continue;
      ctx.moveTo(0, y);
      ctx.lineTo(geo.chartW, y);
    }
  }
  if (mode !== 'horizontal') {
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
  }
  ctx.stroke();
}

/** 紧凑数字格式见 @/data/format（画布与 UI 共用） */

/** 价格轴文字距轴右缘的内缩（TV 规格） */
const AXIS_TEXT_INSET = 58;

/** 价格轴条本地 x：右轴 = 图表区右缘，左轴 = 图表区左边界左侧一个轴宽
 *  （PaneRenderer 已按轴侧 translate，二者均落位到画布对应边缘） */
function axisStripX(geo: DrawGeometry, pos: PriceAxisPos): number {
  return pos === 'left' ? -AXIS_WIDTH : geo.chartW;
}

export function drawPriceAxis(
  ctx: CanvasRenderingContext2D,
  priceScale: PriceScale,
  decimals: number,
  geo: DrawGeometry,
  compact = false,
  pos: PriceAxisPos = 'right',
): void {
  if (pos === 'none') return; // 无价格轴：不绘轴条/分隔线/标签（图表区全宽）
  const axisX = axisStripX(geo, pos);
  ctx.fillStyle = theme.background;
  ctx.fillRect(axisX, 0, AXIS_WIDTH, geo.chartH);
  ctx.strokeStyle = theme.axisLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(axisX + 0.5, 0);
  ctx.lineTo(axisX + 0.5, geo.chartH);
  ctx.stroke();

  ctx.fillStyle = theme.axisText;
  ctx.font = `11px ${TV_FONT}`;
  // TV 价格轴标签贴轴内侧（alignLabels 默认 right）：右轴右对齐贴轴右缘、
  // 左轴左对齐贴轴左缘，各留 6px 呼吸
  ctx.textAlign = pos === 'left' ? 'left' : 'right';
  ctx.textBaseline = 'middle';
  const textX = pos === 'left' ? axisX + 6 : axisX + AXIS_TEXT_INSET;
  for (const price of priceScale.ticks(6)) {
    const y = priceScale.priceToY(price);
    if (y < 10 || y > geo.chartH - 2) continue;
    ctx.fillText(compact ? formatCompact(price) : priceScale.toLabel(price, decimals), textX, y);
  }
}

export function drawTimeAxis(
  ctx: CanvasRenderingContext2D,
  series: BarSeries,
  viewport: Viewport,
  geo: DrawGeometry,
  pos: PriceAxisPos = 'right',
  hour12 = false,
): void {
  const top = geo.chartH;
  // 轴在左：时间轴随图表区右移一个轴宽（画布坐标）；右/无轴 = 0
  const x0 = chartAreaOffsetX(pos);
  ctx.fillStyle = theme.background;
  ctx.fillRect(x0, top, geo.chartW, 24);
  ctx.strokeStyle = theme.axisLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, top + 0.5);
  ctx.lineTo(x0 + geo.chartW, top + 0.5);
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
  let lastLabeledYear = -1;
  for (let i = startIdx; i <= endIdx; i += step) {
    if (i < 0 || i > last) continue; // 仅标注有 K 线的位置（空白区不标）
    const bar = series.barAt(i)!;
    const lx = viewport.indexToX(i);
    if (lx < 30 || lx > geo.chartW - 30) continue;
    // 跨年标签带年份（TV：与上一个标签不同年才显式标注）
    const year = new Date(bar.time).getFullYear();
    const showYear = lastLabeledYear !== -1 && year !== lastLabeledYear;
    lastLabeledYear = year;
    ctx.fillText(formatTime(bar.time, spacing, showYear, hour12), x0 + lx, top + 12);
  }
}

export function drawBorders(ctx: CanvasRenderingContext2D, geo: DrawGeometry, pos: PriceAxisPos = 'right'): void {
  const x0 = chartAreaOffsetX(pos); // 轴在左：边框随图表区右移一个轴宽
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, 0.5, geo.chartW - 1, geo.chartH - 1);
}

/** 副图面板图例：指标名（指标色）+ 最新值，置于面板左上角（TV 风格） */
export function drawPaneLegend(ctx: CanvasRenderingContext2D, name: string, value: string, color: string): void {
  ctx.font = `11px ${TV_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = color;
  ctx.fillText(name, 8, 6);
  const x = 8 + ctx.measureText(name).width + 6;
  ctx.fillStyle = theme.axisText;
  ctx.fillText(value, x, 6);
}

/** 最新价：横贯图表的点线 + 价格轴方向着色徽章（TradingView 默认开启）。
 *  countdown：收盘倒计时文本（TV：徽章旁实时 mm:ss），null/undefined 不绘制。
 *  pos = 价格轴侧：徽章贴轴内侧（右轴 = 图表区右缘，左轴 = 图表区左边界左侧）。 */
export function drawLastPrice(
  ctx: CanvasRenderingContext2D,
  priceScale: PriceScale,
  last: Bar,
  prevClose: number,
  decimals: number,
  geo: DrawGeometry,
  countdown?: string | null,
  pos: PriceAxisPos = 'right',
): void {
  const y = Math.round(priceScale.priceToY(last.close)) + 0.5;
  if (y < -20 || y > geo.chartH + 20) return;
  const color = last.close >= prevClose ? theme.up : theme.down;
  const axisX = axisStripX(geo, pos);

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
  ctx.roundRect(axisX + 2, by, w, h, 3);
  ctx.fill();
  ctx.fillStyle = PALETTE.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, axisX + 2 + w / 2, by + h / 2 + 0.5);

  // 收盘倒计时：徽章下方贴徽章内侧（右轴右对齐贴徽章右缘，左轴左对齐贴徽章左缘）；
  // 底部空间不足时上翻到徽章上方
  if (countdown) {
    ctx.font = `11px ${TV_FONT}`;
    ctx.fillStyle = theme.axisText;
    ctx.textAlign = pos === 'left' ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    const belowY = by + h + 9;
    const cy = belowY <= geo.chartH - 6 ? belowY : Math.max(by - 9, 8);
    ctx.fillText(countdown, pos === 'left' ? axisX + 2 : axisX + 2 + w, cy);
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

/** 时间轴标签（TV 中文界面规格）：
 *  日内（间距 <60px）HH:mm；日线（60-300px）M月D日；周/月以上（≥300px）M月；
 *  跨年标签（1 月或与上一标签不同年，由调用方判定 showYear）带 YYYY 年。
 *  hour12 = 12 小时制（TV 坐标轴页）：仅作用于日内段，H:mm AM/PM（12 点不折半）。 */
export function formatTime(time: number, spacing: number, showYear = false, hour12 = false): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (spacing < 60) {
    if (!hour12) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const h24 = d.getHours();
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12; // 0 点 → 12 AM，12 点 → 12 PM
    return `${h12}:${pad(d.getMinutes())} ${h24 < 12 ? 'AM' : 'PM'}`;
  }
  if (spacing < 300) return showYear ? `${y}年${m}月${d.getDate()}日` : `${m}月${d.getDate()}日`;
  return showYear || m === 1 ? `${y}年${m}月` : `${m}月`;
}
