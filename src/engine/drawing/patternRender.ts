/**
 * 形态家族渲染 + 命中（二期-C1）：谐波（XABCD 折线 + 比率标签）/ 头肩顶底
 * （5 锚点折线 + 颈线延长）/ 三角形态（枢轴折线 + 边界延长至交点）。
 * 校验几何在 patternMath.ts；此处只做像素绘制与像素命中。约定：drawOne 已设置
 * strokeStyle/fillStyle/lineWidth/font；比率标签 ok=多方绿 / 越带=空方红
 * （PALETTE 取色，渲染路径无 hex 硬编码）。
 */

import { distToSegment } from './geom';
import { theme, TV_FONT } from '../theme';
import { PALETTE } from '@/engine/palette';
import { harmonicCheck, HARMONIC_LABELS, headShouldersValid, triangleGeom, type HarmonicKind } from './patternMath';
import { pointToPixel, type DrawContext } from './coords';
import type { Drawing } from './types';
import type { Pix } from './shapeMath';

function drawZigzag(ctx: CanvasRenderingContext2D, pts: readonly Pix[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

/** 谐波：X→A→B→C→D 折线 + 各腿中点比率标签（带内绿 / 越带红）+ 锚点字母标注 */
function drawHarmonic(ctx: CanvasRenderingContext2D, d: Drawing, pts: readonly Pix[]): void {
  drawZigzag(ctx, pts);
  const checks = harmonicCheck(d.type as HarmonicKind, d.points);
  ctx.font = `10px ${TV_FONT}`;
  ctx.textAlign = 'left';
  // 三条腿比率标签画在腿中点：AB、BC、CD；AD/XA 画在 A→D 连线中点
  const legs: Array<[number, number, number]> = [
    [1, 2, 0],
    [2, 3, 1],
    [3, 4, 2],
    [1, 4, 3],
  ];
  for (const [ai, bi, ci] of legs) {
    const c = checks[ci];
    if (!c) continue;
    const a = pts[ai];
    const b = pts[bi];
    ctx.fillStyle = c.ok ? PALETTE.green : PALETTE.red;
    ctx.fillText(`${c.leg} ${c.value.toFixed(2)}`, (a.x + b.x) / 2 + 4, (a.y + b.y) / 2 - 4);
  }
  ctx.fillStyle = theme.axisText;
  HARMONIC_LABELS.forEach((label, i) => {
    const p = pts[i];
    if (p) ctx.fillText(label, p.x + 5, p.y - 5);
  });
}

/** 头肩顶底：5 锚点折线（肩-颈-头-颈-肩）+ 虚线颈线全宽延长；形态有效时折线转多方绿 */
function drawHeadShoulders(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  pts: readonly Pix[],
  dctx: DrawContext,
  inverse: boolean,
): void {
  const valid = headShouldersValid(d.points, inverse);
  if (valid) ctx.strokeStyle = PALETTE.green;
  drawZigzag(ctx, pts);
  if (pts.length >= 4) {
    // 颈线：过左/右颈谷的直线延长至图面全宽（clip 由 drawDrawings 统一处理）
    const [nl, nr] = [pts[1], pts[3]];
    const dx = nr.x - nl.x;
    if (dx !== 0) {
      const k = (nr.y - nl.y) / dx;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, nl.y - k * nl.x);
      ctx.lineTo(dctx.geo.chartW, nl.y + k * (dctx.geo.chartW - nl.x));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

/** 三角形态：枢轴折线 + 上/下边界线向交点虚线延长（收敛交点在后、扩散交点在前） */
function drawTriangle(ctx: CanvasRenderingContext2D, d: Drawing, pts: readonly Pix[], dctx: DrawContext): void {
  drawZigzag(ctx, pts);
  const geom = triangleGeom(d.points);
  if (!geom?.apex) return;
  const apex = pointToPixel(geom.apex, dctx);
  ctx.setLineDash([6, 4]);
  // 上边界 P2→交点、下边界 P3→交点的虚线延长段
  for (const from of [pts[2], pts[3]]) {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(apex.x, apex.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

/** 形态家族渲染分发 */
export function drawPatterns(ctx: CanvasRenderingContext2D, d: Drawing, pts: readonly Pix[], dctx: DrawContext): void {
  switch (d.type) {
    case 'abc-pattern':
      drawZigzag(ctx, pts);
      break;
    case 'gartley':
    case 'bat':
    case 'butterfly':
    case 'crab':
      drawHarmonic(ctx, d, pts);
      break;
    case 'head-shoulders':
      drawHeadShoulders(ctx, d, pts, dctx, false);
      break;
    case 'head-shoulders-inverse':
      drawHeadShoulders(ctx, d, pts, dctx, true);
      break;
    case 'triangle-pattern':
    case 'triangle-expanding':
      drawTriangle(ctx, d, pts, dctx);
      break;
  }
}

/** 形态家族命中：折线段任一分段 ±6px；三角形态另含边界延长段 */
export function hitTestPatterns(d: Drawing, pts: readonly Pix[], dctx: DrawContext, x: number, y: number): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= 6) return true;
  }
  if (d.type === 'triangle-pattern' || d.type === 'triangle-expanding') {
    const geom = triangleGeom(d.points);
    if (geom?.apex && pts.length >= 4) {
      const apex = pointToPixel(geom.apex, dctx);
      for (const from of [pts[2], pts[3]]) {
        if (distToSegment(x, y, from.x, from.y, apex.x, apex.y) <= 6) return true;
      }
    }
  }
  return false;
}
