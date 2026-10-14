/** 画线几何原语：像素级纯函数，渲染 / 命中测试 / 数据窗口读数共用（无 canvas/DOM 依赖） */

/** 点到线段距离（线段外投影点 clamp 到端点） */
export function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** 射线末端像素：从 a 沿 a→b 方向延伸到画布边缘。左/右缘由 dx 符号决定
 *  （dx < 0 时 (chartW - x)/dx 为负、被 Math.max 钳成 0 会退化成点），
 *  dx === 0 的垂直射线保留原行为：延伸一个落点段。
 *  渲染（lineRender 的 ray 分支）与数值读取（drawingValues）共用，防两条末端口径各自漂移。 */
export function rayEndPix(
  a: { x: number; y: number },
  b: { x: number; y: number },
  chartW: number,
): { x: number; y: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const edgeX = dx >= 0 ? chartW : 0;
  const scale = dx === 0 ? 1 : (edgeX - a.x) / dx;
  return { x: a.x + dx * scale, y: a.y + dy * scale };
}
