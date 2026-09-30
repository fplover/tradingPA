/** 百分比线纯几何（TV 无同名原生工具，取中文行情软件经典语义）：
 *  两点落点（与 fib 回撤同构），按价格区间画水平分割线组。
 *  不依赖 canvas / DOM：渲染（percentRender）、命中测试（drawDrawings）、单测共用。 */

/** 默认分割档位：经典百分比线形态——0% 与 100% 即两锚点价，50% 为中点（共 3 条）。
 *  用户自定义档位走 Drawing.levels（设置对话框「分割线」分区），此处仅作工具默认。 */
export const PERCENT_LEVELS = [0, 0.5, 1] as const;

/** 档位价格：p0 + (p1 - p0) × 档位（与 fib 回撤同公式；50% = 起点 + 1/2 价差）。
 *  p0=100, p1=110 → 50% 档 = 105；下跌段（p1 < p0）档位价递减，符号天然延续。 */
export function percentPrice(p0Price: number, p1Price: number, level: number): number {
  return p0Price + (p1Price - p0Price) * level;
}

/** 右端标签文本：「百分比 价格」（与 fib 回撤标签同款口径，如 '12.5% 101.25'） */
export function percentLevelLabel(level: number, price: number, decimals: number): string {
  return `${(level * 100).toFixed(1)}% ${price.toFixed(decimals)}`;
}
