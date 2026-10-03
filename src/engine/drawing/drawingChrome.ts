/** 画线公共绘制原语（P2-B 自 drawDrawings.ts 拆出）：线段 / 轴标签 / 选中手柄。
 *  纯 canvas 绘制，无状态；供 drawDrawings 与各家族渲染模块共用。 */
import type { Drawing } from './types';
import { theme, TV_FONT } from '../theme';
import { pointToPixel, type DrawContext } from './coords';
import { PALETTE } from '@/engine/palette';

/** 线段（调用方已设置 strokeStyle/lineWidth/setLineDash） */
export function strokeLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** 10px 轴文字色标签（水平线价格 / 扇形比率标签等同款） */
export function axisLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  align: CanvasTextAlign,
): void {
  ctx.font = `10px ${TV_FONT}`;
  ctx.textAlign = align;
  ctx.fillStyle = theme.axisText;
  ctx.fillText(text, x, y);
}

/** 选中态手柄：白底 + 工具色描边小圆（每锚点一个） */
export function drawHandles(ctx: CanvasRenderingContext2D, d: Drawing, dctx: DrawContext): void {
  for (const p of d.points) {
    const { x, y } = pointToPixel(p, dctx);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.white;
    ctx.fill();
    ctx.strokeStyle = d.style.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
