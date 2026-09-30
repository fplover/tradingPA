/** 线族工具渲染（P2-B 自 drawDrawings.ts 拆出）：水平线 / 垂直线 / 趋势线 / 射线。
 *  与 drawDrawings 内联实现逐字一致（拆分红线，命中测试仍走 drawDrawings 的合并分支）。
 *  约定：调用方（drawOne）已设置 strokeStyle/fillStyle/lineWidth/setLineDash。 */
import type { Drawing } from './types';
import { axisLabel, strokeLine } from './drawingChrome';
import type { DrawContext } from './coords';

type Pix = { x: number; y: number };

/** 线族渲染分发（4 种） */
export function drawLineFamily(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pix[], dctx: DrawContext, decimals: number): void {
  switch (d.type) {
    case 'hline': {
      const y = Math.round(pts[0].y) + 0.5;
      strokeLine(ctx, 0, y, dctx.geo.chartW, y);
      axisLabel(ctx, d.points[0].price.toFixed(decimals), dctx.geo.chartW - 4, pts[0].y, 'right');
      break;
    }
    case 'vline': {
      const x = Math.round(pts[0].x) + 0.5;
      strokeLine(ctx, x, 0, x, dctx.geo.chartH);
      break;
    }
    case 'trendline':
      if (pts.length >= 2) strokeLine(ctx, pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      break;
    case 'ray': {
      if (pts.length < 2) break;
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const scale = dx === 0 ? 1 : (dctx.geo.chartW - pts[0].x) / dx;
      strokeLine(ctx, pts[0].x, pts[0].y, pts[0].x + dx * Math.max(scale, 0), pts[0].y + dy * Math.max(scale, 0));
      break;
    }
  }
}
