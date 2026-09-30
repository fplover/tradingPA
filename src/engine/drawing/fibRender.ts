/** 斐波那契家族渲染 + 命中（B6）：扩展/扇形/弧线/时区/回撤水平组。
 *  纯比率计算在 fibMath.ts；此处只做像素几何与 canvas 绘制。
 *  约定：调用方（drawOne）已设置 strokeStyle/fillStyle/lineWidth/setLineDash。 */
import type { Drawing, DrawingPoint } from './types';
import type { DrawContext } from './drawDrawings';
import { distToSegment } from './geom';
import { theme, TV_FONT } from '../theme';
import {
  FIB_ARC_LEVELS,
  FIB_EXTENSION_LEVELS,
  FIB_FAN_LEVELS,
  FIB_RETRACEMENT_LEVELS,
  FIB_ZONE_COUNT,
  fibArcAngles,
  fibArcHit,
  fibExtensionPrice,
  fibFanEdgePrice,
  fibLevelEndX,
  fibRetracementPrice,
  fibZoneTimes,
} from './fibMath';

type Pix = { x: number; y: number };

function strokeLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** 水平位标签（比率% + 价格），与既有 fib 渲染同款 10px 轴文字色 */
function levelLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign): void {
  ctx.font = `10px ${TV_FONT}`;
  ctx.textAlign = align;
  ctx.fillStyle = theme.axisText;
  ctx.fillText(text, x, y);
}

/** 回撤/扩展水平位标签：贴线右端外侧（endX + 4，左对齐）；
 *  溢出画布右缘（endX + 4 + 字宽 > chartW - 2）时钳到 chartW - 字宽 - 2 并改右对齐。
 *  导出供百分比线（percentRender）复用：fib 类水平线组的标签贴线策略完全一致。 */
export function drawLevelLabel(ctx: CanvasRenderingContext2D, text: string, endX: number, y: number, chartW: number): void {
  ctx.font = `10px ${TV_FONT}`;
  const w = ctx.measureText(text).width;
  const lx = endX + 4;
  if (lx + w > chartW - 2) levelLabel(ctx, text, Math.max(0, chartW - w - 2), y, 'right');
  else levelLabel(ctx, text, lx, y, 'left');
}

/** 画布 x → 世界时间（视口线性映射；区间外按相邻间隔外推，供射线求边缘时间） */
function xToTime(x: number, dctx: DrawContext): number {
  const idx = dctx.viewport.xToIndex(x);
  const raw = dctx.series.raw();
  if (raw.length === 0) return Date.now();
  if (raw.length === 1) return raw[0].time + idx * 60_000;
  const last = raw.length - 1;
  if (idx >= last) return raw[last].time + (idx - last) * (raw[last].time - raw[last - 1].time);
  if (idx <= 0) return raw[0].time + idx * (raw[1].time - raw[0].time);
  const i0 = Math.floor(idx);
  return raw[i0].time + (idx - i0) * (raw[i0 + 1].time - raw[i0].time);
}

/** 扇形射线边缘端点（像素）：从起点沿比率斜率延伸到画布边缘（趋势方向决定左/右缘） */
export function fanRayEndPix(p0: DrawingPoint, p1: DrawingPoint, ratio: number, dctx: DrawContext): Pix {
  const edgeX = p1.time >= p0.time ? dctx.geo.chartW : 0;
  const price = fibFanEdgePrice(p0.price, p1.price, p0.time, p1.time, xToTime(edgeX, dctx), ratio);
  return { x: edgeX, y: dctx.priceScale.priceToY(price) };
}

/** 时区垂直线的像素 x（视口外由调用方过滤） */
export function timezonePixelXs(anchorTime: number, dctx: DrawContext): number[] {
  const raw = dctx.series.raw();
  const iv = raw.length > 1 ? raw[1].time - raw[0].time : 60_000;
  return fibZoneTimes(anchorTime, iv, FIB_ZONE_COUNT).map((t) =>
    dctx.viewport.indexToX(dctx.series.fractionalIndexAt(t)),
  );
}

/** 回撤水平组（fib / fib-auto 共用）：水平线 + 比率/价格标签（线末端与标签见 fibLevelEndX/drawLevelLabel） */
export function drawFibRetracement(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pix[], dctx: DrawContext, decimals: number): void {
  if (pts.length < 2) return;
  const [p0, p1] = d.points;
  const x0 = Math.min(pts[0].x, pts[1].x);
  const xLabel = Math.max(pts[0].x, pts[1].x);
  const endX = fibLevelEndX(x0, xLabel, dctx.geo.chartW);
  for (const lv of FIB_RETRACEMENT_LEVELS) {
    const price = fibRetracementPrice(p0.price, p1.price, lv);
    const y = Math.round(dctx.priceScale.priceToY(price)) + 0.5;
    strokeLine(ctx, x0, y, endX, y);
    drawLevelLabel(ctx, `${(lv * 100).toFixed(1)}% ${price.toFixed(decimals)}`, endX, y, dctx.geo.chartW);
  }
}

/** 扩展：锚点连线 1→2→3 + 以第 3 点为枢轴的水平比率组 */
export function drawFibExtension(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pix[], dctx: DrawContext, decimals: number): void {
  if (pts.length < 2) return;
  strokeLine(ctx, pts[0].x, pts[0].y, pts[1].x, pts[1].y);
  if (pts.length < 3) return;
  strokeLine(ctx, pts[1].x, pts[1].y, pts[2].x, pts[2].y);
  const x0 = Math.min(pts[0].x, pts[1].x, pts[2].x);
  const xLabel = Math.max(pts[0].x, pts[1].x, pts[2].x);
  const endX = fibLevelEndX(x0, xLabel, dctx.geo.chartW);
  const [e0, e1, pivot] = d.points;
  for (const lv of FIB_EXTENSION_LEVELS) {
    const price = fibExtensionPrice(e0.price, e1.price, pivot.price, lv);
    const y = Math.round(dctx.priceScale.priceToY(price)) + 0.5;
    strokeLine(ctx, x0, y, endX, y);
    drawLevelLabel(ctx, `${(lv * 100).toFixed(1)}% ${price.toFixed(decimals)}`, endX, y, dctx.geo.chartW);
  }
}

/** 扇形：从起点按比率斜率射向画布边缘，标签贴射线末端（朝画布内侧偏移） */
export function drawFibFan(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pix[], dctx: DrawContext): void {
  if (pts.length < 2) return;
  for (const lv of FIB_FAN_LEVELS) {
    const end = fanRayEndPix(d.points[0], d.points[1], lv, dctx);
    strokeLine(ctx, pts[0].x, pts[0].y, end.x, end.y);
    const fromRight = end.x >= pts[0].x;
    levelLabel(ctx, `${(lv * 100).toFixed(1)}%`, fromRight ? end.x - 4 : end.x + 4, end.y, fromRight ? 'right' : 'left');
  }
}

/** 弧线：基线 + 以第 1 锚点为圆心、比率 × (时间跨度, 价格跨度) 为双轴半径的椭圆象限弧 */
export function drawFibArc(ctx: CanvasRenderingContext2D, pts: Pix[]): void {
  if (pts.length < 2) return;
  const [a, b] = pts;
  const rx = Math.abs(b.x - a.x);
  const ry = Math.abs(b.y - a.y);
  const [a0, a1] = fibArcAngles(a, b);
  strokeLine(ctx, a.x, a.y, b.x, b.y); // 基线（两锚点连线）
  for (const lv of FIB_ARC_LEVELS) {
    ctx.beginPath();
    ctx.ellipse(a.x, a.y, rx * lv, ry * lv, 0, a0, a1);
    ctx.stroke();
    // 标签落在弧中点（半径 = 比率 × 锚距；x 用时间跨度、y 用价格跨度分别缩放）
    const mid = (a0 + a1) / 2;
    levelLabel(ctx, `${(lv * 100).toFixed(1)}%`, a.x + rx * lv * Math.cos(mid) + 4, a.y + ry * lv * Math.sin(mid), 'left');
  }
}

/** 时区：锚点后沿时间轴按 fib 数列间隔的垂直线（视口外不渲染） */
export function drawFibTimezone(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pix[], dctx: DrawContext): void {
  if (pts.length < 1) return;
  for (const x of timezonePixelXs(d.points[0].time, dctx)) {
    const px = Math.round(x) + 0.5;
    if (px < 0 || px > dctx.geo.chartW) continue;
    strokeLine(ctx, px, 0, px, dctx.geo.chartH);
  }
}

/** 斐波那契家族命中测试（body 级；手柄由调用方优先判定）。
 *  命中规则与渲染线组一一对应：回撤/扩展 = 锚线 + 水平比率线；
 *  扇形 = 三条射线；弧线 = 三条弧；时区 = 各垂线 ±5px。 */
export function hitTestFib(drawing: Drawing, pts: Pix[], x: number, y: number, dctx: DrawContext): boolean {
  switch (drawing.type) {
    case 'fib':
    case 'fib-auto': {
      if (pts.length < 2) return false;
      if (distToSegment(x, y, pts[0].x, pts[0].y, pts[1].x, pts[1].y) <= 6) return true;
      const x0 = Math.min(pts[0].x, pts[1].x);
      const endX = fibLevelEndX(x0, Math.max(pts[0].x, pts[1].x), dctx.geo.chartW); // 与渲染同末端
      const p0 = drawing.points[0].price;
      const p1 = drawing.points[1].price;
      for (const lv of FIB_RETRACEMENT_LEVELS) {
        const ly = dctx.priceScale.priceToY(fibRetracementPrice(p0, p1, lv));
        if (distToSegment(x, y, x0, ly, endX, ly) <= 6) return true;
      }
      return false;
    }
    case 'fib-extension': {
      if (pts.length < 3) return false;
      if (distToSegment(x, y, pts[0].x, pts[0].y, pts[1].x, pts[1].y) <= 6) return true;
      if (distToSegment(x, y, pts[1].x, pts[1].y, pts[2].x, pts[2].y) <= 6) return true;
      const x0 = Math.min(pts[0].x, pts[1].x, pts[2].x);
      const endX = fibLevelEndX(x0, Math.max(pts[0].x, pts[1].x, pts[2].x), dctx.geo.chartW); // 与渲染同末端
      const [e0, e1, pivot] = drawing.points;
      for (const lv of FIB_EXTENSION_LEVELS) {
        const ly = dctx.priceScale.priceToY(fibExtensionPrice(e0.price, e1.price, pivot.price, lv));
        if (distToSegment(x, y, x0, ly, endX, ly) <= 6) return true;
      }
      return false;
    }
    case 'fib-fan': {
      if (pts.length < 2) return false;
      for (const lv of FIB_FAN_LEVELS) {
        const end = fanRayEndPix(drawing.points[0], drawing.points[1], lv, dctx);
        if (distToSegment(x, y, pts[0].x, pts[0].y, end.x, end.y) <= 6) return true;
      }
      return false;
    }
    case 'fib-arc':
      return pts.length >= 2 && fibArcHit(pts[0], pts[1], x, y);
    case 'fib-timezone': {
      if (pts.length < 1) return false;
      for (const px of timezonePixelXs(drawing.points[0].time, dctx)) {
        if (Math.abs(x - px) <= 5) return true;
      }
      return false;
    }
    default:
      return false;
  }
}
