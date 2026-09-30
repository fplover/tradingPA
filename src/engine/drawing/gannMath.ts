/** 江恩工具纯几何（P2-B）：扇形比率族 / 射线边缘价 / 箱体分割比例。
 *  不依赖 canvas / DOM：渲染（gannRender）、命中测试（drawDrawings）、单测共用。
 *  角度口径（TV 同）：1x1 = 每 1 bar 上升「1 个可视价格单位」，
 *  可视价格单位 = 可视价格区间 / 可视 bar 数（随缩放重算，张角稳定）。 */

/** 扇形比率（TV 默认 7 档）：1x8 → 1x1 → 8x1 */
export const GANN_FAN_RATIOS = [0.125, 0.25, 0.5, 1, 2, 4, 8] as const;

/** 比率 → TV 标签：0.125 → '1x8'，1 → '1x1'，2 → '2x1' */
export function gannFanLabel(ratio: number): string {
  if (Math.abs(ratio - 1) < 1e-12) return '1x1';
  return ratio < 1 ? `1x${Math.round(1 / ratio)}` : `${Math.round(ratio)}x1`;
}

/** 扇形/江恩线射线边缘价：锚价 + 比率 × 每 bar 价差 × 到边缘的 bar 数 */
export function gannFanEdgePrice(anchorPrice: number, pricePerBar: number, barsToEdge: number, ratio: number): number {
  return anchorPrice + ratio * pricePerBar * barsToEdge;
}

/** 江恩箱四分位分割（TV Gann Box 默认按 1/4 分格） */
export const GANN_BOX_FRACTIONS = [0.25, 0.5, 0.75] as const;
