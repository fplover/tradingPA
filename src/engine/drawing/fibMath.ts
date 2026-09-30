/** 斐波那契家族纯几何计算（B6）：比率常量 + 锚点 → 价位/时间/角度换算。
 *  不依赖 canvas / DOM：渲染（fibRender）、命中测试（drawDrawings）、单测共用。
 *  水平位价格公式与 TV 一致：回撤 price = p0 + (p1 - p0) × 比率；
 *  扩展 price = 枢轴(第3点) + (终点 - 起点) × 比率（向下趋势符号天然反转）。 */
import type { Bar } from '@/types/market';
import type { DrawingPoint } from './types';
import { distToSegment } from './geom';

/** 回撤比率（既有 fib 与 Auto Fib 共用；TV 默认 7 档） */
export const FIB_RETRACEMENT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
/** 扩展比率（TV Fib Extension 默认 9 档：0.236-1.0 回撤子档 + 1.272/1.618/2.618 扩展档） */
export const FIB_EXTENSION_LEVELS = [0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2.618] as const;
/** 扇形射线比率（TV 默认 3 条） */
export const FIB_FAN_LEVELS = [0.382, 0.5, 0.618] as const;
/** 弧线比率（TV 默认 3 条） */
export const FIB_ARC_LEVELS = [0.382, 0.5, 0.618] as const;
/** 时区数列长度上限：1,2,3,5,8,13,21,34,55,89,144,233… 前 25 项足够覆盖任意视口 */
export const FIB_ZONE_COUNT = 25;

/** 回撤比率价格：p0 + (p1 - p0) × 比率（0 = 起点价，1 = 终点价） */
export function fibRetracementPrice(p0Price: number, p1Price: number, ratio: number): number {
  return p0Price + (p1Price - p0Price) * ratio;
}

/**
 * 扩展比率价格：枢轴 + (终点 - 起点) × 比率。
 * 向上趋势（终点 > 起点）时比率线落在枢轴上方；向下趋势符号天然反转（与 TV 一致）。
 */
export function fibExtensionPrice(startPrice: number, endPrice: number, pivotPrice: number, ratio: number): number {
  return pivotPrice + (endPrice - startPrice) * ratio;
}

/**
 * 回撤/扩展水平线右端 x：锚点摆动幅度外再延一个摆动幅度（最短 24px），绝不超出画布。
 * TV 实测：水平比率线不一路延伸到画布右缘——末端落在最右锚点外侧一个摆幅处，
 * 标签贴末端右侧（空间不足时翻到左侧，见 fibRender 的 drawLevelLabel）。
 * 渲染（drawFibRetracement/drawFibExtension）与命中（hitTestFib）共用同一 endX，
 * 保证命中规则与线组一一对应。
 */
export function fibLevelEndX(x0: number, xLabel: number, chartW: number): number {
  const span = Math.max(xLabel - x0, 24);
  return Math.min(chartW, xLabel + span);
}

/**
 * 扇形射线在边缘时刻的价格：从起点出发、斜率 = 价格差 × 比率 / 时间差。
 * edgeTime 为画布边缘（左/右由趋势方向决定）对应的世界时间。
 */
export function fibFanEdgePrice(
  startPrice: number,
  endPrice: number,
  startTime: number,
  endTime: number,
  edgeTime: number,
  ratio: number,
): number {
  const span = endTime - startTime;
  if (span === 0) return startPrice;
  return startPrice + (endPrice - startPrice) * ratio * ((edgeTime - startTime) / span);
}

/**
 * 时区数列：1, 2, 3, 5, 8, 13, 21, 34, 55…（自第 3 项起每项 = 前两项之和）。
 * 返回前 count 个"间隔数"（单位：根 bar）。
 */
export function fibZoneOffsets(count: number): number[] {
  const out: number[] = [];
  let a = 1;
  let b = 2;
  for (let i = 0; i < count; i++) {
    out.push(a);
    const next = a + b;
    a = b;
    b = next;
  }
  return out;
}

/** 时区时间点：anchor + 数列 × bar 间隔 */
export function fibZoneTimes(anchorTime: number, interval: number, count: number): number[] {
  return fibZoneOffsets(count).map((n) => anchorTime + n * interval);
}

/**
 * 弧线扫掠象限（canvas 坐标系：0 = +x 右，PI/2 = +y 下）→ [起始角, 结束角]。
 * 圆心 = 第 1 锚点（p0）；按第 2 锚点（p1）相对圆心的方向取 90° 象限：
 * 右上 → [-π/2, 0]，右下 → [0, π/2]，左上 → [π, 3π/2]，左下 → [π/2, π]。
 */
export function fibArcAngles(p0: { x: number; y: number }, p1: { x: number; y: number }): [number, number] {
  const right = p1.x >= p0.x;
  const up = p1.y < p0.y;
  if (right && up) return [-Math.PI / 2, 0];
  if (right && !up) return [0, Math.PI / 2];
  if (!right && up) return [Math.PI, Math.PI * 1.5];
  return [Math.PI / 2, Math.PI];
}

/**
 * 弧线采样折线（命中判定用）：圆心 p0，半径 = 比率 × (|时间跨度|, |价格跨度|)，
 * 在扫掠象限内均匀取 segments+1 个点。渲染用原生 ctx.ellipse（平滑），
 * 命中以 24 段折线近似（弦误差 < 1px，命中与肉眼均不可辨）。
 */
export function fibArcPolyline(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  ratio: number,
  segments = 24,
): { x: number; y: number }[] {
  const rx = Math.abs(p1.x - p0.x) * ratio;
  const ry = Math.abs(p1.y - p0.y) * ratio;
  const [a0, a1] = fibArcAngles(p0, p1);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = a0 + ((a1 - a0) * i) / segments;
    out.push({ x: p0.x + rx * Math.cos(t), y: p0.y + ry * Math.sin(t) });
  }
  return out;
}

/**
 * 弧线命中：基线（两锚点连线，与渲染一致可命中）+ 任一比率弧距离 ≤ tol。
 * 椭圆弧无闭式解析距离，采用采样折线 + 点到线段距离（uniform 像素容差）；
 * 象限外天然不命中——折线只覆盖扫掠区间。锚点退化（时间/价格跨度为 0）时
 * 折线收敛为点/线段，distToSegment 自然处理。
 */
export function fibArcHit(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  x: number,
  y: number,
  tol = 6,
): boolean {
  if (distToSegment(x, y, p0.x, p0.y, p1.x, p1.y) <= tol) return true;
  for (const lv of FIB_ARC_LEVELS) {
    const poly = fibArcPolyline(p0, p1, lv);
    for (let i = 0; i < poly.length - 1; i++) {
      if (distToSegment(x, y, poly[i].x, poly[i].y, poly[i + 1].x, poly[i + 1].y) <= tol) return true;
    }
  }
  return false;
}

/**
 * Auto Fib 摆动检测：在可见 bar 区间 [from, to] 内找最高 high 与最低 low 两个 bar。
 * 返回按时间排序的 (start, end)：先出现的 swing 为起点（同时刻时高点在前，
 * 与 TV 手动放置的方向语义一致）。
 * 区间不足两根 bar、或全区间价格无波动（最高 = 最低，如一字板）时返回 null（不放置）。
 * 注：最高最低落在同一根 bar（大波动十字星）时仍构成有效 swing 对，允许放置。
 */
export function detectVisibleSwing(
  bars: readonly Bar[],
  from: number,
  to: number,
): { start: DrawingPoint; end: DrawingPoint } | null {
  if (bars.length === 0) return null;
  const lo = Math.max(0, Math.min(from, bars.length - 1));
  const hi = Math.max(0, Math.min(to, bars.length - 1));
  if (hi - lo < 1) return null;
  let highIdx = lo;
  let lowIdx = lo;
  for (let i = lo; i <= hi; i++) {
    if (bars[i].high > bars[highIdx].high) highIdx = i;
    if (bars[i].low < bars[lowIdx].low) lowIdx = i;
  }
  if (bars[highIdx].high === bars[lowIdx].low) return null; // 全区间无价格波动
  const highPoint = { time: bars[highIdx].time, price: bars[highIdx].high };
  const lowPoint = { time: bars[lowIdx].time, price: bars[lowIdx].low };
  // 按时间排序：先出现的 swing 为起点（同时刻时高点在前）
  const [start, end] = highPoint.time <= lowPoint.time ? [highPoint, lowPoint] : [lowPoint, highPoint];
  return { start, end };
}
