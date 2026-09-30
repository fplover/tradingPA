import type { Drawing } from './types';
import { TV_FONT } from '../theme';
import { distToSegment } from './geom';
import {
  drawFibArc,
  drawFibExtension,
  drawFibFan,
  drawFibRetracement,
  drawFibTimezone,
  hitTestFib,
} from './fibRender';
import {
  drawArrow,
  drawInfoLine,
  drawPlainText,
  drawTextFamily,
  hitTestPlainText,
  hitTestTextFamily,
} from './textRender';
import { drawMeasure, hitTestMeasure } from './measureRender';
import { drawShapes, hitTestShapes } from './shapeRender';
import { drawGann, hitTestGann } from './gannRender';
import { drawElliott, hitTestElliott } from './elliottRender';
import { drawLineFamily } from './lineRender';
import { drawHandles, strokeLine } from './drawingChrome';
import { pointToPixel, type DrawContext } from './coords';

// 画线坐标换算已抽至 coords.ts；此处 re-export 保持画线模块公开 API 不变。
export { pointToPixel, pixelToPoint, constrainPointPixel, type DrawContext, type MagnetMode } from './coords';
// 斐波那契家族（B6）：比率常量与纯几何抽至 fibMath.ts，渲染/命中抽至 fibRender.ts。
// P2-B：文字/测量/几何/江恩/艾略特五家族的渲染与命中同样各自成模块，此处只做分发。
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
    case 'text':
      return hitTestPlainText(drawing, pts, x, y) ? { part: 'body' } : null;
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
    // P2-B：文字类 4 种（框命中）
    case 'note':
    case 'price-label':
    case 'anchored-text':
    case 'arrow-mark':
      return hitTestTextFamily(drawing, pts, x, y) ? { part: 'body' } : null;
    // P2-B：测量（主轴 + 浮层框）
    case 'measure':
      return hitTestMeasure(drawing, pts, x, y, ctx.series) ? { part: 'body' } : null;
    // P2-B：几何 3 种（多边形内部/边、弧与曲线采样折线）
    case 'polygon':
    case 'arc':
    case 'curve':
      return hitTestShapes(drawing, pts, x, y) ? { part: 'body' } : null;
    // P2-B：江恩 3 件（射线族 / 箱体格线）
    case 'gann-fan':
    case 'gann-line':
    case 'gann-box':
      return hitTestGann(drawing, pts, x, y, ctx) ? { part: 'body' } : null;
    // P2-B：艾略特波浪（折线段）
    case 'elliott-wave':
      return hitTestElliott(pts, x, y) ? { part: 'body' } : null;
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

  switch (d.type) {
    case 'hline':
    case 'vline':
    case 'trendline':
    case 'ray':
      drawLineFamily(ctx, d, pts, dctx, decimals);
      break;
    case 'arrow':
      drawArrow(ctx, pts);
      break;
    case 'info-line':
      drawInfoLine(ctx, d, pts, decimals);
      break;
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
      strokeLine(ctx, pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      strokeLine(ctx, pts[0].x + ox, pts[0].y + oy, pts[1].x + ox, pts[1].y + oy);
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
    case 'text':
      drawPlainText(ctx, d, pts);
      break;
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
    // P2-B：文字类 4 种（便签/价格标签/锚定文本/箭头标记）
    case 'note':
    case 'price-label':
    case 'anchored-text':
    case 'arrow-mark':
      drawTextFamily(ctx, d, pts, decimals);
      break;
    // P2-B：测量（点线 + 浮层三行标签）
    case 'measure':
      drawMeasure(ctx, d, pts, dctx.series, decimals);
      break;
    // P2-B：几何 3 种（多边形/圆弧/曲线）
    case 'polygon':
    case 'arc':
    case 'curve':
      drawShapes(ctx, d, pts);
      break;
    // P2-B：江恩 3 件（扇形/江恩线/江恩箱）
    case 'gann-fan':
    case 'gann-line':
    case 'gann-box':
      drawGann(ctx, d, pts, dctx);
      break;
    // P2-B：艾略特波浪（5-3 标注组）
    case 'elliott-wave':
      drawElliott(ctx, pts);
      break;
  }
  ctx.setLineDash([]);
}
