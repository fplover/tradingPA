/** 艾略特波浪渲染 + 命中（P2-B）：8 锚点折线 + 1-5 / a-b-c 标注。
 *  标签序列在 elliottMath.ts；此处只做像素几何与 canvas 绘制。
 *  约定：调用方（drawOne）已设置 strokeStyle/fillStyle/lineWidth。 */
import { distToSegment } from './geom';
import { theme, TV_FONT } from '../theme';
import { elliottLabelAt } from './elliottMath';
import type { Pix } from './shapeMath';

/** 波浪渲染：按放置顺序连线（放置中不足 8 点也画已落点部分），每点右上方标注 */
export function drawElliott(ctx: CanvasRenderingContext2D, pts: Pix[]): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.font = `10px ${TV_FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = theme.axisText;
  pts.forEach((p, i) => ctx.fillText(elliottLabelAt(i), p.x + 5, p.y - 5));
}

/** 波浪命中（body 级；手柄由调用方优先判定）：任一分段 ±6px */
export function hitTestElliott(pts: readonly Pix[], x: number, y: number): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= 6) return true;
  }
  return false;
}
