/** 几何类工具纯几何（P2-B）：多边形顶点运算 / 三点定圆 / 三次贝塞尔采样。
 *  不依赖 canvas / DOM：渲染（shapeRender）、命中测试（drawDrawings）、单测共用。
 *  全部为像素域坐标（世界坐标 → 像素的换算在 coords.ts）。 */

export interface Pix {
  x: number;
  y: number;
}

/** 多边形：射线法判断点是否在多边形内（顶点按序，隐式闭合最后一条边） */
export function pointInPolygon(x: number, y: number, pts: readonly Pix[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 多边形：命中边（闭合）返回该边起点下标 i（新顶点插到 i 之后）；未命中 -1 */
export function polygonEdgeHit(pts: readonly Pix[], x: number, y: number, tol = 6): number {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (segDist(x, y, a.x, a.y, b.x, b.y) <= tol) return i;
  }
  return -1;
}

function segDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** 插入顶点：afterIndex 之后插入（越界下标夹到末尾） */
export function insertPolygonVertex(pts: readonly Pix[], afterIndex: number, pt: Pix): Pix[] {
  const at = Math.max(0, Math.min(afterIndex + 1, pts.length));
  return [...pts.slice(0, at), { ...pt }, ...pts.slice(at)];
}

/** 删除顶点：少于 3 个顶点时不再删（多边形退化成线段，返回原数组） */
export function removePolygonVertex(pts: readonly Pix[], index: number): Pix[] {
  if (pts.length <= 3 || index < 0 || index >= pts.length) return [...pts];
  return pts.filter((_, i) => i !== index);
}

export interface ArcGeom {
  cx: number;
  cy: number;
  r: number;
  /** 起始角（弧度，canvas 坐标系：0 = +x，正角朝 +y） */
  a0: number;
  /** 有向扫掠角：正 = 增角方向，负 = 减角方向（经过第 3 点的那段弧） */
  sweep: number;
}

function normAngle(a: number): number {
  let x = a % (Math.PI * 2);
  if (x < 0) x += Math.PI * 2;
  return x;
}

/**
 * 三点定圆（像素域）：第 1/2 点为弧端点，第 3 点为弧上一点。
 * 共线（半径无穷）或端点重合时返回 null，调用方退化为直线。
 * 扫掠方向取「经过第 3 点」的那段：第 3 点落在增角路径上则 sweep > 0，否则 < 0。
 */
export function arcThroughThreePoints(p0: Pix, p1: Pix, p2: Pix): ArcGeom | null {
  const d = 2 * (p0.x * (p1.y - p2.y) + p1.x * (p2.y - p0.y) + p2.x * (p0.y - p1.y));
  if (Math.abs(d) < 1e-12) return null; // 三点共线
  const s0 = p0.x * p0.x + p0.y * p0.y;
  const s1 = p1.x * p1.x + p1.y * p1.y;
  const s2 = p2.x * p2.x + p2.y * p2.y;
  const cx = (s0 * (p1.y - p2.y) + s1 * (p2.y - p0.y) + s2 * (p0.y - p1.y)) / d;
  const cy = (s0 * (p2.x - p1.x) + s1 * (p0.x - p2.x) + s2 * (p1.x - p0.x)) / d;
  const r = Math.hypot(p0.x - cx, p0.y - cy);
  if (r < 1e-9) return null; // 端点与圆心重合
  const a0 = Math.atan2(p0.y - cy, p0.x - cx);
  const a1 = Math.atan2(p1.y - cy, p1.x - cx);
  const a2 = Math.atan2(p2.y - cy, p2.x - cx);
  const ccwSpan = normAngle(a1 - a0);
  if (ccwSpan < 1e-12) return null; // 两端点同向（重合）
  const a2ccw = normAngle(a2 - a0);
  const sweep = a2ccw <= ccwSpan ? ccwSpan : ccwSpan - Math.PI * 2;
  return { cx, cy, r, a0, sweep };
}

/** 弧采样折线（命中判定用）：沿有向扫掠角均匀取 segments+1 个点 */
export function sampleArc(arc: ArcGeom, segments = 32): Pix[] {
  const out: Pix[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = arc.a0 + (arc.sweep * i) / segments;
    out.push({ x: arc.cx + arc.r * Math.cos(t), y: arc.cy + arc.r * Math.sin(t) });
  }
  return out;
}

/** 三次贝塞尔点（标准公式）：锚点 p0/p1 + 控制柄 c0/c1 */
export function cubicBezierPoint(p0: Pix, c0: Pix, c1: Pix, p1: Pix, t: number): Pix {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * c0.x + c * c1.x + d * p1.x, y: a * p0.y + b * c0.y + c * c1.y + d * p1.y };
}

/** 贝塞尔采样折线（命中判定用）：t ∈ [0,1] 取 segments+1 个点 */
export function sampleCubicBezier(p0: Pix, c0: Pix, c1: Pix, p1: Pix, segments = 32): Pix[] {
  const out: Pix[] = [];
  for (let i = 0; i <= segments; i++) out.push(cubicBezierPoint(p0, c0, c1, p1, i / segments));
  return out;
}
