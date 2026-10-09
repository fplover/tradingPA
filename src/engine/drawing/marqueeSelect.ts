/**
 * Marquee 框选多选（二期-C2）：Shift+左键空白拖拽画选框，松柄时选中包围盒
 * 与选框相交的全部可见画线。
 * 命中口径（简化，登记 OPEN-DECISIONS）：锚点像素包围盒 ±8px 外扩；
 * hline / vline 特例为全宽/全高条带（锚点仅一个，线体横贯图面）。
 * 纯函数无宿主依赖，可单测。
 */

import type { Drawing } from './types';
import { pointToPixel, type DrawContext } from './coords';

export interface MarqueeRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 单个画线的像素包围盒（锚点外扩 ±8；hline/vline 全宽/全高条带） */
export function drawingBBox(d: Drawing, dctx: DrawContext, chartW: number, chartH: number): Box {
  const pad = 8;
  if (d.type === 'hline') {
    const y = pointToPixel(d.points[0], dctx).y;
    return { minX: 0, minY: y - 6, maxX: chartW, maxY: y + 6 };
  }
  if (d.type === 'vline') {
    const x = pointToPixel(d.points[0], dctx).x;
    return { minX: x - 6, minY: 0, maxX: x + 6, maxY: chartH };
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of d.points) {
    const px = pointToPixel(p, dctx);
    minX = Math.min(minX, px.x);
    maxX = Math.max(maxX, px.x);
    minY = Math.min(minY, px.y);
    maxY = Math.max(maxY, px.y);
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/** 两矩形（轴对齐）是否相交（相切不算） */
function intersects(a: Box, b: Box): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

/** 框选命中集合：可见画线中包围盒与选框相交者（id 列表，图层顺序）。
 *  零宽/零高选框（单击）返回空——单击语义归 deselect，不框选。 */
export function marqueeSelectIds(
  drawings: readonly Drawing[],
  rect: MarqueeRect,
  dctx: DrawContext,
  chartW: number,
  chartH: number,
): string[] {
  const box: Box = {
    minX: Math.min(rect.x0, rect.x1),
    minY: Math.min(rect.y0, rect.y1),
    maxX: Math.max(rect.x0, rect.x1),
    maxY: Math.max(rect.y0, rect.y1),
  };
  if (box.minX >= box.maxX || box.minY >= box.maxY) return [];
  const out: string[] = [];
  for (const d of drawings) {
    if (!d.visible) continue;
    if (intersects(box, drawingBBox(d, dctx, chartW, chartH))) out.push(d.id);
  }
  return out;
}
