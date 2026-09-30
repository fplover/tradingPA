/** 画线放置收尾规则（P2-B）：finishPlacing 提前收尾的最小落点数判定。
 *  多边形需 ≥3 顶点、艾略特波浪需 ≥2 锚点；其余工具（含 path 的两点击收尾，
 *  既有语义在 DrawingGesture.finishPlacing）返回 0 = 不提前收尾。
 *  纯函数无宿主依赖，供 ChartController.finishPlacing 调用，可单测。 */
import type { DrawingTypeId } from './types';

/** 提前收尾所需最小落点数（0 = 不走提前收尾，回落 DrawingGesture.finishPlacing 既有语义） */
export function earlyFinishMinPoints(tool: DrawingTypeId | null): number {
  if (tool === 'polygon') return 3;
  if (tool === 'elliott-wave') return 2;
  return 0;
}
