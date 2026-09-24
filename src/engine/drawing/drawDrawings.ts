import type { Drawing, DrawingPoint } from './types';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import type { BarSeries } from '@/data/BarSeries';
import { theme, TV_FONT } from '../theme';
import type { DrawGeometry } from '../renderer/drawSeries';

export interface DrawContext {
  viewport: Viewport;
  priceScale: PriceScale;
  series: BarSeries;
  geo: DrawGeometry;
}

/** 世界坐标 → 面板局部像素（面板已 translate，y 为面板内坐标） */
export function pointToPixel(p: DrawingPoint, ctx: DrawContext): { x: number; y: number } {
  return {
    x: ctx.viewport.indexToX(ctx.series.fractionalIndexAt(p.time)),
    y: ctx.priceScale.priceToY(p.price),
  };
}

export function pixelToPoint(x: number, y: number, ctx: DrawContext, magnet: boolean): DrawingPoint {
  const index = ctx.viewport.xToIndex(x);
  const roundIdx = Math.round(index);
  const bar = ctx.series.barAt(Math.max(0, Math.min(ctx.series.length - 1, roundIdx)));
  let time = bar ? bar.time : Date.now();
  if (bar && !magnet) {
    // 未开磁吸也按 bar 对齐（index 制时间轴），但保留小数位置精度
    const exact = ctx.series.barAt(roundIdx);
    if (exact) {
      const iv = ctx.series.length > 1 ? (ctx.series.raw()[1]?.time ?? 0) - (ctx.series.raw()[0]?.time ?? 0) : 60_000;
      time = exact.time + (index - roundIdx) * iv;
    }
  }
  let price = ctx.priceScale.yToPrice(y);
  if (magnet && bar) {
    // 磁吸：就近吸附到 O/H/L/C
    const candidates = [bar.open, bar.high, bar.low, bar.close];
    price = candidates.reduce((best, c) => (Math.abs(c - price) < Math.abs(best - price) ? c : best), candidates[0]);
  }
  return { time, price };
}

/** 点到线段距离 */
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** 命中测试：返回 'body' / 'handle:i' / null */
export function hitTestDrawing(
  drawing: Drawing,
  x: number,
  y: number,
  ctx: DrawContext,
): { part: 'body' } | { part: 'handle'; index: number } | null {
  const pts = drawing.points.map((p) => pointToPixel(p, ctx));
  // 手柄优先
  for (let i = 0; i < pts.length; i++) {
    if (Math.hypot(x - pts[i].x, y - pts[i].y) <= 7) return { part: 'handle', index: i };
  }
  switch (drawing.type) {
    case 'hline': {
      const py = pts[0]?.y;
      return py !== undefined && Math.abs(y - py) <= 5 ? { part: 'body' } : null;
    }
    case 'vline': {
      const px = pts[0]?.x;
      return px !== undefined && Math.abs(x - px) <= 5 ? { part: 'body' } : null;
    }
    case 'text': {
      const p = pts[0];
      if (!p) return null;
      const w = (drawing.style.text ?? '').length * (drawing.style.fontSize ?? 12) * 0.6 + 8;
      const h = (drawing.style.fontSize ?? 12) + 8;
      return x >= p.x - 4 && x <= p.x + w && y >= p.y - 4 && y <= p.y + h ? { part: 'body' } : null;
    }
    case 'rect':
    case 'ellipse': {
      if (pts.length < 2) return null;
      const minX = Math.min(pts[0].x, pts[1].x);
      const maxX = Math.max(pts[0].x, pts[1].x);
      const minY = Math.min(pts[0].y, pts[1].y);
      const maxY = Math.max(pts[0].y, pts[1].y);
      const inside = x >= minX && x <= maxX && y >= minY && y <= maxY;
      if (!inside) return null;
      const onEdge = distToSegment(x, y, minX, minY, maxX, minY) <= 5 || distToSegment(x, y, minX, maxY, maxX, maxY) <= 5 || distToSegment(x, y, minX, minY, minX, maxY) <= 5 || distToSegment(x, y, maxX, minY, maxX, maxY) <= 5;
      return onEdge || drawing.type === 'rect' ? { part: 'body' } : null;
    }
    case 'path': {
      for (let i = 0; i < pts.length - 1; i++) {
        if (distToSegment(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= 6) return { part: 'body' };
      }
      return null;
    }
    case 'fib':
    case 'channel':
    case 'info-line':
    case 'trendline':
    case 'ray':
    case 'arrow': {
      if (pts.length < 2) return null;
      if (distToSegment(x, y, pts[0].x, pts[0].y, pts[1].x, pts[1].y) <= 6) return { part: 'body' };
      if (drawing.type === 'channel' && pts.length >= 3) {
        const dx = pts[1].x - pts[0].x;
        const dy = pts[1].y - pts[0].y;
        const ox = pts[2].x - pts[0].x;
        const oy = pts[2].y - pts[0].y;
        if (distToSegment(x, y, pts[0].x + ox, pts[0].y + oy, pts[1].x + ox, pts[1].y + oy) <= 6) return { part: 'body' };
        void dx;
        void dy;
      }
      return null;
    }
    default:
      return null;
  }
}

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

/** 渲染全部画线（面板局部坐标） */
export function drawDrawings(
  ctx: CanvasRenderingContext2D,
  drawings: readonly Drawing[],
  selectedId: string | null,
  dctx: DrawContext,
  decimals: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, dctx.geo.chartW, dctx.geo.chartH);
  ctx.clip();
  for (const d of drawings) {
    if (!d.visible) continue;
    drawOne(ctx, d, dctx, decimals);
    if (d.id === selectedId) drawHandles(ctx, d, dctx);
  }
  ctx.restore();
}

function drawOne(ctx: CanvasRenderingContext2D, d: Drawing, dctx: DrawContext, decimals: number): void {
  const pts = d.points.map((p) => pointToPixel(p, dctx));
  if (pts.length === 0) return;
  ctx.strokeStyle = d.style.color;
  ctx.fillStyle = d.style.color;
  ctx.lineWidth = d.style.lineWidth;
  ctx.font = `${d.style.fontSize ?? 12}px ${TV_FONT}`;
  ctx.textBaseline = 'middle';

  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  switch (d.type) {
    case 'hline': {
      const y = Math.round(pts[0].y) + 0.5;
      line(0, y, dctx.geo.chartW, y);
      label(ctx, d.points[0].price.toFixed(decimals), dctx.geo.chartW - 4, pts[0].y, 'right');
      break;
    }
    case 'vline': {
      const x = Math.round(pts[0].x) + 0.5;
      line(x, 0, x, dctx.geo.chartH);
      break;
    }
    case 'trendline':
      if (pts.length >= 2) line(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      break;
    case 'ray': {
      if (pts.length < 2) break;
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const scale = dx === 0 ? 1 : (dctx.geo.chartW - pts[0].x) / dx;
      line(pts[0].x, pts[0].y, pts[0].x + dx * Math.max(scale, 0), pts[0].y + dy * Math.max(scale, 0));
      break;
    }
    case 'arrow': {
      if (pts.length < 2) break;
      line(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      const size = 8;
      ctx.beginPath();
      ctx.moveTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[1].x - size * Math.cos(angle - 0.4), pts[1].y - size * Math.sin(angle - 0.4));
      ctx.lineTo(pts[1].x - size * Math.cos(angle + 0.4), pts[1].y - size * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'info-line': {
      if (pts.length < 2) break;
      line(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      const p0 = d.points[0].price;
      const p1 = d.points[1].price;
      const diff = p1 - p0;
      const pct = p0 !== 0 ? (diff / p0) * 100 : 0;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const text = `${diff >= 0 ? '+' : ''}${diff.toFixed(decimals)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
      ctx.fillStyle = '#2a2e39';
      const w = ctx.measureText(text).width + 10;
      ctx.fillRect(midX - w / 2, midY - 9, w, 18);
      ctx.fillStyle = diff >= 0 ? theme.up : theme.down;
      ctx.textAlign = 'center';
      ctx.fillText(text, midX, midY);
      break;
    }
    case 'channel': {
      if (pts.length < 3) break;
      const ox = pts[2].x - pts[0].x;
      const oy = pts[2].y - pts[0].y;
      ctx.fillStyle = d.style.fillColor ?? '#2962ff22';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[1].x + ox, pts[1].y + oy);
      ctx.lineTo(pts[0].x + ox, pts[0].y + oy);
      ctx.closePath();
      ctx.fill();
      line(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      line(pts[0].x + ox, pts[0].y + oy, pts[1].x + ox, pts[1].y + oy);
      break;
    }
    case 'rect': {
      if (pts.length < 2) break;
      const x = Math.min(pts[0].x, pts[1].x);
      const y = Math.min(pts[0].y, pts[1].y);
      const w = Math.abs(pts[1].x - pts[0].x);
      const h = Math.abs(pts[1].y - pts[0].y);
      ctx.fillStyle = d.style.fillColor ?? '#2962ff22';
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      break;
    }
    case 'ellipse': {
      if (pts.length < 2) break;
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      const rx = Math.abs(pts[1].x - pts[0].x) / 2;
      const ry = Math.abs(pts[1].y - pts[0].y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = d.style.fillColor ?? '#2962ff22';
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'path': {
      if (pts.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      break;
    }
    case 'text': {
      const text = d.style.text ?? '';
      ctx.fillStyle = d.style.color;
      ctx.textAlign = 'left';
      ctx.fillText(text, pts[0].x, pts[0].y);
      break;
    }
    case 'fib': {
      if (pts.length < 2) break;
      const p0 = d.points[0].price;
      const p1 = d.points[1].price;
      const x1 = Math.max(pts[0].x, pts[1].x);
      const x2 = dctx.geo.chartW;
      for (const lv of FIB_LEVELS) {
        const price = p0 + (p1 - p0) * lv;
        const y = Math.round(dctx.priceScale.priceToY(price)) + 0.5;
        line(Math.min(pts[0].x, pts[1].x), y, x2, y);
        label(ctx, `${(lv * 100).toFixed(1)}% ${price.toFixed(decimals)}`, x1 + 4, y, 'left');
      }
      break;
    }
  }
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign) {
  ctx.font = `10px ${TV_FONT}`;
  ctx.textAlign = align;
  ctx.fillStyle = theme.axisText;
  ctx.fillText(text, x, y);
}

function drawHandles(ctx: CanvasRenderingContext2D, d: Drawing, dctx: DrawContext): void {
  for (const p of d.points) {
    const { x, y } = pointToPixel(p, dctx);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = d.style.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
