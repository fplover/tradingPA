/**
 * 形态家族纯几何（二期-C1）：XABCD 谐波比率校验、头肩顶底有效性、三角形态边界与交点。
 *
 * 口径约定：
 * - 谐波腿长比以**价格幅度**计（TV 比率标签同口径——回撤/扩展衡量的是价格深度，
 *   与时间跨度无关），取绝对值，方向（看涨/看跌形态）不影响校验。
 * - 比率区间取经典谐波交易文献的公认定义（Carney, *Harmonic Trading*）：
 *   Gartley D=0.786XA / Bat D=0.886XA / Butterfly D=1.27-1.618XA / Crab D=1.618XA，
 *   B/C 腿按各形态的书本区间放宽为「可校验带」，落在带内即 ok。
 * - 坐标为世界坐标（time+price）；三角形交点在同一坐标系求解（时间轴为自变量，
 *   竖直边界（t 相等）不构成交点，返回 null 由渲染层降级为平行通道）。
 */

import type { DrawingPoint } from './types';

export type HarmonicKind = 'gartley' | 'bat' | 'butterfly' | 'crab';

/** 谐波形态锚点标签（放置顺序 X→A→B→C→D） */
export const HARMONIC_LABELS = ['X', 'A', 'B', 'C', 'D'] as const;

/** 各形态四腿的合法比率带 [min, max]（腿比分子/分母见 harmonicLegRatios） */
export const HARMONIC_RANGES: Record<HarmonicKind, Record<'ab' | 'bc' | 'cd' | 'ad', [number, number]>> = {
  gartley: { ab: [0.382, 0.886], bc: [0.382, 0.886], cd: [1.13, 1.618], ad: [0.74, 0.82] },
  bat: { ab: [0.382, 0.5], bc: [0.382, 0.886], cd: [1.618, 2.618], ad: [0.86, 0.92] },
  butterfly: { ab: [0.75, 0.83], bc: [0.382, 0.886], cd: [1.618, 2.24], ad: [1.27, 1.618] },
  crab: { ab: [0.382, 0.618], bc: [0.382, 0.886], cd: [2.0, 3.618], ad: [1.5, 1.75] },
};

export interface HarmonicCheck {
  leg: string;
  value: number;
  range: [number, number];
  ok: boolean;
}

/** 四腿价格幅度比：AB/XA、BC/AB、CD/BC、AD/XA（分母 0 视为非法 → value=Infinity） */
export function harmonicLegRatios(pts: readonly DrawingPoint[]): Record<'ab' | 'bc' | 'cd' | 'ad', number> {
  const p = (i: number) => pts[i]?.price ?? 0;
  const xa = Math.abs(p(1) - p(0));
  const ab = Math.abs(p(2) - p(1));
  const bc = Math.abs(p(3) - p(2));
  const cd = Math.abs(p(4) - p(3));
  const ad = Math.abs(p(4) - p(1));
  const div = (n: number, d: number) => (d === 0 ? Infinity : n / d);
  return { ab: div(ab, xa), bc: div(bc, ab), cd: div(cd, bc), ad: div(ad, xa) };
}

/** 逐腿校验：value 是否落在该形态的公认带内（渲染层据此给比率标签着色） */
export function harmonicCheck(kind: HarmonicKind, pts: readonly DrawingPoint[]): HarmonicCheck[] {
  const r = harmonicLegRatios(pts);
  const ranges = HARMONIC_RANGES[kind];
  const defs: Array<{ leg: string; key: 'ab' | 'bc' | 'cd' | 'ad' }> = [
    { leg: 'AB/XA', key: 'ab' },
    { leg: 'BC/AB', key: 'bc' },
    { leg: 'CD/BC', key: 'cd' },
    { leg: 'AD/XA', key: 'ad' },
  ];
  return defs.map(({ leg, key }) => {
    const range = ranges[key];
    const value = r[key];
    return { leg, value, range, ok: Number.isFinite(value) && value >= range[0] && value <= range[1] };
  });
}

/** 头肩形态有效性（5 锚点 [左肩, 左颈, 头, 右颈, 右肩]）：
 *  顶 = 头为最高且两颈谷低于双肩；底镜像。不足 5 点返回 false（放置中）。 */
export function headShouldersValid(pts: readonly DrawingPoint[], inverse: boolean): boolean {
  if (pts.length < 5) return false;
  const [ls, nl, head, nr, rs] = pts.map((p) => p.price);
  const shoulderMax = Math.max(ls, rs);
  const shoulderMin = Math.min(ls, rs);
  const neckMax = Math.max(nl, nr);
  const neckMin = Math.min(nl, nr);
  return inverse ? head < shoulderMin && neckMin > shoulderMax : head > shoulderMax && neckMax < shoulderMin;
}

export interface BoundaryLine {
  from: DrawingPoint;
  to: DrawingPoint;
}

export interface TriangleGeom {
  /** 上边界（经 P0、P2）与下边界（经 P1、P3） */
  upper: BoundaryLine;
  lower: BoundaryLine;
  /** 两边界延长线交点（收敛=未来、扩散=过去）；平行/竖直返回 null */
  apex: DrawingPoint | null;
}

/**
 * 三角形态几何（5 锚点交替枢轴 [高,低,高,低,末枢轴]）：
 * 上边界过 P0-P2、下边界过 P1-P3，两线延长求交得顶点。
 * 收敛形态顶点在末枢轴之后（未来），扩散形态在首枢轴之前（过去）——
 * 本函数只负责几何，方向语义由调用方按工具区分。
 */
export function triangleGeom(pts: readonly DrawingPoint[]): TriangleGeom | null {
  if (pts.length < 4) return null;
  const upper = { from: pts[0], to: pts[2] };
  const lower = { from: pts[1], to: pts[3] };
  return { upper, lower, apex: lineIntersection(upper, lower) };
}

/** 两直线交点（时间轴自变量）：dt 为 0（竖直）或斜率相等（平行）→ null */
export function lineIntersection(l1: BoundaryLine, l2: BoundaryLine): DrawingPoint | null {
  const dt1 = l1.to.time - l1.from.time;
  const dt2 = l2.to.time - l2.from.time;
  if (dt1 === 0 || dt2 === 0) return null;
  const k1 = (l1.to.price - l1.from.price) / dt1;
  const k2 = (l2.to.price - l2.from.price) / dt2;
  if (k1 === k2) return null;
  const time = (l2.from.price - l1.from.price + k1 * l1.from.time - k2 * l2.from.time) / (k1 - k2);
  return { time, price: l1.from.price + k1 * (time - l1.from.time) };
}
