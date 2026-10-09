/**
 * 斐波那契补尾纯几何（二期-C1）：fib 通道档位线、对数螺旋采样。
 * fib 通道：趋势线 P0→P1，第三点 P2 定基准通道宽度，各档通道 = 趋势线两端点
 * 平移 (P2-P0)×level（level=1 的通道恰好过 P2，与趋势线平行）。
 * fib 螺旋：对数螺旋 r(θ)=r0·e^(bθ)，黄金比率增长 b=ln(φ)/(π/2)——每转 90°
 * 半径 ×φ。**TV 简化口径**：TV 原生螺旋锚定与展开细节未公开，本实现以 P0 为
 * 中心、P0→P1 初始半径/角度，展开 2.5 圈；口径登记 OPEN-DECISIONS（二期-C）。
 * 螺旋在**像素空间**采样（几何上是圆族，世界坐标的 time/price 轴刻度不对称，
 * 世界空间采样会随缩放变形）——渲染与命中传像素坐标即可。
 */

import type { DrawingPoint } from './types';

/** fib 通道默认档位（level=1 为基准宽度档，恰过第三锚点） */
export const FIB_CHANNEL_LEVELS = [0.382, 0.618, 1, 1.618, 2.618] as const;

/** 黄金比率 φ */
export const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

/** 对数螺旋增长率：每转 90° 半径乘 φ */
export const SPIRAL_GROWTH = Math.log(GOLDEN_RATIO) / (Math.PI / 2);

/** 螺旋展开圈数 */
export const SPIRAL_TURNS = 2.5;

export interface ChannelLine {
  a: DrawingPoint;
  b: DrawingPoint;
}

/** 第 level 档通道线：趋势线两端点平移 (P2-P0)×level 后的线段 */
export function channelLineAt(p0: DrawingPoint, p1: DrawingPoint, p2: DrawingPoint, level: number): ChannelLine {
  const dx = (p2.time - p0.time) * level;
  const dy = (p2.price - p0.price) * level;
  return {
    a: { time: p0.time + dx, price: p0.price + dy },
    b: { time: p1.time + dx, price: p1.price + dy },
  };
}

export interface Pix {
  x: number;
  y: number;
}

/** 对数螺旋采样折线（像素空间）：中心 (cx,cy)，初始点 (x1,y1)，展开 SPIRAL_TURNS 圈 */
export function spiralSamples(cx: number, cy: number, x1: number, y1: number, steps = 240): Pix[] {
  const r0 = Math.hypot(x1 - cx, y1 - cy);
  if (r0 === 0) return [];
  const theta0 = Math.atan2(y1 - cy, x1 - cx);
  const out: Pix[] = [];
  const total = SPIRAL_TURNS * Math.PI * 2;
  for (let i = 0; i <= steps; i++) {
    const theta = (total * i) / steps;
    const r = r0 * Math.exp(SPIRAL_GROWTH * theta);
    out.push({ x: cx + r * Math.cos(theta0 + theta), y: cy + r * Math.sin(theta0 + theta) });
  }
  return out;
}
