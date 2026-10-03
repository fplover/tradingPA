/** 江恩工具渲染 + 命中（P2-B）：扇形（7 档角度线族）/ 江恩线（1x1）/ 江恩箱（四分格 + 对角线）。
 *  纯比率换算在 gannMath.ts；此处只做像素几何与 canvas 绘制。
 *  约定：调用方（drawOne）已设置 strokeStyle/fillStyle/lineWidth/setLineDash。 */
import type { Drawing } from './types';
import { distToSegment } from './geom';
import { theme, TV_FONT } from '../theme';
import { GANN_BOX_FRACTIONS, GANN_FAN_RATIOS, gannFanEdgePrice, gannFanLabel } from './gannMath';
import type { DrawContext } from './coords';
import { PALETTE } from '@/engine/palette';

type Pix = { x: number; y: number };

function strokeLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function levelLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign): void {
  ctx.font = `10px ${TV_FONT}`;
  ctx.textAlign = align;
  ctx.fillStyle = theme.axisText;
  ctx.fillText(text, x, y);
}

/** 可视价格单位（每 bar）：可视价格区间 / 可视 bar 数；无波动退化为 0（射线水平） */
function pricePerBar(dctx: DrawContext): number {
  const from = dctx.viewport.first;
  const to = dctx.viewport.xToIndex(dctx.geo.chartW);
  const bars = Math.max(1, to - from);
  const { min, max } = dctx.priceScale.range;
  return (max - min) / bars;
}

/** 扇形/江恩线射线末端像素：锚点沿比率斜率延伸到画布右缘（趋势方向决定左右缘） */
function rayEnd(p0: { time: number; price: number }, ratio: number, dctx: DrawContext): Pix {
  const edgeX = dctx.geo.chartW;
  const anchorIdx = dctx.series.fractionalIndexAt(p0.time);
  const barsToEdge = dctx.viewport.xToIndex(edgeX) - anchorIdx;
  const price = gannFanEdgePrice(p0.price, pricePerBar(dctx), barsToEdge, ratio);
  return { x: edgeX, y: dctx.priceScale.priceToY(price) };
}

/** 江恩箱像素矩形（两锚点对角） */
function boxRect(pts: readonly Pix[]): { minX: number; maxX: number; minY: number; maxY: number } {
  const [a, b] = pts;
  return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) };
}

/** 江恩家族渲染分发（3 件） */
export function drawGann(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pix[], dctx: DrawContext): void {
  switch (d.type) {
    case 'gann-fan': {
      if (pts.length < 1) return;
      for (const ratio of GANN_FAN_RATIOS) {
        const end = rayEnd(d.points[0], ratio, dctx);
        strokeLine(ctx, pts[0].x, pts[0].y, end.x, end.y);
        const fromRight = end.x >= pts[0].x;
        levelLabel(ctx, gannFanLabel(ratio), fromRight ? end.x - 4 : end.x + 4, end.y, fromRight ? 'right' : 'left');
      }
      break;
    }
    case 'gann-line': {
      if (pts.length < 1) return;
      const end = rayEnd(d.points[0], 1, dctx);
      strokeLine(ctx, pts[0].x, pts[0].y, end.x, end.y);
      levelLabel(ctx, '1x1', end.x - 4, end.y, 'right');
      break;
    }
    case 'gann-box': {
      if (pts.length < 2) return;
      const { minX, maxX, minY, maxY } = boxRect(pts);
      ctx.fillStyle = d.style.fillColor ?? PALETTE.gray22;
      ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
      ctx.strokeRect(minX + 0.5, minY + 0.5, maxX - minX - 1, maxY - minY - 1);
      for (const f of GANN_BOX_FRACTIONS) {
        const gx = Math.round(minX + (maxX - minX) * f) + 0.5;
        strokeLine(ctx, gx, minY, gx, maxY);
        const gy = Math.round(minY + (maxY - minY) * f) + 0.5;
        strokeLine(ctx, minX, gy, maxX, gy);
      }
      strokeLine(ctx, minX, minY, maxX, maxY); // 1x1 对角线
      strokeLine(ctx, minX, maxY, maxX, minY); // 反对角线
      break;
    }
  }
}

/** 江恩家族命中（body 级；手柄由调用方优先判定）：扇形/江恩线 = 各射线 ±6px；箱体 = 框内或任一格线 ±6px */
export function hitTestGann(drawing: Drawing, pts: Pix[], x: number, y: number, dctx: DrawContext): boolean {
  switch (drawing.type) {
    case 'gann-fan': {
      if (pts.length < 1) return false;
      for (const ratio of GANN_FAN_RATIOS) {
        const end = rayEnd(drawing.points[0], ratio, dctx);
        if (distToSegment(x, y, pts[0].x, pts[0].y, end.x, end.y) <= 6) return true;
      }
      return false;
    }
    case 'gann-line': {
      if (pts.length < 1) return false;
      const end = rayEnd(drawing.points[0], 1, dctx);
      return distToSegment(x, y, pts[0].x, pts[0].y, end.x, end.y) <= 6;
    }
    case 'gann-box': {
      if (pts.length < 2) return false;
      const { minX, maxX, minY, maxY } = boxRect(pts);
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) return true;
      const lines: Array<[number, number, number, number]> = [
        [minX, minY, maxX, minY],
        [minX, maxY, maxX, maxY],
        [minX, minY, minX, maxY],
        [maxX, minY, maxX, maxY],
        [minX, minY, maxX, maxY],
        [minX, maxY, maxX, minY],
      ];
      for (const f of GANN_BOX_FRACTIONS) {
        lines.push([minX + (maxX - minX) * f, minY, minX + (maxX - minX) * f, maxY]);
        lines.push([minX, minY + (maxY - minY) * f, maxX, minY + (maxY - minY) * f]);
      }
      return lines.some(([x1, y1, x2, y2]) => distToSegment(x, y, x1, y1, x2, y2) <= 6);
    }
    default:
      return false;
  }
}
