import type { DrawGeometry } from './drawSeries';
import type { LegendInfo } from './legendTypes';
import { theme, TV_FONT } from '../theme';

/** 画布水印（P2 画布级特性）：主价格面板居中大号半透明文字，TV 画布页开关控制。
 *  文本复用图例既有字段（setLegend 每帧下发），不新增公开 API；关闭时由调用方
 *  提前 return，本模块零开销。 */

/** 水印文本：商品代码 + 周期（如 `BTCUSDT · 1D`，与图例首行同源同分隔符） */
export function watermarkText(legend: Pick<LegendInfo, 'symbol' | 'interval'>): string {
  return `${legend.symbol} · ${legend.interval}`;
}

/** 绘制居中水印（调用方已 translate 到主面板左上角，geo 为面板局部几何）。
 *  低透明度 + 随主题色，不干扰行情；文本超宽时收缩字号至面板 90% 宽度内。 */
export function drawWatermark(ctx: CanvasRenderingContext2D, text: string, geo: DrawGeometry): void {
  if (!text) return;
  ctx.save();
  // 字号随面板尺寸缩放（TV 观感：大而不抢戏），上下限 24~72px
  let size = Math.max(24, Math.min(72, Math.round(Math.min(geo.chartW / 9, geo.chartH / 5))));
  ctx.font = `${size}px ${TV_FONT}`;
  const maxW = geo.chartW * 0.9;
  const tw = ctx.measureText(text).width;
  if (tw > maxW) {
    size = Math.max(12, Math.round((size * maxW) / tw));
    ctx.font = `${size}px ${TV_FONT}`;
  }
  ctx.fillStyle = theme.watermark;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, geo.chartW / 2, geo.chartH / 2);
  ctx.restore();
}
