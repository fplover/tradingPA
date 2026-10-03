/** 文本/注记类工具渲染 + 命中（P2-B）：便签 / 价格标签 / 锚定文本 / 箭头标记。
 *  纯几何（框尺寸/宽度估算）在 textMath.ts；此处只做像素布局与 canvas 绘制。
 *  既有 text / info-line / arrow 自 drawDrawings.ts 迁入（拆分红线），行为逐字不变。
 *  约定：调用方（drawOne）已设置 strokeStyle/fillStyle/lineWidth/setLineDash/font/textBaseline。 */
import type { Drawing } from './types';
import { theme, TV_FONT } from '../theme';
import {
  arrowMarkBoxSize,
  estimatePriceChars,
  labelBoxSize,
  noteBoxSize,
  splitTextLines,
  textBoxSize,
} from './textMath';
import { PALETTE } from '@/engine/palette';

type Pix = { x: number; y: number };

function strokeLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** 便签：多行文本 + 背景框（左上角为锚点，TV 便签同款语义黄底深字） */
function drawNote(ctx: CanvasRenderingContext2D, d: Drawing, p: Pix): void {
  const fs = d.style.fontSize ?? 12;
  const lines = splitTextLines(d.style.text ?? '');
  const lineHeight = Math.round(fs * 1.4);
  const w = Math.max(40, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16);
  const h = lines.length * lineHeight + 12;
  ctx.fillStyle = d.style.fillColor ?? PALETTE.paleYellow;
  ctx.fillRect(p.x, p.y, w, h);
  ctx.fillStyle = d.style.color;
  ctx.textAlign = 'left';
  lines.forEach((l, i) => ctx.fillText(l, p.x + 8, p.y + 6 + i * lineHeight + lineHeight / 2));
}

/** 价格标签：锚定价格的价格注记（色底白字方牌，可选文本前缀） */
function drawPriceLabel(ctx: CanvasRenderingContext2D, d: Drawing, p: Pix, decimals: number): void {
  const fs = d.style.fontSize ?? 11;
  const prefix = d.style.text?.trim() ? `${d.style.text.trim()} ` : '';
  const content = `${prefix}${d.points[0].price.toFixed(decimals)}`;
  const w = ctx.measureText(content).width + 12;
  const h = fs + 8;
  ctx.fillStyle = d.style.color;
  ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
  ctx.fillStyle = theme.onAccent;
  ctx.textAlign = 'center';
  ctx.fillText(content, p.x, p.y);
}

/** 锚定文本：time+price 锚定的文本（锚点处画小圆点标记） */
function drawAnchoredText(ctx: CanvasRenderingContext2D, d: Drawing, p: Pix): void {
  const fs = d.style.fontSize ?? 12;
  const lines = splitTextLines(d.style.text ?? '');
  const lineHeight = Math.round(fs * 1.4);
  ctx.fillStyle = d.style.color;
  ctx.textAlign = 'left';
  lines.forEach((l, i) => ctx.fillText(l, p.x, p.y - ((lines.length - 1) * lineHeight) / 2 + i * lineHeight));
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
  ctx.fill();
}

/** 箭头标记：短箭杆 + 箭头 + 右侧短文本（单点放置） */
function drawArrowMark(ctx: CanvasRenderingContext2D, d: Drawing, p: Pix): void {
  strokeLine(ctx, p.x, p.y, p.x + 14, p.y);
  const size = 6;
  ctx.beginPath();
  ctx.moveTo(p.x + 14 + size, p.y);
  ctx.lineTo(p.x + 14, p.y - size * 0.6);
  ctx.lineTo(p.x + 14, p.y + size * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = d.style.color;
  ctx.textAlign = 'left';
  ctx.fillText(d.style.text ?? '', p.x + 24, p.y);
}

/** 末端箭头（既是有箭头工具也是箭头标记的公共图元） */
function arrowHead(ctx: CanvasRenderingContext2D, from: Pix, to: Pix, size: number): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle - 0.4), to.y - size * Math.sin(angle - 0.4));
  ctx.lineTo(to.x - size * Math.cos(angle + 0.4), to.y - size * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}

/** 文本家族渲染分发（4 种） */
export function drawTextFamily(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pix[], decimals: number): void {
  const p = pts[0];
  if (!p) return;
  switch (d.type) {
    case 'note':
      drawNote(ctx, d, p);
      break;
    case 'price-label':
      drawPriceLabel(ctx, d, p, decimals);
      break;
    case 'anchored-text':
      drawAnchoredText(ctx, d, p);
      break;
    case 'arrow-mark':
      drawArrowMark(ctx, d, p);
      break;
  }
}

/** 文本家族命中（body 级；手柄由调用方优先判定）。命中盒与渲染布局一一对应，外扩 4px。 */
export function hitTestTextFamily(drawing: Drawing, pts: Pix[], x: number, y: number): boolean {
  const p = pts[0];
  if (!p) return false;
  const fs = drawing.style.fontSize ?? 12;
  switch (drawing.type) {
    case 'note': {
      const { w, h } = noteBoxSize(splitTextLines(drawing.style.text ?? ''), fs);
      return x >= p.x - 4 && x <= p.x + w + 4 && y >= p.y - 4 && y <= p.y + h + 4;
    }
    case 'price-label': {
      const prefix = drawing.style.text?.trim() ? `${drawing.style.text.trim()} ` : '';
      const chars = prefix.length + estimatePriceChars(drawing.points[0].price);
      const { w, h } = labelBoxSize('x'.repeat(chars), fs);
      return x >= p.x - w / 2 - 4 && x <= p.x + w / 2 + 4 && y >= p.y - h / 2 - 4 && y <= p.y + h / 2 + 4;
    }
    case 'anchored-text': {
      const lines = splitTextLines(drawing.style.text ?? '');
      const lineHeight = Math.round(fs * 1.4);
      const { w, h } = textBoxSize(lines, fs);
      const top = p.y - ((lines.length - 1) * lineHeight) / 2 - lineHeight / 2;
      return x >= p.x - 4 && x <= p.x + w + 4 && y >= top - 4 && y <= top + h + 4;
    }
    case 'arrow-mark': {
      const { w, h } = arrowMarkBoxSize(drawing.style.text ?? '', fs);
      return x >= p.x - 4 && x <= p.x + w + 4 && y >= p.y - h / 2 - 4 && y <= p.y + h / 2 + 4;
    }
    default:
      return false;
  }
}

/** 既有 text 工具渲染（自 drawDrawings.ts 迁入，行为不变） */
export function drawPlainText(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pix[]): void {
  const p = pts[0];
  if (!p) return;
  ctx.fillStyle = d.style.color;
  ctx.textAlign = 'left';
  ctx.fillText(d.style.text ?? '', p.x, p.y);
}

/** 既有 arrow 工具渲染（自 drawDrawings.ts 迁入，行为不变）：连线 + 末端实心箭头 */
export function drawArrow(ctx: CanvasRenderingContext2D, pts: Pix[]): void {
  if (pts.length < 2) return;
  strokeLine(ctx, pts[0].x, pts[0].y, pts[1].x, pts[1].y);
  arrowHead(ctx, pts[0], pts[1], 8);
}

/** 既有 text 工具命中（自 drawDrawings.ts 迁入，行为不变） */
export function hitTestPlainText(drawing: Drawing, pts: Pix[], x: number, y: number): boolean {
  const p = pts[0];
  if (!p) return false;
  const w = (drawing.style.text ?? '').length * (drawing.style.fontSize ?? 12) * 0.6 + 8;
  const h = (drawing.style.fontSize ?? 12) + 8;
  return x >= p.x - 4 && x <= p.x + w && y >= p.y - 4 && y <= p.y + h;
}

/** 既有 info-line 渲染（自 drawDrawings.ts 迁入，行为不变）：连线 + 中点价差/百分比标签 */
export function drawInfoLine(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pix[], decimals: number): void {
  if (pts.length < 2) return;
  strokeLine(ctx, pts[0].x, pts[0].y, pts[1].x, pts[1].y);
  const p0 = d.points[0].price;
  const p1 = d.points[1].price;
  const diff = p1 - p0;
  const pct = p0 !== 0 ? (diff / p0) * 100 : 0;
  const midX = (pts[0].x + pts[1].x) / 2;
  const midY = (pts[0].y + pts[1].y) / 2;
  const text = `${diff >= 0 ? '+' : ''}${diff.toFixed(decimals)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
  ctx.font = `10px ${TV_FONT}`;
  ctx.fillStyle = theme.infoLabelBg;
  const w = ctx.measureText(text).width + 10;
  ctx.fillRect(midX - w / 2, midY - 9, w, 18);
  ctx.fillStyle = diff >= 0 ? theme.up : theme.down;
  ctx.textAlign = 'center';
  ctx.fillText(text, midX, midY);
}
