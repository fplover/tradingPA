/** 百分比线纯几何（TV 无同名原生工具，取中文行情软件经典语义）：
 *  两点落点（与 fib 回撤同构），按价格区间八分法画水平线组。
 *  不依赖 canvas / DOM：渲染（percentRender）、命中测试（drawDrawings）、单测共用。 */

/** 八分法档位（不含 0% 与 100%：两端即锚点价，组内只画 7 个内档） */
export const PERCENT_LEVELS = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875] as const;

/** 档位价格：p0 + (p1 - p0) × 档位（与 fib 回撤同公式；12.5% = 起点 + 1/8 价差）。
 *  p0=100, p1=110 → 12.5% 档 = 101.25；下跌段（p1 < p0）档位价递减，符号天然延续。 */
export function percentPrice(p0Price: number, p1Price: number, level: number): number {
  return p0Price + (p1Price - p0Price) * level;
}

/** 右端标签文本：「百分比 价格」（与 fib 回撤标签同款口径，如 '12.5% 101.25'） */
export function percentLevelLabel(level: number, price: number, decimals: number): string {
  return `${(level * 100).toFixed(1)}% ${price.toFixed(decimals)}`;
}
