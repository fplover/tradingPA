/** 线族工具渲染（P2-B 自 drawDrawings.ts 拆出）：水平线 / 垂直线 / 趋势线 / 射线。
 *  与 drawDrawings 内联实现逐字一致（拆分红线，命中测试仍走 drawDrawings 的合并分支）。
 *  约定：调用方（drawOne）已设置 strokeStyle/fillStyle/lineWidth/setLineDash。 */
import type { Drawing } from './types';
import { axisLabel, strokeLine } from './drawingChrome';
import type { DrawContext } from './coords';

type Pix = { x: number; y: number };

/** 线族渲染分发（4 种） */
export function drawLineFamily(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  pts: Pix[],
  dctx: DrawContext,
  decimals: number,
): void {
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
      // 向落点方向延伸到画布边缘：左/右缘由 dx 符号决定（同 fibRender.fanRayEndPix 口径），
      // 修复向左画射线时 (chartW - x)/dx 为负被 Math.max 钳成 0 而退化成点。
      // dx === 0（垂直射线）保留原行为：延伸一个落点段。
      const edgeX = dx >= 0 ? dctx.geo.chartW : 0;
      const scale = dx === 0 ? 1 : (edgeX - pts[0].x) / dx;
      strokeLine(ctx, pts[0].x, pts[0].y, pts[0].x + dx * scale, pts[0].y + dy * scale);
      break;
    }
  }
}
