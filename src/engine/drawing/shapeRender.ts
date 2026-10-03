/** 几何类工具渲染 + 命中（P2-B）：多边形（N 顶点闭合）/ 圆弧（三点定圆）/ 曲线（三次贝塞尔）。
 *  纯几何在 shapeMath.ts；此处只做像素几何与 canvas 绘制。
 *  约定：调用方（drawOne）已设置 strokeStyle/fillStyle/lineWidth/setLineDash。 */
import type { Drawing } from './types';
import { distToSegment } from './geom';
import { arcThroughThreePoints, pointInPolygon, sampleArc, sampleCubicBezier, type Pix } from './shapeMath';
import { PALETTE } from '@/engine/palette';

/** 折线描边（放置中预览/共线退化用） */
function strokePolyline(ctx: CanvasRenderingContext2D, pts: readonly Pix[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

/** 几何家族渲染分发（3 种） */
export function drawShapes(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pix[]): void {
  switch (d.type) {
    case 'polygon': {
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (pts.length >= 3) {
        ctx.closePath();
        ctx.fillStyle = d.style.fillColor ?? PALETTE.blue22;
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
    case 'arc': {
      if (pts.length < 2) return;
      const arc = pts.length >= 3 ? arcThroughThreePoints(pts[0], pts[1], pts[2]) : null;
      if (!arc) {
        strokePolyline(ctx, pts.slice(0, Math.min(pts.length, 3))); // 放置中/共线退化：弦
        return;
      }
      ctx.beginPath();
      ctx.ellipse(arc.cx, arc.cy, arc.r, arc.r, 0, arc.a0, arc.a0 + arc.sweep, arc.sweep < 0);
      ctx.stroke();
      break;
    }
    case 'curve': {
      if (pts.length < 2) return;
      if (pts.length < 4) {
        strokePolyline(ctx, pts); // 放置中：已落点折线预览
        return;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.bezierCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y);
      ctx.stroke();
      break;
    }
  }
}

/** 几何家族命中（body 级；手柄由调用方优先判定）。
 *  多边形 = 内部或任一边 ±6px（填充工具，与 rect 同规则）；弧/曲线 = 采样折线 ±6px。 */
export function hitTestShapes(drawing: Drawing, pts: Pix[], x: number, y: number): boolean {
  switch (drawing.type) {
    case 'polygon': {
      if (pts.length < 2) return false;
      if (pts.length >= 3 && pointInPolygon(x, y, pts)) return true;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if (distToSegment(x, y, a.x, a.y, b.x, b.y) <= 6) return true;
      }
      return false;
    }
    case 'arc': {
      if (pts.length < 3) {
        return pts.length >= 2 && distToSegment(x, y, pts[0].x, pts[0].y, pts[1].x, pts[1].y) <= 6;
      }
      const arc = arcThroughThreePoints(pts[0], pts[1], pts[2]);
      if (!arc) return distToSegment(x, y, pts[0].x, pts[0].y, pts[1].x, pts[1].y) <= 6;
      return hitPolyline(sampleArc(arc), x, y);
    }
    case 'curve': {
      if (pts.length < 4) {
        for (let i = 0; i < pts.length - 1; i++) {
          if (distToSegment(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= 6) return true;
        }
        return false;
      }
      return hitPolyline(sampleCubicBezier(pts[0], pts[1], pts[2], pts[3]), x, y);
    }
    default:
      return false;
  }
}

function hitPolyline(poly: readonly Pix[], x: number, y: number): boolean {
  for (let i = 0; i < poly.length - 1; i++) {
    if (distToSegment(x, y, poly[i].x, poly[i].y, poly[i + 1].x, poly[i + 1].y) <= 6) return true;
  }
  return false;
}
