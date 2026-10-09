/**
 * 二期-C2 杂项四工具渲染 + 命中：预测形态（实线锚段 + 虚线投影箭头）/
 * 圆形（两点定径，TV 直径口径）/ 价格注记（锚价旗标 + 右向虚线延伸）/
 * 图标标记（SVG path 经 Path2D 矢量绘制，D3 裁决：非 emoji）。
 * 约定：drawOne 已设置 strokeStyle/fillStyle/lineWidth/font。
 */

import { distToSegment } from './geom';
import { theme } from '../theme';
import { PALETTE } from '@/engine/palette';
import { arrowHead } from './textRender';
import { iconMarkKeyOf, ICON_MARK_PATHS } from './iconMarks';
import type { Drawing } from './types';
import type { Pix } from './shapeMath';
import type { DrawContext } from './coords';

const ICON_SIZE = 22;

/** 预测形态：P0→P1 已知段实线，P1→P2 投影段虚线 + 末端箭头 */
export function drawForecast(ctx: CanvasRenderingContext2D, pts: readonly Pix[]): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.stroke();
  if (pts.length < 3) return;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.stroke();
  ctx.setLineDash([]);
  arrowHead(ctx, pts[1], pts[2], 9);
}

/** 圆形：两点定径——中点为圆心、半距为半径（TV 直径口径），填充 + 描边 */
export function drawCircle(ctx: CanvasRenderingContext2D, d: Drawing, pts: readonly Pix[]): void {
  if (pts.length < 2) return;
  const cx = (pts[0].x + pts[1].x) / 2;
  const cy = (pts[0].y + pts[1].y) / 2;
  const r = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) / 2;
  if (r <= 0) return;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = d.style.fillColor ?? PALETTE.blue22;
  ctx.fill();
  ctx.stroke();
}

/** 价格注记：锚价处旗标 + 向右虚线水平延伸至图缘，末端价格标签 */
export function drawPriceNote(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  pts: readonly Pix[],
  dctx: DrawContext,
  decimals: number,
): void {
  const p = pts[0];
  if (!p) return;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(dctx.geo.chartW, p.y);
  ctx.stroke();
  ctx.setLineDash([]);
  // 旗标：锚点左侧小三角 + 价格文本（TV 价格注记口径）
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - 7, p.y - 5);
  ctx.lineTo(p.x - 7, p.y + 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = theme.axisText;
  ctx.textAlign = 'right';
  ctx.fillText(d.style.text || d.points[0].price.toFixed(decimals), dctx.geo.chartW - 4, p.y - 8);
  ctx.textAlign = 'left';
}

/** 图标标记：SVG path 经 Path2D 以当前描边色绘制在锚点（矢量矢量矢量，非 emoji） */
export function drawIconMark(ctx: CanvasRenderingContext2D, d: Drawing, pts: readonly Pix[]): void {
  const p = pts[0];
  if (!p) return;
  const def = ICON_MARK_PATHS[iconMarkKeyOf(d.style.text)];
  if (!def) return;
  const path = new Path2D(def.d);
  ctx.save();
  ctx.translate(p.x - ICON_SIZE / 2, p.y - ICON_SIZE / 2);
  ctx.scale(ICON_SIZE / 24, ICON_SIZE / 24);
  ctx.lineWidth = d.style.lineWidth / (ICON_SIZE / 24);
  ctx.stroke(path);
  ctx.restore();
}

/** 预测形态命中：两段 ±6px */
export function hitTestForecast(pts: readonly Pix[], x: number, y: number): boolean {
  for (let i = 0; i < Math.min(2, pts.length - 1); i++) {
    if (distToSegment(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= 6) return true;
  }
  return false;
}

/** 圆形命中：圆周 ±6px 或圆内（与 ellipse 同：fill 态内部可命中） */
export function hitTestCircle(pts: readonly Pix[], x: number, y: number): boolean {
  if (pts.length < 2) return false;
  const cx = (pts[0].x + pts[1].x) / 2;
  const cy = (pts[0].y + pts[1].y) / 2;
  const dist = Math.hypot(x - cx, y - cy);
  const r = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) / 2;
  return dist <= r + 6;
}

/** 价格注记命中：水平虚线带 ±6px（锚点至图缘）+ 旗标小框 */
export function hitTestPriceNote(pts: readonly Pix[], dctx: DrawContext, x: number, y: number): boolean {
  const p = pts[0];
  if (!p) return false;
  if (y >= p.y - 6 && y <= p.y + 6 && x >= p.x - 8 && x <= dctx.geo.chartW) return true;
  return false;
}

/** 图标标记命中：锚点为中心的方形框（图标 22px + 命中余量） */
export function hitTestIconMark(pts: readonly Pix[], x: number, y: number): boolean {
  const p = pts[0];
  if (!p) return false;
  const half = ICON_SIZE / 2 + 4;
  return Math.abs(x - p.x) <= half && Math.abs(y - p.y) <= half;
}
