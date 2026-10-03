/** 画线坐标换算：世界坐标 ↔ 面板局部像素 + 磁吸落点（纯函数，无 canvas 依赖） */
import type { DrawingPoint } from './types';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import type { BarSeries } from '@/data/BarSeries';
import type { DrawGeometry } from '../renderer/drawSeries';

export interface DrawContext {
  viewport: Viewport;
  priceScale: PriceScale;
  series: BarSeries;
  geo: DrawGeometry;
}

/** 世界坐标 → 面板局部像素（面板已 translate，y 为面板内坐标） */
export function pointToPixel(p: DrawingPoint, ctx: DrawContext): { x: number; y: number } {
  return {
    x: ctx.viewport.indexToX(ctx.series.fractionalIndexAt(p.time)),
    y: ctx.priceScale.priceToY(p.price),
  };
}

/** 磁吸模式：off 不吸附；weak 仅当吸附点在 50px 内生效；strong 始终吸附（TV 实测） */
export type MagnetMode = 'off' | 'weak' | 'strong';

/** Shift 约束：像素域按主导轴锁轴——|Δx| ≥ |Δy| 锁水平（价格固定），否则锁垂直（时间固定）。
 *  落点仍走 pixelToPoint 既有链路（磁吸两档生效）。 */
export function constrainPointPixel(
  anchor: DrawingPoint,
  px: number,
  py: number,
  ctx: DrawContext,
  magnet: MagnetMode,
): DrawingPoint {
  const a = pointToPixel(anchor, ctx);
  if (Math.abs(px - a.x) >= Math.abs(py - a.y)) return pixelToPoint(px, a.y, ctx, magnet);
  return pixelToPoint(a.x, py, ctx, magnet);
}

export function pixelToPoint(x: number, y: number, ctx: DrawContext, magnet: MagnetMode): DrawingPoint {
  const index = ctx.viewport.xToIndex(x);
  const roundIdx = Math.round(index);
  const bar = ctx.series.barAt(Math.max(0, Math.min(ctx.series.length - 1, roundIdx)));
  let time = bar ? bar.time : Date.now();
  if (bar && magnet === 'off') {
    // 未开磁吸也按 bar 对齐（index 制时间轴），但保留小数位置精度
    const exact = ctx.series.barAt(roundIdx);
    if (exact) {
      const iv = ctx.series.length > 1 ? (ctx.series.raw()[1]?.time ?? 0) - (ctx.series.raw()[0]?.time ?? 0) : 60_000;
      time = exact.time + (index - roundIdx) * iv;
    }
  }
  let price = ctx.priceScale.yToPrice(y);
  if (magnet !== 'off' && bar) {
    // 磁吸：就近吸附到 O/H/L/C
    const candidates = [bar.open, bar.high, bar.low, bar.close];
    const best = candidates.reduce((b, c) => (Math.abs(c - price) < Math.abs(b - price) ? c : b), candidates[0]);
    const snapY = ctx.priceScale.priceToY(best);
    if (magnet === 'strong' || Math.abs(snapY - y) <= 50) price = best;
  }
  return { time, price };
}
