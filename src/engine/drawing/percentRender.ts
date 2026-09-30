/** 百分比线渲染 + 命中：两点 → 八分法水平线组（12.5%…87.5%）+ 右端「百分比 价格」标签。
 *  纯档位计算在 percentMath.ts；此处只做像素几何与 canvas 绘制。
 *  线长与标签策略直接复用 fib 家族（fibMath.fibLevelEndX + fibRender.drawLevelLabel），
 *  与回撤/扩展完全一致的观感：末端 = 最右锚点 + 一个锚点摆幅（最短 24px，钳制在画布内）。
 *  约定：调用方（drawOne）已设置 strokeStyle/fillStyle/lineWidth/setLineDash。 */
import type { Drawing } from './types';
import type { DrawContext } from './drawDrawings';
import { distToSegment } from './geom';
import { strokeLine } from './drawingChrome';
import { drawLevelLabel } from './fibRender';
import { fibLevelEndX } from './fibMath';
import { PERCENT_LEVELS, percentLevelLabel, percentPrice } from './percentMath';

type Pix = { x: number; y: number };

/** 百分比水平组：7 条八分法水平线 + 右端「百分比 价格」标签（末端与 fib 回撤同规则） */
export function drawPercentLine(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pix[], dctx: DrawContext, decimals: number): void {
  if (pts.length < 2) return;
  const [p0, p1] = d.points;
  const x0 = Math.min(pts[0].x, pts[1].x);
  const endX = fibLevelEndX(x0, Math.max(pts[0].x, pts[1].x), dctx.geo.chartW);
  for (const lv of PERCENT_LEVELS) {
    const price = percentPrice(p0.price, p1.price, lv);
    const y = Math.round(dctx.priceScale.priceToY(price)) + 0.5;
    strokeLine(ctx, x0, y, endX, y);
    drawLevelLabel(ctx, percentLevelLabel(lv, price, decimals), endX, y, dctx.geo.chartW);
  }
}

/** 百分比线命中测试（body 级；手柄由调用方优先判定）。
 *  回撤式规则：锚线 ±6px + 各水平线 ±6px；水平线末端与渲染一致（同一 fibLevelEndX）。 */
export function hitTestPercentLine(drawing: Drawing, pts: Pix[], x: number, y: number, dctx: DrawContext): boolean {
  if (pts.length < 2) return false;
  if (distToSegment(x, y, pts[0].x, pts[0].y, pts[1].x, pts[1].y) <= 6) return true;
  const x0 = Math.min(pts[0].x, pts[1].x);
  const endX = fibLevelEndX(x0, Math.max(pts[0].x, pts[1].x), dctx.geo.chartW); // 与渲染同末端
  const p0 = drawing.points[0].price;
  const p1 = drawing.points[1].price;
  for (const lv of PERCENT_LEVELS) {
    const ly = dctx.priceScale.priceToY(percentPrice(p0, p1, lv));
    if (distToSegment(x, y, x0, ly, endX, ly) <= 6) return true;
  }
  return false;
}
