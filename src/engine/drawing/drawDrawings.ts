import type { Drawing, DrawingPoint } from './types';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import type { Bar } from '@/types/market';
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

/** 磁吸模式：off 不吸附；weak 仅当吸附点在 50px 内生效；strong 始终吸附（TV 实测） */
export type MagnetMode = 'off' | 'weak' | 'strong';

export function pixelToPoint(x: number, y: number, ctx: DrawContext, magnet: MagnetMode): DrawingPoint {
  const index = ctx.viewport.xToIndex(x);
  const roundIdx = Math.round(index);
  const bar = ctx.series.barAt(Math.max(0, Math.min(ctx.series.length - 1, roundIdx)));
  let time = bar ? bar.time : Date.now();
  if (bar && magnet === 'off') {
    // 未开磁吸也按 bar 对齐（index 制时间轴），但保留小数位置精度
    const exact = ctx.series.barAt(roundIdx);
    if (exact) {
      const iv = ctx.series.length > 1 ? (ctx.series.raw()[1]?.time ?? 0) - (ctx.series.raw()[0]?.time ?? 0) : 60_000;
      time = exact.time + (index - roundIdx) * iv;
    }
  }
  let price = ctx.priceScale.yToPrice(y);
  if (magnet !== 'off' && bar) {
    // 磁吸：就近吸附到 O/H/L/C
    const candidates = [bar.open, bar.high, bar.low, bar.close];
    const best = candidates.reduce((b, c) => (Math.abs(c - price) < Math.abs(b - price) ? c : b), candidates[0]);
    const snapY = ctx.priceScale.priceToY(best);
    if (magnet === 'strong' || Math.abs(snapY - y) <= 50) price = best;
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

// ---------- 斐波那契家族（B6）：比率常量集中一处，渲染/命中/单测共用 ----------

/** 回撤比率（既有 fib 与 Auto Fib 共用） */
export const FIB_RETRACEMENT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
/** 扩展比率（TV 默认 9 档） */
export const FIB_EXTENSION_LEVELS = [0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2.618] as const;
/** 扇形射线比率（TV 默认 3 条） */
export const FIB_FAN_LEVELS = [0.382, 0.5, 0.618] as const;
/** 弧线比率（TV 默认 3 条） */
export const FIB_ARC_LEVELS = [0.382, 0.5, 0.618] as const;

/**
 * 时区数列：1, 2, 3, 5, 8, 13, 21, 34, 55…（自第 3 项起每项 = 前两项之和）。
 * 返回前 count 个"间隔数"（单位：根 bar）。
 */
export function fibZoneOffsets(count: number): number[] {
  const out: number[] = [];
  let a = 1;
  let b = 2;
  for (let i = 0; i < count; i++) {
    out.push(a);
    const next = a + b;
    a = b;
    b = next;
  }
  return out;
}

/** 时区时间点：anchor + 数列 × bar 间隔 */
export function fibZoneTimes(anchorTime: number, interval: number, count: number): number[] {
  return fibZoneOffsets(count).map((n) => anchorTime + n * interval);
}

/**
 * 扩展比率价格：price = 枢轴 + (终点 - 起点) × 比率。
 * 向上趋势（终点 > 起点）时比率线落在枢轴上方；向下趋势时 (终点-起点) 为负、
 * 符号天然反转，比率线落在枢轴下方（延续原方向，与 TV 一致）。
 */
export function fibExtensionPrice(startPrice: number, endPrice: number, pivotPrice: number, ratio: number): number {
  return pivotPrice + (endPrice - startPrice) * ratio;
}

/**
 * 扇形射线在边缘时刻的价格：从起点出发、斜率 = 价格差 × 比率 / 时间差。
 * edgeTime 为画布边缘（左/右由趋势方向决定）对应的世界时间。
 */
export function fibFanEdgePrice(
  startPrice: number,
  endPrice: number,
  startTime: number,
  endTime: number,
  edgeTime: number,
  ratio: number,
): number {
  const span = endTime - startTime;
  if (span === 0) return startPrice;
  return startPrice + (endPrice - startPrice) * ratio * ((edgeTime - startTime) / span);
}

/**
 * Auto Fib 摆动检测：在可见 bar 区间 [from, to] 内找最高 high 与最低 low 两个 bar。
 * 返回按时间排序的 (start, end)：与手放置一致——先出现的 swing 为起点。
 * 区间不足两根 bar、或全区间价格无波动（最高 = 最低，如一字板）时返回 null（不放置）。
 * 注：最高最低落在同一根 bar（大波动十字星）时仍构成有效 swing 对，允许放置。
 */
export function detectVisibleSwing(
  bars: readonly Bar[],
  from: number,
  to: number,
): { start: DrawingPoint; end: DrawingPoint } | null {
  if (bars.length === 0) return null;
  const lo = Math.max(0, Math.min(from, bars.length - 1));
  const hi = Math.max(0, Math.min(to, bars.length - 1));
  if (hi - lo < 1) return null;
  let highIdx = lo;
  let lowIdx = lo;
  for (let i = lo; i <= hi; i++) {
    if (bars[i].high > bars[highIdx].high) highIdx = i;
    if (bars[i].low < bars[lowIdx].low) lowIdx = i;
  }
  if (bars[highIdx].high === bars[lowIdx].low) return null; // 全区间无价格波动
  const highPoint = { time: bars[highIdx].time, price: bars[highIdx].high };
  const lowPoint = { time: bars[lowIdx].time, price: bars[lowIdx].low };
  // 按时间排序：先出现的 swing 为起点（同时刻时高点在前，与 TV 手动放置的方向语义一致）
  const [start, end] = highPoint.time <= lowPoint.time ? [highPoint, lowPoint] : [lowPoint, highPoint];
  return { start, end };
}

/** 画布 x → 世界时间（视口线性映射；区间外按相邻间隔外推，供射线/时区求边缘时间） */
function xToTime(x: number, ctx: DrawContext): number {
  const idx = ctx.viewport.xToIndex(x);
  const raw = ctx.series.raw();
  if (raw.length === 0) return Date.now();
  if (raw.length === 1) return raw[0].time + idx * 60_000;
  const last = raw.length - 1;
  if (idx >= last) return raw[last].time + (idx - last) * (raw[last].time - raw[last - 1].time);
  if (idx <= 0) return raw[0].time + idx * (raw[1].time - raw[0].time);
  const i0 = Math.floor(idx);
  return raw[i0].time + (idx - i0) * (raw[i0 + 1].time - raw[i0].time);
}

/** 扇形射线边缘端点（像素）：从起点沿比率斜率延伸到画布边缘（趋势方向决定左/右缘） */
function fanRayEnd(p0: DrawingPoint, p1: DrawingPoint, ratio: number, ctx: DrawContext): { x: number; y: number } {
  const a = pointToPixel(p0, ctx);
  const b = pointToPixel(p1, ctx);
  const edgeX = b.x >= a.x ? ctx.geo.chartW : 0;
  const price = fibFanEdgePrice(p0.price, p1.price, p0.time, p1.time, xToTime(edgeX, ctx), ratio);
  return { x: edgeX, y: ctx.priceScale.priceToY(price) };
}

/** 弧线扫掠象限（canvas 角：0 = +x 右，PI/2 = +y 下）→ [起始角, 结束角] */
function arcSweep(a: { x: number; y: number }, b: { x: number; y: number }): [number, number] {
  const right = b.x >= a.x;
  const up = b.y < a.y;
  if (right && up) return [-Math.PI / 2, 0];
  if (right && !up) return [0, Math.PI / 2];
  if (!right && up) return [Math.PI, Math.PI * 1.5];
  return [Math.PI / 2, Math.PI];
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
    case 'fib-auto':
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
      // fib / fib-auto：再补水平比率线命中（与渲染的线组一致）
      if (drawing.type === 'fib' || drawing.type === 'fib-auto') {
        const x0 = Math.min(pts[0].x, pts[1].x);
        const p0 = drawing.points[0].price;
        const p1 = drawing.points[1].price;
        for (const lv of FIB_RETRACEMENT_LEVELS) {
          const ly = ctx.priceScale.priceToY(p0 + (p1 - p0) * lv);
          if (distToSegment(x, y, x0, ly, ctx.geo.chartW, ly) <= 6) return { part: 'body' };
        }
      }
      return null;
    }
    case 'fib-extension': {
      if (pts.length < 3) return null;
      const x0 = Math.min(pts[0].x, pts[1].x, pts[2].x);
      const [p0, p1, p2] = drawing.points;
      for (const lv of FIB_EXTENSION_LEVELS) {
        const ly = ctx.priceScale.priceToY(fibExtensionPrice(p0.price, p1.price, p2.price, lv));
        if (distToSegment(x, y, x0, ly, ctx.geo.chartW, ly) <= 6) return { part: 'body' };
      }
      return null;
    }
    case 'fib-fan': {
      if (pts.length < 2) return null;
      for (const lv of FIB_FAN_LEVELS) {
        const end = fanRayEnd(drawing.points[0], drawing.points[1], lv, ctx);
        if (distToSegment(x, y, pts[0].x, pts[0].y, end.x, end.y) <= 6) return { part: 'body' };
      }
      return null;
    }
    case 'fib-arc': {
      if (pts.length < 2) return null;
      // 弧线命中用包围盒近似：椭圆弧逐点求距成本高，取锚点与扫掠象限的并集外接盒
      const a = pts[0];
      const b = pts[1];
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      const minY = Math.min(a.y, b.y);
      const maxY = Math.max(a.y, b.y);
      return x >= minX - 4 && x <= maxX + 4 && y >= minY - 4 && y <= maxY + 4 ? { part: 'body' } : null;
    }
    case 'fib-timezone': {
      if (pts.length < 1) return null;
      const raw = ctx.series.raw();
      const iv = raw.length > 1 ? raw[1].time - raw[0].time : 60_000;
      for (const t of fibZoneTimes(drawing.points[0].time, iv, 25)) {
        const px = ctx.viewport.indexToX(ctx.series.fractionalIndexAt(t));
        if (Math.abs(x - px) <= 5) return { part: 'body' };
      }
      return null;
    }
    default:
      return null;
  }
}

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
  ctx.setLineDash(d.style.dash ? [6, 4] : []);
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
    case 'fib':
    case 'fib-auto': {
      if (pts.length < 2) break;
      const p0 = d.points[0].price;
      const p1 = d.points[1].price;
      const x1 = Math.max(pts[0].x, pts[1].x);
      const x2 = dctx.geo.chartW;
      for (const lv of FIB_RETRACEMENT_LEVELS) {
        const price = p0 + (p1 - p0) * lv;
        const y = Math.round(dctx.priceScale.priceToY(price)) + 0.5;
        line(Math.min(pts[0].x, pts[1].x), y, x2, y);
        label(ctx, `${(lv * 100).toFixed(1)}% ${price.toFixed(decimals)}`, x1 + 4, y, 'left');
      }
      break;
    }
    case 'fib-extension': {
      if (pts.length < 2) break;
      // 锚点连线 1→2→3（放置中的预览也可见，TV 同款）
      line(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      if (pts.length < 3) break;
      line(pts[1].x, pts[1].y, pts[2].x, pts[2].y);
      const x0 = Math.min(pts[0].x, pts[1].x, pts[2].x);
      const xLabel = Math.max(pts[0].x, pts[1].x, pts[2].x);
      const [e0, e1, pivot] = d.points;
      for (const lv of FIB_EXTENSION_LEVELS) {
        const price = fibExtensionPrice(e0.price, e1.price, pivot.price, lv);
        const y = Math.round(dctx.priceScale.priceToY(price)) + 0.5;
        line(x0, y, dctx.geo.chartW, y);
        label(ctx, `${(lv * 100).toFixed(1)}% ${price.toFixed(decimals)}`, xLabel + 4, y, 'left');
      }
      break;
    }
    case 'fib-fan': {
      if (pts.length < 2) break;
      for (const lv of FIB_FAN_LEVELS) {
        const end = fanRayEnd(d.points[0], d.points[1], lv, dctx);
        line(pts[0].x, pts[0].y, end.x, end.y);
        // 标签贴射线末端，朝画布内侧偏移，避免裁掉
        const fromRight = end.x >= pts[0].x;
        label(ctx, `${(lv * 100).toFixed(1)}%`, fromRight ? end.x - 4 : end.x + 4, end.y, fromRight ? 'right' : 'left');
      }
      break;
    }
    case 'fib-arc': {
      if (pts.length < 2) break;
      const a = pts[0];
      const b = pts[1];
      const rx = Math.abs(b.x - a.x);
      const ry = Math.abs(b.y - a.y);
      const [a0, a1] = arcSweep(a, b);
      line(a.x, a.y, b.x, b.y); // 基线（两锚点连线）
      for (const lv of FIB_ARC_LEVELS) {
        ctx.beginPath();
        ctx.ellipse(a.x, a.y, rx * lv, ry * lv, 0, a0, a1);
        ctx.stroke();
        // 标签落在弧中点（半径 = 价格差 × 比率；x 用时间跨度、y 用价格跨度分别缩放）
        const mid = (a0 + a1) / 2;
        const mx = a.x + rx * lv * Math.cos(mid);
        const my = a.y + ry * lv * Math.sin(mid);
        label(ctx, `${(lv * 100).toFixed(1)}%`, mx + 4, my, 'left');
      }
      break;
    }
    case 'fib-timezone': {
      if (pts.length < 1) break;
      const raw = dctx.series.raw();
      const iv = raw.length > 1 ? raw[1].time - raw[0].time : 60_000;
      for (const t of fibZoneTimes(d.points[0].time, iv, 25)) {
        const x = Math.round(dctx.viewport.indexToX(dctx.series.fractionalIndexAt(t))) + 0.5;
        if (x < 0 || x > dctx.geo.chartW) continue; // 视口外不渲染
        line(x, 0, x, dctx.geo.chartH);
      }
      break;
    }
  }
  ctx.setLineDash([]);
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
