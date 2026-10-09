/**
 * 斐波那契补尾渲染 + 命中（二期-C1）：fib 通道（平行通道组 + 档位标签）/
 * fib 螺旋（对数螺旋采样折线）。档位与采样几何在 fibTailMath.ts。
 * 螺旋在像素空间采样（几何为圆族，世界坐标 time/price 刻度不对称，见 fibTailMath）。
 * 约定：drawOne 已设置 strokeStyle/fillStyle/lineWidth/font。
 */

import { distToSegment } from './geom';
import { theme, TV_FONT } from '../theme';
import { channelLineAt, FIB_CHANNEL_LEVELS, spiralSamples } from './fibTailMath';
import { pointToPixel, type DrawContext } from './coords';
import type { Drawing } from './types';
import type { Pix } from './shapeMath';

/** fib 通道：趋势线 P0→P1 实线 + 各档平行通道线（右端档位标签，level=1 过第三锚点） */
export function drawFibChannel(ctx: CanvasRenderingContext2D, d: Drawing, dctx: DrawContext): void {
  if (d.points.length < 3) return;
  const levels = d.levels ?? [...FIB_CHANNEL_LEVELS];
  ctx.font = `10px ${TV_FONT}`;
  ctx.textAlign = 'left';
  for (const level of levels) {
    const line = channelLineAt(d.points[0], d.points[1], d.points[2], level);
    const a = pointToPixel(line.a, dctx);
    const b = pointToPixel(line.b, dctx);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = theme.axisText;
    ctx.fillText(String(level), b.x + 4, b.y - 4);
  }
}

/** fib 螺旋：P0 为中心，P0→P1 初始半径/角度，对数螺旋采样折线（像素空间） */
export function drawFibSpiral(ctx: CanvasRenderingContext2D, pts: readonly Pix[]): void {
  if (pts.length < 2) return;
  const samples = spiralSamples(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
  if (samples.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(samples[0].x, samples[0].y);
  for (const s of samples) ctx.lineTo(s.x, s.y);
  ctx.stroke();
}

/** fib 通道命中：基准趋势线 + 各档通道线段 ±6px */
export function hitTestFibChannel(d: Drawing, dctx: DrawContext, x: number, y: number): boolean {
  if (d.points.length < 3) return false;
  const levels = d.levels ?? [...FIB_CHANNEL_LEVELS];
  for (const level of levels) {
    const line = channelLineAt(d.points[0], d.points[1], d.points[2], level);
    const a = pointToPixel(line.a, dctx);
    const b = pointToPixel(line.b, dctx);
    if (distToSegment(x, y, a.x, a.y, b.x, b.y) <= 6) return true;
  }
  return false;
}

/** fib 螺旋命中：采样折线任一分段 ±6px */
export function hitTestFibSpiral(pts: readonly Pix[], x: number, y: number): boolean {
  if (pts.length < 2) return false;
  const samples = spiralSamples(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
  for (let i = 0; i < samples.length - 1; i++) {
    if (distToSegment(x, y, samples[i].x, samples[i].y, samples[i + 1].x, samples[i + 1].y) <= 6) return true;
  }
  return false;
}
