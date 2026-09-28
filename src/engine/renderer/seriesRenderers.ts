import type { BarSeries } from '@/data/BarSeries';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import { theme } from '../theme';
import { drawCandles, type DrawGeometry } from './drawSeries';

/**
 * 系列线色（阶梯线/带标记线形/HLC 面积）：与线形/面积同族，
 * 取设计令牌 --accent（global.css 双主题定义，与 UI 强调色同源）；
 * 无 DOM 环境（单测 node 环境）或令牌缺失时回落主题涨色。
 */
let lineColorCache = '';
let lineColorCacheKey = '';
function seriesLineColor(): string {
  if (typeof document === 'undefined') return theme.up;
  const key = document.body.className;
  if (key !== lineColorCacheKey || lineColorCache === '') {
    const v = getComputedStyle(document.body).getPropertyValue('--accent').trim();
    lineColorCache = v !== '' ? v : theme.up;
    lineColorCacheKey = key;
  }
  return lineColorCache;
}

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

/** 线形图：收盘价折线 */
export function drawLine(
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
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let started = false;
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
  ctx.stroke();
  ctx.restore();
}

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

/** 基线图：收盘价相对基线（可见范围中点）着色 */
export function drawBaseline(
  ctx: CanvasRenderingContext2D,
  series: BarSeries,
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
  basePrice: number,
): void {
  drawLine(ctx, series, from, to, viewport, priceScale, geo, theme.up);
  // 基线上方用涨色、下方用跌色：分两段绘制
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.chartW, geo.chartH);
  ctx.clip();
  ctx.lineWidth = 2;
  for (let i = from; i < to; i++) {
    const b0 = series.barAt(i)!;
    const b1 = series.barAt(i + 1)!;
    const x0 = viewport.indexToX(i);
    const x1 = viewport.indexToX(i + 1);
    if (x1 < -10 || x0 > geo.chartW + 10) continue;
    const y0 = priceScale.priceToY(b0.close);
    const y1 = priceScale.priceToY(b1.close);
    ctx.strokeStyle = b1.close >= basePrice ? theme.up : theme.down;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  // 基线参考线
  const yb = priceScale.priceToY(basePrice);
  if (yb >= 0 && yb <= geo.chartH) {
    ctx.strokeStyle = theme.axisText;
    ctx.setLineDash([2, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(yb) + 0.5);
    ctx.lineTo(geo.chartW, Math.round(yb) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

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

/** 阶梯线（Step line）：收盘价阶梯推进——先水平保持前值，后垂直跳变到本 bar */
export function drawStepLine(
  ctx: CanvasRenderingContext2D,
  series: BarSeries,
  from: number,
  to: number,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
  color?: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.chartW, geo.chartH);
  ctx.clip();
  ctx.strokeStyle = color ?? seriesLineColor();
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let started = false;
  let prevY = 0;
  for (let i = from; i <= to; i++) {
    const bar = series.barAt(i)!;
    const x = viewport.indexToX(i);
    if (x < -10 || x > geo.chartW + 10) continue;
    const y = priceScale.priceToY(bar.close);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, prevY); // 先水平：前值推进到本 bar 时刻
      ctx.lineTo(x, y); // 后垂直：跳变到本 bar 收盘
    }
    prevY = y;
  }
  ctx.stroke();
  ctx.restore();
}

/** 带标记线形（Line with markers）：收盘价折线 + 每 bar 收盘点小圆标记 */
export function drawLineMarkers(
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
  // 折线复用 drawLine：与线形图完全一致的几何与线宽
  drawLine(ctx, series, from, to, viewport, priceScale, geo, lineColor);
  // 过密（间距 < 3px）时退化为纯线形，避免标记糊成一片
  if (viewport.spacing < 3) return;
  const r = Math.max(1.5, Math.min(viewport.spacing * 0.22, 3.5));
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.chartW, geo.chartH);
  ctx.clip();
  ctx.fillStyle = lineColor;
  for (let i = from; i <= to; i++) {
    const bar = series.barAt(i)!;
    const x = viewport.indexToX(i);
    if (x < -10 || x > geo.chartW + 10) continue;
    const y = priceScale.priceToY(bar.close);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
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
