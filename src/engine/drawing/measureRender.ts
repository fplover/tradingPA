/** 测量工具渲染 + 命中（P2-B）：点线主轴 + 端点圆点 + 中点上方浮层（bar 数/价差/百分比）。
 *  纯统计在 measureMath.ts；此处只做像素布局与 canvas 绘制。
 *  约定：调用方（drawOne）已设置 strokeStyle/fillStyle/lineWidth/font/textBaseline。 */
import type { Drawing } from './types';
import type { BarSeries } from '@/data/BarSeries';
import { distToSegment } from './geom';
import { theme, TV_FONT } from '../theme';
import { measureTextWidth } from './textMath';
import { measureLabelLines, measureStats } from './measureMath';

type Pix = { x: number; y: number };

/** 浮层版式：3 行 10px 文字，行高 13，内边距 6/4（渲染与命中共用同一套布局口径） */
function boxLayout(lines: readonly string[], a: Pix, b: Pix, widthOf: (s: string) => number) {
  const lh = 13;
  const w = Math.max(...lines.map(widthOf)) + 12;
  const h = lines.length * lh + 8;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const bx = mx - w / 2;
  // 线上方放不下（越出面板顶）时落到线下方
  const by = my - h - 6 >= 0 ? my - h - 6 : my + 6;
  return { bx, by, w, h, lh };
}

/** 测量渲染：临时对象的浮层标签（Esc 取消由手势层负责） */
export function drawMeasure(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  pts: Pix[],
  series: BarSeries,
  decimals: number,
): void {
  if (pts.length < 2) return;
  const [a, b] = pts;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const p of [a, b]) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const lines = measureLabelLines(measureStats(d.points[0], d.points[1], series), decimals);
  const { bx, by, w, h, lh } = boxLayout(lines, a, b, (s) => ctx.measureText(s).width);
  ctx.fillStyle = theme.infoLabelBg;
  ctx.fillRect(bx, by, w, h);
  ctx.font = `10px ${TV_FONT}`;
  ctx.textAlign = 'left';
  lines.forEach((l, i) => {
    ctx.fillStyle = i === 0 ? theme.axisText : l.startsWith('-') ? theme.down : theme.up;
    ctx.fillText(l, bx + 6, by + 4 + i * lh + lh / 2);
  });
}

/** 测量命中：主轴 ±6px 或浮层框内（估算宽度，外扩 4px） */
export function hitTestMeasure(drawing: Drawing, pts: Pix[], x: number, y: number, series: BarSeries): boolean {
  if (pts.length < 2) return false;
  const [a, b] = pts;
  if (distToSegment(x, y, a.x, a.y, b.x, b.y) <= 6) return true;
  const lines = measureLabelLines(measureStats(drawing.points[0], drawing.points[1], series), 2);
  const { bx, by, w, h } = boxLayout(lines, a, b, (s) => measureTextWidth(s, 10));
  return x >= bx - 4 && x <= bx + w + 4 && y >= by - 4 && y <= by + h + 4;
}
