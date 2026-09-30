/** 多边形工具态顶点编辑（P2-B 遗留接线）：TV 式「工具态点击边插入顶点 /
 *  点击顶点删除（≥3 约束）」的命中判定与几何运算。纯函数不持状态：
 *  像素域命中（顶点优先于边——角落处两者皆命中，删优先于插），世界域应用。
 *  磁吸两档由调用方经 pixelToPoint 既有链路换算后注入（仅 insert 使用）。 */
import type { DrawingPoint } from './types';
import { insertPolygonVertex, polygonEdgeHit, removePolygonVertex, type Pix } from './shapeMath';

/** 顶点命中半径（与画线手柄 7px 一致） */
export const POLY_VERTEX_HIT_PX = 7;
/** 边命中容差（与 hitTestShapes 多边形边 ±6px 一致） */
export const POLY_EDGE_HIT_PX = 6;

/** 顶点编辑动作：insert 插到边之后 / remove 删顶点 / reject 低于 3 顶点下限（保持原状） */
export type PolygonEdit =
  | { kind: 'insert'; afterIndex: number; pt: DrawingPoint }
  | { kind: 'remove'; index: number }
  | { kind: 'reject' };

/**
 * 顶点编辑命中判定：先顶点（半径 POLY_VERTEX_HIT_PX）后边（容差 POLY_EDGE_HIT_PX）。
 * points 为世界坐标（顶点数下限判定用），pix 为对应像素坐标（几何命中用），
 * pt 为调用方按当前磁吸档位换算的落点世界坐标。
 * 返回 null = 边/顶点均未命中（调用方照常累积新多边形放置）。
 */
export function polygonEditHit(
  points: readonly DrawingPoint[],
  pix: readonly Pix[],
  px: number,
  py: number,
  pt: DrawingPoint,
): PolygonEdit | null {
  for (let i = 0; i < pix.length; i++) {
    if (Math.hypot(px - pix[i].x, py - pix[i].y) > POLY_VERTEX_HIT_PX) continue;
    // 顶点数 ≤3：删除会使多边形退化成线段，拒绝并保持原状
    return points.length <= 3 ? { kind: 'reject' } : { kind: 'remove', index: i };
  }
  const edge = polygonEdgeHit(pix, px, py, POLY_EDGE_HIT_PX);
  return edge < 0 ? null : { kind: 'insert', afterIndex: edge, pt };
}

/** 应用顶点编辑（insert/remove；reject 不产生新坐标，由调用方保持原状） */
export function applyPolygonEdit(points: readonly DrawingPoint[], edit: Exclude<PolygonEdit, { kind: 'reject' }>): DrawingPoint[] {
  return edit.kind === 'insert'
    ? insertPolygonVertex(points, edit.afterIndex, edit.pt)
    : removePolygonVertex(points, edit.index);
}
