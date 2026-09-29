import type { Drawing } from './types';
import { theme, TV_FONT } from '../theme';
import { distToSegment } from './geom';
import {
  drawFibArc,
  drawFibExtension,
  drawFibFan,
  drawFibRetracement,
  drawFibTimezone,
  hitTestFib,
} from './fibRender';
import { pointToPixel, type DrawContext } from './coords';

// 画线坐标换算已抽至 coords.ts；此处 re-export 保持画线模块公开 API 不变。
export { pointToPixel, pixelToPoint, type DrawContext, type MagnetMode } from './coords';
// 斐波那契家族（B6）：比率常量与纯几何抽至 fibMath.ts，渲染/命中抽至 fibRender.ts。
// 此处 re-export 保持画线模块公开 API 不变（调用方与既有测试无需改 import 路径）。
export {
  FIB_ARC_LEVELS,
  FIB_EXTENSION_LEVELS,
  FIB_FAN_LEVELS,
  FIB_RETRACEMENT_LEVELS,
  FIB_ZONE_COUNT,
  detectVisibleSwing,
  fibArcAngles,
  fibArcHit,
  fibExtensionPrice,
  fibFanEdgePrice,
  fibRetracementPrice,
  fibZoneOffsets,
  fibZoneTimes,
} from './fibMath';

/** 命中测试：返回 'body' / 'handle:i' / null */
export function hitTestDrawing(
  drawing: Drawing,
  x: number,
  y: number,
  ctx: DrawContext,
): { part: 'body' } | { part: 'handle'; index: number } | null {
  const pts = drawing.points.map((p) => pointToPixel(p, ctx));
  // 手柄优先
  for (let i = 0; i < pts.length; i++) {
    if (Math.hypot(x - pts[i].x, y - pts[i].y) <= 7) return { part: 'handle', index: i };
  }
  switch (drawing.type) {
    case 'hline': {
      const py = pts[0]?.y;
      return py !== undefined && Math.abs(y - py) <= 5 ? { part: 'body' } : null;
    }
    case 'vline': {
      const px = pts[0]?.x;
      return px !== undefined && Math.abs(x - px) <= 5 ? { part: 'body' } : null;
    }
    case 'text': {
      const p = pts[0];
      if (!p) return null;
      const w = (drawing.style.text ?? '').length * (drawing.style.fontSize ?? 12) * 0.6 + 8;
      const h = (drawing.style.fontSize ?? 12) + 8;
      return x >= p.x - 4 && x <= p.x + w && y >= p.y - 4 && y <= p.y + h ? { part: 'body' } : null;
    }
    case 'rect':
    case 'ellipse': {
      if (pts.length < 2) return null;
      const minX = Math.min(pts[0].x, pts[1].x);
      const maxX = Math.max(pts[0].x, pts[1].x);
      const minY = Math.min(pts[0].y, pts[1].y);
      const maxY = Math.max(pts[0].y, pts[1].y);
      const inside = x >= minX && x <= maxX && y >= minY && y <= maxY;
      if (!inside) return null;
      const onEdge = distToSegment(x, y, minX, minY, maxX, minY) <= 5 || distToSegment(x, y, minX, maxY, maxX, maxY) <= 5 || distToSegment(x, y, minX, minY, minX, maxY) <= 5 || distToSegment(x, y, maxX, minY, maxX, maxY) <= 5;
      return onEdge || drawing.type === 'rect' ? { part: 'body' } : null;
    }
    case 'path': {
      for (let i = 0; i < pts.length - 1; i++) {
        if (distToSegment(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= 6) return { part: 'body' };
      }
      return null;
    }
    case 'fib':
    case 'fib-auto':
    case 'fib-extension':
    case 'fib-fan':
    case 'fib-arc':
    case 'fib-timezone':
      // 斐波那契家族：命中规则与渲染线组一一对应（fibRender.hitTestFib）
      return hitTestFib(drawing, pts, x, y, ctx) ? { part: 'body' } : null;
    case 'channel':
    case 'info-line':
    case 'trendline':
    case 'ray':
    case 'arrow': {
      if (pts.length < 2) return null;
      if (distToSegment(x, y, pts[0].x, pts[0].y, pts[1].x, pts[1].y) <= 6) return { part: 'body' };
      if (drawing.type === 'channel' && pts.length >= 3) {
        const ox = pts[2].x - pts[0].x;
        const oy = pts[2].y - pts[0].y;
        if (distToSegment(x, y, pts[0].x + ox, pts[0].y + oy, pts[1].x + ox, pts[1].y + oy) <= 6) return { part: 'body' };
      }
      return null;
    }
    default:
      return null;
  }
}

/** 渲染全部画线（面板局部坐标） */
export function drawDrawings(
  ctx: CanvasRenderingContext2D,
  drawings: readonly Drawing[],
  selectedId: string | null,
  dctx: DrawContext,
  decimals: number,
  /** B7 多选：除主锚外还需画手柄的对象 id（Ctrl+点击多选态） */
  multiSelected: readonly string[] = [],
): void {
  const selected = new Set(multiSelected);
  if (selectedId) selected.add(selectedId);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, dctx.geo.chartW, dctx.geo.chartH);
  ctx.clip();
  for (const d of drawings) {
    if (!d.visible) continue;
    drawOne(ctx, d, dctx, decimals);
    if (selected.has(d.id)) drawHandles(ctx, d, dctx);
  }
  ctx.restore();
}

function drawOne(ctx: CanvasRenderingContext2D, d: Drawing, dctx: DrawContext, decimals: number): void {
  const pts = d.points.map((p) => pointToPixel(p, dctx));
  if (pts.length === 0) return;
  ctx.strokeStyle = d.style.color;
  ctx.fillStyle = d.style.color;
  ctx.lineWidth = d.style.lineWidth;
  ctx.setLineDash(d.style.dash ? [6, 4] : []);
  ctx.font = `${d.style.fontSize ?? 12}px ${TV_FONT}`;
  ctx.textBaseline = 'middle';

  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  switch (d.type) {
    case 'hline': {
      const y = Math.round(pts[0].y) + 0.5;
      line(0, y, dctx.geo.chartW, y);
      label(ctx, d.points[0].price.toFixed(decimals), dctx.geo.chartW - 4, pts[0].y, 'right');
      break;
    }
    case 'vline': {
      const x = Math.round(pts[0].x) + 0.5;
      line(x, 0, x, dctx.geo.chartH);
      break;
    }
    case 'trendline':
      if (pts.length >= 2) line(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      break;
    case 'ray': {
      if (pts.length < 2) break;
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const scale = dx === 0 ? 1 : (dctx.geo.chartW - pts[0].x) / dx;
      line(pts[0].x, pts[0].y, pts[0].x + dx * Math.max(scale, 0), pts[0].y + dy * Math.max(scale, 0));
      break;
    }
    case 'arrow': {
      if (pts.length < 2) break;
      line(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      const size = 8;
      ctx.beginPath();
      ctx.moveTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[1].x - size * Math.cos(angle - 0.4), pts[1].y - size * Math.sin(angle - 0.4));
      ctx.lineTo(pts[1].x - size * Math.cos(angle + 0.4), pts[1].y - size * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'info-line': {
      if (pts.length < 2) break;
      line(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      const p0 = d.points[0].price;
      const p1 = d.points[1].price;
      const diff = p1 - p0;
      const pct = p0 !== 0 ? (diff / p0) * 100 : 0;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const text = `${diff >= 0 ? '+' : ''}${diff.toFixed(decimals)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
      ctx.fillStyle = theme.infoLabelBg;
      const w = ctx.measureText(text).width + 10;
      ctx.fillRect(midX - w / 2, midY - 9, w, 18);
      ctx.fillStyle = diff >= 0 ? theme.up : theme.down;
      ctx.textAlign = 'center';
      ctx.fillText(text, midX, midY);
      break;
    }
    case 'channel': {
      if (pts.length < 3) break;
      const ox = pts[2].x - pts[0].x;
      const oy = pts[2].y - pts[0].y;
      ctx.fillStyle = d.style.fillColor ?? '#2962ff22';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[1].x + ox, pts[1].y + oy);
      ctx.lineTo(pts[0].x + ox, pts[0].y + oy);
      ctx.closePath();
      ctx.fill();
      line(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      line(pts[0].x + ox, pts[0].y + oy, pts[1].x + ox, pts[1].y + oy);
      break;
    }
    case 'rect': {
      if (pts.length < 2) break;
      const x = Math.min(pts[0].x, pts[1].x);
      const y = Math.min(pts[0].y, pts[1].y);
      const w = Math.abs(pts[1].x - pts[0].x);
      const h = Math.abs(pts[1].y - pts[0].y);
      ctx.fillStyle = d.style.fillColor ?? '#2962ff22';
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      break;
    }
    case 'ellipse': {
      if (pts.length < 2) break;
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      const rx = Math.abs(pts[1].x - pts[0].x) / 2;
      const ry = Math.abs(pts[1].y - pts[0].y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = d.style.fillColor ?? '#2962ff22';
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'path': {
      if (pts.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      break;
    }
    case 'text': {
      const text = d.style.text ?? '';
      ctx.fillStyle = d.style.color;
      ctx.textAlign = 'left';
      ctx.fillText(text, pts[0].x, pts[0].y);
      break;
    }
    case 'fib':
    case 'fib-auto':
      drawFibRetracement(ctx, d, pts, dctx, decimals);
      break;
    case 'fib-extension':
      drawFibExtension(ctx, d, pts, dctx, decimals);
      break;
    case 'fib-fan':
      drawFibFan(ctx, d, pts, dctx);
      break;
    case 'fib-arc':
      drawFibArc(ctx, pts);
      break;
    case 'fib-timezone':
      drawFibTimezone(ctx, d, pts, dctx);
      break;
  }
  ctx.setLineDash([]);
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign) {
  ctx.font = `10px ${TV_FONT}`;
  ctx.textAlign = align;
  ctx.fillStyle = theme.axisText;
  ctx.fillText(text, x, y);
}

function drawHandles(ctx: CanvasRenderingContext2D, d: Drawing, dctx: DrawContext): void {
  for (const p of d.points) {
    const { x, y } = pointToPixel(p, dctx);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = d.style.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
