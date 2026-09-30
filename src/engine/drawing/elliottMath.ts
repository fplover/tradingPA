/** 艾略特波浪 5-3 标注（P2-B）：8 锚点 = 5 上（1-5）+ 3 下（a,b,c）。
 *  纯数据模块：标签序列与锚点数规则（折线即世界坐标连线，无额外几何计算）。 */

/** 8 锚点对应标签（按放置顺序：5 上 + 3 下） */
export const ELLIOTT_LABELS = ['1', '2', '3', '4', '5', 'a', 'b', 'c'] as const;

/** 需要的锚点数（5 上 + 3 下） */
export const ELLIOTT_POINTS = 8;

/** 第 i 个锚点的标注（越界返回空串） */
export function elliottLabelAt(i: number): string {
  return ELLIOTT_LABELS[i] ?? '';
}
