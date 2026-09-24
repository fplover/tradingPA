import type { Bar } from '@/types/market';
import type { Crosshair } from '../crosshair/Crosshair';
import type { Viewport } from '../viewport/Viewport';
import type { PriceScale } from '../scale/PriceScale';
import { theme, TV_FONT } from '../theme';
import type { DrawGeometry } from './drawSeries';
import { formatTime } from './drawAxes';

export interface LegendInfo {
  symbol: string;
  interval: string;
  decimals: number;
  exchange?: string;
}

/** 十字光标：虚线 + 价格轴标签 + 时间轴标签 */
export function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  crosshair: Crosshair,
  viewport: Viewport,
  priceScale: PriceScale,
  geo: DrawGeometry,
  legend: LegendInfo,
  paneY = 0,
  paneHeight = geo.chartH,
): void {
  if (!crosshair.visible) return;

  // 虚线（水平限悬停面板内，垂直吸附 bar 中心并贯穿全高）
  const snapX = viewport.indexToX(crosshair.barIndex);
  ctx.strokeStyle = theme.crosshair;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, Math.round(crosshair.y) + 0.5);
  ctx.lineTo(geo.chartW, Math.round(crosshair.y) + 0.5);
  ctx.moveTo(Math.round(snapX) + 0.5, paneY);
  ctx.lineTo(Math.round(snapX) + 0.5, paneY + paneHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // 价格轴标签（价格按悬停面板的相对坐标换算）
  const price = priceScale.yToPrice(crosshair.y - paneY);
  drawAxisLabel(ctx, geo.chartW + 1, crosshair.y, priceScale.toLabel(price, legend.decimals), 'price');

  // 时间轴标签
  const time = crosshair.barIndex >= 0 ? crosshair.time : 0;
  if (time > 0) {
    drawAxisLabel(ctx, snapX, geo.chartH + 1, formatTime(time, viewport.spacing), 'time');
  }
}

/**
 * 左上角图例：常驻单行（TradingView 样式）。
 * 代码加粗 + 周期/交易所灰字 + O H L C 按该根涨跌着色 + 涨跌幅 + 量；
 * 悬停时跟随十字光标，否则显示最后一根。叠加指标值换行附在其下。
 */
export function drawLegendBlock(
  ctx: CanvasRenderingContext2D,
  bar: Bar | undefined,
  legend: LegendInfo,
  indicatorValues?: Array<{ name: string; values: Array<{ label: string; value: number }> }>,
): void {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  let x = 8;
  const y = 6;
  // TV 图例：代码行 16px、其余 13px，字重 400（观感粗来自字号而非 weight）
  ctx.font = `16px ${TV_FONT}`;
  ctx.fillStyle = theme.legendText;
  ctx.fillText(legend.symbol, x, y);
  x += ctx.measureText(legend.symbol).width;

  ctx.font = `13px ${TV_FONT}`;
  const meta = ` · ${legend.interval}${legend.exchange ? ` · ${legend.exchange}` : ''}`;
  ctx.fillStyle = theme.legendDim;
  ctx.fillText(meta, x, y);
  x += ctx.measureText(meta).width + 14;

  if (bar) {
    const d = legend.decimals;
    const change = bar.close - bar.open;
    const changePct = bar.open !== 0 ? (change / bar.open) * 100 : 0;
    const color = bar.close >= bar.open ? theme.up : theme.down;
    const sign = change >= 0 ? '+' : '';
    const fields: Array<[string, string, string]> = [
      ['开=', bar.open.toFixed(d), color],
      ['高=', bar.high.toFixed(d), color],
      ['低=', bar.low.toFixed(d), color],
      ['收=', bar.close.toFixed(d), color],
      ['涨跌', `${sign}${change.toFixed(d)} (${sign}${changePct.toFixed(2)}%)`, color],
      ['量', formatVolume(bar.volume), theme.legendDim],
    ];
    for (const [label, value, c] of fields) {
      if (label) {
        ctx.fillStyle = theme.legendDim;
        ctx.fillText(label, x, y);
        x += ctx.measureText(label).width + 4;
      }
      ctx.fillStyle = c;
      ctx.fillText(value, x, y);
      x += ctx.measureText(value).width + 10;
    }
  }

  if (indicatorValues && indicatorValues.length > 0) {
    let iy = 28;
    ctx.font = `13px ${TV_FONT}`;
    for (const ind of indicatorValues) {
      if (ind.values.length === 0) continue;
      let ix = 8;
      ctx.fillStyle = theme.legendDim;
      ctx.fillText(ind.name, ix, iy);
      ix += ctx.measureText(ind.name).width + 6;
      for (const v of ind.values) {
        ctx.fillStyle = theme.legendText;
        const text = `${v.label} ${formatIndicatorValue(v.value)}`;
        ctx.fillText(text, ix, iy);
        ix += ctx.measureText(text).width + 8;
      }
      iy += 16;
    }
  }
  ctx.restore();
}

function formatIndicatorValue(v: number): string {
  if (Math.abs(v) >= 1000) return v.toFixed(2);
  if (Math.abs(v) >= 1) return v.toFixed(3);
  return v.toFixed(4);
}

function drawAxisLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  kind: 'price' | 'time',
): void {
  ctx.font = `11px ${TV_FONT}`;
  const w = ctx.measureText(text).width + 12;
  const h = 18;
  let bx = x - w / 2;
  let by = y - h / 2;
  if (kind === 'price') {
    bx = x + 2;
    by = Math.max(0, Math.min(by, 9999));
  } else {
    bx = Math.max(0, bx);
    by = y + 3;
  }
  ctx.fillStyle = theme.tooltipBg;
  ctx.fillRect(bx, by, w, h);
  ctx.fillStyle = theme.axisLabelText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + w / 2, by + h / 2);
}

function formatVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return v.toFixed(2);
}
